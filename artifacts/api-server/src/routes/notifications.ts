import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, usersTable, notificationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { buildGuiltNotifications, generateGuiltPreview } from "../lib/guilt";
import { isBedrockConfigured } from "../lib/bedrock";

const router: IRouter = Router();

const parseTz = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= 14 * 60 ? Math.round(n) : 0;
};

/**
 * Called by the app every time it comes to the foreground.
 *  - immediate: guilt messages about things that already happened (show once)
 *  - scheduled: messages the phone should schedule locally (inactivity, goals about to be missed)
 * Logs all given notifications to the database.
 */
router.get("/notifications/guilt", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const tz = parseTz(req.query.tz);
  try {
    const [row] = await db
      .select({ lastActiveAt: usersTable.lastActiveAt })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    const previous = row?.lastActiveAt ?? null;
    await db.update(usersTable).set({ lastActiveAt: new Date() }).where(eq(usersTable.id, userId));

    const result = await buildGuiltNotifications(userId, tz, previous);

    // Save records of given notifications in the database
    for (const item of [...result.immediate, ...result.scheduled]) {
      try {
        await db.insert(notificationsTable).values({
          userId,
          type: "guilt",
          trigger: item.trigger,
          title: item.title,
          body: item.body,
          metadata: { id: item.id, fireAt: item.fireAt ?? null },
        });
      } catch (insertErr) {
        // Safe logger
      }
    }

    res.json(result);
  } catch (err: any) {
    console.warn("[Guilt] Failed to build notifications:", err?.message ?? err);
    res.json({ immediate: [], scheduled: [] });
  }
});

/**
 * Fetch all notifications that were given to this user
 */
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  try {
    const items = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, req.userId!))
      .orderBy(desc(notificationsTable.sentAt))
      .limit(50);
    res.json(items);
  } catch (err: any) {
    console.warn("[Notifications] Failed to fetch history:", err?.message ?? err);
    res.status(500).json({ error: "Failed to fetch notification history" });
  }
});

/**
 * Debug: GET /api/notifications/guilt/preview?trigger=missed_goal|failed_focus|inactive
 * Shows the generated copy plus the exact Bedrock error if credentials / model access are wrong.
 */
router.get("/notifications/guilt/preview", requireAuth, async (req, res): Promise<void> => {
  const t = String(req.query.trigger ?? "missed_goal");
  const trigger = (["missed_goal", "failed_focus", "inactive"].includes(t) ? t : "missed_goal") as
    | "missed_goal"
    | "failed_focus"
    | "inactive";
  try {
    const item = await generateGuiltPreview(req.userId!, trigger, parseTz(req.query.tz));
    res.json({ bedrockConfigured: isBedrockConfigured(), model: process.env.BEDROCK_MODEL_ID || "(default)", item });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Preview failed" });
  }
});

export default router;
