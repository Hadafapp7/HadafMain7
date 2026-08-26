import { Router, type IRouter } from "express";
import { db, moodLogsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { awardXpAndCheckBadges } from "../utils/gamification.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router: IRouter = Router();

router.post("/mood-logs", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { moodScore, moodLabel, note } = req.body || {};

  if (!moodScore || typeof moodScore !== "number" || moodScore < 1 || moodScore > 5) {
    res.status(400).json({ error: "moodScore must be a number between 1 and 5" });
    return;
  }

  const label = typeof moodLabel === "string" && moodLabel.trim() ? moodLabel.trim() : "Good";
  const today = new Date().toISOString().slice(0, 10);

  try {
    const [existing] = await db
      .select()
      .from(moodLogsTable)
      .where(and(eq(moodLogsTable.userId, userId), eq(moodLogsTable.date, today)));

    let result;
    let xpAwarded = 0;

    if (existing) {
      const [updated] = await db
        .update(moodLogsTable)
        .set({
          moodScore,
          moodLabel: label,
          note: typeof note === "string" ? note.trim() : null,
        })
        .where(eq(moodLogsTable.id, existing.id))
        .returning();
      result = updated;
    } else {
      const [inserted] = await db
        .insert(moodLogsTable)
        .values({
          userId,
          moodScore,
          moodLabel: label,
          note: typeof note === "string" ? note.trim() : null,
          date: today,
        })
        .returning();
      result = inserted;

      try {
        await awardXpAndCheckBadges(userId, 15);
        xpAwarded = 15;
      } catch (xpErr) {
        console.warn("[MoodLog] XP award error:", xpErr);
      }
    }

    res.status(200).json({ log: result, xpAwarded });
  } catch (err: any) {
    console.error("[MoodLog] Save error:", err);
    res.status(500).json({ error: "Failed to save mood check" });
  }
});

router.get("/mood-logs/today", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const [log] = await db
      .select()
      .from(moodLogsTable)
      .where(and(eq(moodLogsTable.userId, userId), eq(moodLogsTable.date, today)));

    res.status(200).json({ logged: !!log, log: log || null });
  } catch (err: any) {
    console.error("[MoodLog] Get today error:", err);
    res.status(500).json({ error: "Failed to fetch today's mood log" });
  }
});

router.get("/mood-logs/history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const logs = await db
      .select()
      .from(moodLogsTable)
      .where(eq(moodLogsTable.userId, userId))
      .orderBy(desc(moodLogsTable.date))
      .limit(30);

    res.status(200).json({ history: logs });
  } catch (err: any) {
    console.error("[MoodLog] Get history error:", err);
    res.status(500).json({ error: "Failed to fetch mood history" });
  }
});

export default router;
