import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, usersTable, achievementsTable, focusSessionsTable, goalsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/achievements", requireAuth, async (req, res): Promise<void> => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!));

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const dbBadges = await db
      .select()
      .from(achievementsTable)
      .where(
        and(
          eq(achievementsTable.userId, req.userId!),
          eq(achievementsTable.earned, true)
        )
      );

    const earnedBadgeTypes = new Set(dbBadges.map(b => b.badgeType));

    const BADGES = [
      { icon: "wb-sunny",    label: "EARLY BIRD",  earned: earnedBadgeTypes.has("early_bird")  },
      { icon: "bedtime",     label: "NIGHT OWL",   earned: earnedBadgeTypes.has("night_owl")  },
      { icon: "spa",         label: "FOCUS GURU",  earned: earnedBadgeTypes.has("focus_guru") },
      { icon: "anchor",      label: "DEEP DIVER",  earned: earnedBadgeTypes.has("deep_diver") },
      { icon: "bolt",        label: "SPEEDSTER",   earned: earnedBadgeTypes.has("speedster") },
      { icon: "self-improvement", label: "ZEN MODE",earned: earnedBadgeTypes.has("zen_mode") },
    ];

    const [sessionsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(focusSessionsTable)
      .where(
        and(
          eq(focusSessionsTable.userId, req.userId!),
          eq(focusSessionsTable.status, "completed")
        )
      );

    const [goalsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(goalsTable)
      .where(
        and(
          eq(goalsTable.userId, req.userId!),
          eq(goalsTable.status, "done")
        )
      );

    const completedSessionsCount = Number(sessionsCount?.count ?? 0);
    const completedGoalsCount = Number(goalsCount?.count ?? 0);

    const MILESTONES = [
      { label: "Complete 50 focus sessions", current: completedSessionsCount, total: 50 },
      { label: "Log 100 goals",              current: completedGoalsCount, total: 100 },
      { label: "Maintain a 30-day streak",   current: user.currentStreak, total: 30  },
    ];

    res.json({
      level: user.level,
      xp: user.xp,
      xpNeeded: user.level * 100,
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      badges: BADGES,
      milestones: MILESTONES
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
