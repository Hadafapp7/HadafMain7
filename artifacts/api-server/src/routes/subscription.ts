import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getUserPlan } from "../lib/plan";
import { paymentEmail, sendEmail, type PaymentKind } from "../lib/email";

const router: IRouter = Router();

const entitlementId = () => process.env.REVENUECAT_ENTITLEMENT_ID || "pro";

async function setSubscription(userId: string, tier: "pro" | "free", expiresAt: Date | null): Promise<void> {
  await db
    .update(usersTable)
    .set({ subscriptionTier: tier, subscriptionExpiresAt: expiresAt })
    .where(eq(usersTable.id, userId));
}

async function notifyPayment(userId: string, kind: PaymentKind, amount: string | null, expiresAt: Date | null): Promise<void> {
  const [u] = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!u?.email) return; // phone-only accounts have no email to notify
  await sendEmail({ to: u.email, ...paymentEmail(u.name, kind, { amount, expiresAt }) });
}

/** Current plan for the signed-in user (trial / limited / pro) + feature limits. */
router.get("/subscription/status", requireAuth, async (req, res): Promise<void> => {
  try {
    res.json(await getUserPlan(req.userId!));
  } catch (err: any) {
    console.error("[Subscription] status error:", err?.message ?? err);
    res.status(500).json({ error: "Failed to load subscription status" });
  }
});

/**
 * The app calls this right after a purchase / restore. It asks RevenueCat directly
 * (REST API) so the user gets Pro instantly instead of waiting for the webhook.
 */
router.post("/subscription/sync", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const secret = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secret) {
    res.json({ synced: false, reason: "REVENUECAT_SECRET_API_KEY is not set", ...(await getUserPlan(userId)) });
    return;
  }
  try {
    const rc = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    });
    if (!rc.ok) {
      console.warn("[Subscription] RevenueCat sync HTTP", rc.status);
      res.json({ synced: false, reason: `RevenueCat returned ${rc.status}`, ...(await getUserPlan(userId)) });
      return;
    }
    const data = (await rc.json()) as any;
    const ent = data?.subscriber?.entitlements?.[entitlementId()];
    const expires = ent?.expires_date ? new Date(ent.expires_date) : null;
    const active = Boolean(ent) && (!expires || expires.getTime() > Date.now());
    await setSubscription(userId, active ? "pro" : "free", active ? expires : null);
    res.json({ synced: true, ...(await getUserPlan(userId)) });
  } catch (err: any) {
    console.error("[Subscription] sync error:", err?.message ?? err);
    res.status(500).json({ error: "Failed to sync subscription" });
  }
});

/**
 * RevenueCat webhook. Configure in RevenueCat → Project settings → Integrations → Webhooks:
 *   URL: https://<your-public-api-host>/api/webhooks/revenuecat
 *   Authorization header: the exact value you put in REVENUECAT_WEBHOOK_AUTH
 */
router.post("/webhooks/revenuecat", async (req, res): Promise<void> => {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  const header = req.headers.authorization ?? "";
  if (!expected || (header !== expected && header !== `Bearer ${expected}`)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const ev = (req.body as any)?.event;
    if (!ev?.type) {
      res.status(200).json({ ok: true, ignored: "no event" });
      return;
    }

    // Our app_user_id is the Clerk user id (set via Purchases.logIn). Check aliases too.
    const candidates: string[] = [ev.app_user_id, ev.original_app_user_id, ...(Array.isArray(ev.aliases) ? ev.aliases : [])]
      .filter((x: unknown): x is string => typeof x === "string" && x.length > 0);
    const found = candidates.length
      ? await db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.id, candidates))
      : [];
    const userId = found[0]?.id;
    if (!userId) {
      console.log(`[RevenueCat] ${ev.type}: no matching user for`, candidates);
      res.status(200).json({ ok: true, ignored: "unknown user" });
      return;
    }

    const expiresAt: Date | null = ev.expiration_at_ms ? new Date(Number(ev.expiration_at_ms)) : null;
    const price = ev.price_in_purchased_currency ?? ev.price;
    const amount = price != null && ev.currency ? `${Number(price).toFixed(2)} ${ev.currency}` : null;
    console.log(`[RevenueCat] ${ev.type} for ${userId} (expires ${expiresAt?.toISOString() ?? "n/a"})`);

    switch (ev.type) {
      case "INITIAL_PURCHASE":
        await setSubscription(userId, "pro", expiresAt);
        void notifyPayment(userId, "purchase", amount, expiresAt);
        break;
      case "RENEWAL":
        await setSubscription(userId, "pro", expiresAt);
        void notifyPayment(userId, "renewal", amount, expiresAt);
        break;
      case "PRODUCT_CHANGE":
      case "UNCANCELLATION":
      case "NON_RENEWING_PURCHASE":
        await setSubscription(userId, "pro", expiresAt);
        break;
      case "CANCELLATION":
        // Auto-renew turned off; access continues until expiry.
        if (expiresAt) await setSubscription(userId, "pro", expiresAt);
        void notifyPayment(userId, "cancellation", null, expiresAt);
        break;
      case "BILLING_ISSUE":
        void notifyPayment(userId, "billing_issue", null, null);
        break;
      case "EXPIRATION":
        await setSubscription(userId, "free", null);
        void notifyPayment(userId, "expiration", null, null);
        break;
      default:
        break; // TEST and other events: acknowledge only
    }
    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[RevenueCat] webhook error:", err?.message ?? err);
    // 500 makes RevenueCat retry later.
    res.status(500).json({ error: "Webhook processing failed" });
  }
});


/**
 * Developer / testing endpoint to toggle tiers instantly during development.
 */
router.post("/subscription/test-plan", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { plan } = req.body as { plan: "pro" | "trial" | "limited" };
  const now = new Date();
  if (plan === "pro") {
    const oneMonth = new Date(Date.now() + 30 * 86_400_000);
    await db.update(usersTable).set({ subscriptionTier: "pro", subscriptionExpiresAt: oneMonth }).where(eq(usersTable.id, userId));
  } else if (plan === "limited") {
    const sixDaysAgo = new Date(Date.now() - 6 * 86_400_000);
    await db.update(usersTable).set({ subscriptionTier: "free", trialStartedAt: sixDaysAgo, subscriptionExpiresAt: null }).where(eq(usersTable.id, userId));
  } else {
    await db.update(usersTable).set({ subscriptionTier: "free", trialStartedAt: now, subscriptionExpiresAt: null }).where(eq(usersTable.id, userId));
  }
  res.json(await getUserPlan(userId));
});

export default router;
