import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

let client: SESv2Client | null = null;

export function isEmailConfigured(): boolean {
  const hasCredentials = Boolean(
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
      // Running on ECS/EKS with an IAM task role: the SDK picks the credentials up by itself.
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE,
  );
  return Boolean(process.env.SES_FROM_EMAIL && hasCredentials);
}

// Lazy so the .env file is already loaded when credentials are read.
function getClient(): SESv2Client {
  if (!client) {
    client = new SESv2Client({
      region: process.env.AWS_SES_REGION || process.env.AWS_REGION || "us-east-1",
    });
  }
  return client;
}

export interface SendResult {
  sent: boolean;
  skipped?: boolean;
  error?: string;
}

export async function sendEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  if (!isEmailConfigured()) {
    console.log(`[Email] SES not configured - skipped "${opts.subject}" to ${opts.to}`);
    return { sent: false, skipped: true };
  }
  try {
    await getClient().send(
      new SendEmailCommand({
        FromEmailAddress: process.env.SES_FROM_EMAIL,
        ReplyToAddresses: process.env.SES_REPLY_TO ? [process.env.SES_REPLY_TO] : undefined,
        Destination: { ToAddresses: [opts.to] },
        Content: {
          Simple: {
            Subject: { Data: opts.subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: opts.html, Charset: "UTF-8" },
              Text: { Data: opts.text, Charset: "UTF-8" },
            },
          },
        },
      }),
    );
    console.log(`[Email] Sent "${opts.subject}" to ${opts.to}`);
    return { sent: true };
  } catch (err: any) {
    const message = `${err?.name ?? "Error"}: ${err?.message ?? err}`;
    console.warn(`[Email] Failed to send "${opts.subject}" to ${opts.to}:`, message);
    return { sent: false, error: message };
  }
}

// ───────────────────────── templates ─────────────────────────

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(heading: string, bodyHtml: string, footerNote = "You're receiving this because you have a Hadaf account."): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:3px;">HADAF</div>
          <div style="color:#a1a1aa;font-size:12px;margin-top:4px;">Set goals. Stay focused. Reach your Hadaf.</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;color:#0a0a0a;">${heading}</h1>
          <div style="font-size:15px;line-height:1.6;color:#3f3f46;">${bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#fafafa;color:#a1a1aa;font-size:12px;">${footerNote}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const greet = (name: string | null): string => (name ? esc(name.split(" ")[0]) : "there");

export function welcomeEmail(name: string | null): { subject: string; html: string; text: string } {
  return {
    subject: "Welcome to Hadaf",
    html: layout(
      `Welcome, ${greet(name)}!`,
      `<p>Your Hadaf account is ready. For the next <strong>5 days</strong> every feature is unlocked - focus sessions, goals, analytics and app blocking.</p>
       <p>Start with one focus session today. Small wins build the streak.</p>`,
    ),
    text: `Welcome, ${name ? name.split(" ")[0] : "there"}! Your Hadaf account is ready. For the next 5 days every feature is unlocked. Start with one focus session today.`,
  };
}

export type PaymentKind = "purchase" | "renewal" | "cancellation" | "billing_issue" | "expiration";

export function paymentEmail(
  name: string | null,
  kind: PaymentKind,
  d: { amount?: string | null; expiresAt?: Date | null },
): { subject: string; html: string; text: string } {
  const until = d.expiresAt ? d.expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null;
  const copy: Record<PaymentKind, { subject: string; heading: string; body: string }> = {
    purchase: {
      subject: "Payment received - welcome to Hadaf Pro",
      heading: "You're Pro now",
      body: `<p>Thanks, ${greet(name)}! We received your payment${d.amount ? ` of <strong>${esc(d.amount)}</strong>` : ""}.</p><p>All features are unlocked with no limits${until ? `, and your plan renews on <strong>${until}</strong>` : ""}.</p>`,
    },
    renewal: {
      subject: "Your Hadaf Pro subscription renewed",
      heading: "Subscription renewed",
      body: `<p>Your Hadaf Pro subscription renewed${d.amount ? ` (<strong>${esc(d.amount)}</strong>)` : ""}.${until ? ` Your next renewal is on <strong>${until}</strong>.` : ""}</p>`,
    },
    cancellation: {
      subject: "Your Hadaf Pro subscription was cancelled",
      heading: "Subscription cancelled",
      body: `<p>We've cancelled your Hadaf Pro renewal.${until ? ` You keep full access until <strong>${until}</strong>.` : ""}</p><p>Changed your mind? You can resubscribe anytime from the Subscription screen in the app.</p>`,
    },
    billing_issue: {
      subject: "Action needed: we couldn't process your payment",
      heading: "Payment problem",
      body: `<p>We couldn't charge your payment method for Hadaf Pro. Please update it in Google Play so you don't lose access.</p>`,
    },
    expiration: {
      subject: "Your Hadaf Pro subscription has ended",
      heading: "Pro has ended",
      body: `<p>Your Hadaf Pro access has ended and your account is back on the limited free plan.</p><p>Upgrade again from the Subscription screen to unlock everything.</p>`,
    },
  };
  const c = copy[kind];
  return {
    subject: c.subject,
    html: layout(c.heading, c.body, "This is a payment notification for your Hadaf account."),
    text: c.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  };
}

export function appUpdateEmail(
  name: string | null,
  d: { version: string; headline?: string; notes: string[] },
): { subject: string; html: string; text: string } {
  const list = d.notes.map((n) => `<li style="margin-bottom:6px;">${esc(n)}</li>`).join("");
  return {
    subject: `Hadaf ${d.version} is here`,
    html: layout(
      esc(d.headline || `Hadaf ${d.version} is available`),
      `<p>Hi ${greet(name)}, a new version of Hadaf is out. Here's what's new:</p><ul style="padding-left:20px;">${list}</ul><p>Open Google Play and update to get the latest improvements.</p>`,
      "You're receiving this app update alert because you have a Hadaf account.",
    ),
    text: `Hi ${name ?? "there"}, Hadaf ${d.version} is out. What's new: ${d.notes.join("; ")}. Update from Google Play.`,
  };
}

// ───────────────────────── triggers ─────────────────────────

/** Sends the welcome email once per user, as soon as we know their email address. */
export async function maybeSendWelcomeEmail(userId: string): Promise<void> {
  try {
    const [u] = await db
      .select({ email: usersTable.email, name: usersTable.name, sentAt: usersTable.welcomeEmailSentAt })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!u || !u.email || u.sentAt) return;

    // Mark first so concurrent requests can't send it twice.
    await db.update(usersTable).set({ welcomeEmailSentAt: new Date() }).where(eq(usersTable.id, userId));
    const mail = welcomeEmail(u.name);
    const result = await sendEmail({ to: u.email, ...mail });
    if (!result.sent && !result.skipped) {
      // Sending genuinely failed - allow a retry next time.
      await db.update(usersTable).set({ welcomeEmailSentAt: null }).where(eq(usersTable.id, userId));
    } else if (result.skipped) {
      await db.update(usersTable).set({ welcomeEmailSentAt: null }).where(eq(usersTable.id, userId));
    }
  } catch (err: any) {
    console.warn("[Email] maybeSendWelcomeEmail failed:", err?.message ?? err);
  }
}
