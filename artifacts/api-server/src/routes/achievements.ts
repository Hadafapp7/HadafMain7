import { Router, type IRouter } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, usersTable, achievementsTable, focusSessionsTable, goalsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { ensureSchema } from "../lib/schema-sync";

const router: IRouter = Router();

const MAX_LEVEL = 100;

export function getLevelRankTitle(level: number): string {
  const lvl = Math.min(MAX_LEVEL, Math.max(1, level));
  if (lvl <= 5) return "Novice";
  if (lvl <= 10) return "Apprentice";
  if (lvl <= 15) return "Initiate";
  if (lvl <= 20) return "Seeker";
  if (lvl <= 25) return "Pathfinder";
  if (lvl <= 30) return "Specialist";
  if (lvl <= 35) return "Adept";
  if (lvl <= 40) return "Guardian";
  if (lvl <= 45) return "Vanguard";
  if (lvl <= 50) return "Artisan";
  if (lvl <= 60) return "Master";
  if (lvl <= 70) return "Grandmaster";
  if (lvl <= 80) return "Sage";
  if (lvl <= 90) return "Virtuoso";
  if (lvl < 100) return "Titan";
  return "Legend";
}

function getIsoWeekKey(now = new Date()): { weekKey: string; weekStart: Date } {
  // Current 7-day rolling/calendar week starting Monday 00:00:00
  const d = new Date(now);
  const day = d.getDay(); // 0 = Sun, 1 = Mon ...
  const diffToMon = (day + 6) % 7;
  const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMon, 0, 0, 0, 0);
  const year = weekStart.getFullYear();
  const month = String(weekStart.getMonth() + 1).padStart(2, "0");
  const date = String(weekStart.getDate()).padStart(2, "0");
  return { weekKey: `${year}-${month}-${date}`, weekStart };
}

function buildWeeklyMilestonesForLevel(
  level: number,
  weeklySessions: number,
  weeklyFocusMinutes: number,
  weeklyGoalsDone: number,
  currentStreak: number
) {
  const lvl = Math.min(MAX_LEVEL, Math.max(1, level));
  // Moderately scale weekly challenges with level while keeping them 100% completable in a week:
  // Level 1: 3 focus sessions, 60 focus mins, 3 goals, 3-day streak
  // Level 100: 12 focus sessions (~1.7/day), 360 focus mins (~51m/day), 12 goals, 7-day streak
  const targetSessions = Math.min(12, 3 + Math.floor((lvl - 1) / 10));
  const targetFocusMins = Math.min(360, 60 + Math.floor((lvl - 1) / 5) * 15);
  const targetGoals = Math.min(12, 3 + Math.floor((lvl - 1) / 10));
  const targetStreak = Math.min(7, 3 + Math.floor((lvl - 1) / 25));

  return [
    {
      id: "weekly_focus_sessions",
      label: `Complete ${targetSessions} focus sessions this week`,
      current: Math.min(targetSessions, weeklySessions),
      rawCurrent: weeklySessions,
      total: targetSessions,
      unit: "sessions",
      completed: weeklySessions >= targetSessions,
    },
    {
      id: "weekly_focus_minutes",
      label: `Log ${targetFocusMins} minutes of deep focus this week`,
      current: Math.min(targetFocusMins, weeklyFocusMinutes),
      rawCurrent: weeklyFocusMinutes,
      total: targetFocusMins,
      unit: "mins",
      completed: weeklyFocusMinutes >= targetFocusMins,
    },
    {
      id: "weekly_goals_done",
      label: `Complete ${targetGoals} daily or scheduled goals this week`,
      current: Math.min(targetGoals, weeklyGoalsDone),
      rawCurrent: weeklyGoalsDone,
      total: targetGoals,
      unit: "goals",
      completed: weeklyGoalsDone >= targetGoals,
    },
    {
      id: "weekly_streak",
      label: `Reach a ${targetStreak}-day active focus streak this week`,
      current: Math.min(targetStreak, currentStreak),
      rawCurrent: currentStreak,
      total: targetStreak,
      unit: "days",
      completed: currentStreak >= targetStreak,
    },
  ];
}

router.get("/achievements", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensureSchema();
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!));

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { weekKey, weekStart } = getIsoWeekKey();

    // Query this week's completed focus sessions & focus minutes
    const [weeklySessionStats] = await db
      .select({
        count: sql<number>`count(*)`,
        minutes: sql<number>`coalesce(sum(${focusSessionsTable.plannedDurationMinutes}), 0)`,
      })
      .from(focusSessionsTable)
      .where(
        and(
          eq(focusSessionsTable.userId, req.userId!),
          eq(focusSessionsTable.status, "completed"),
          gte(focusSessionsTable.startedAt, weekStart)
        )
      );

    // Query this week's completed goals
    const [weeklyGoalsStats] = await db
      .select({ count: sql<number>`count(*)` })
      .from(goalsTable)
      .where(
        and(
          eq(goalsTable.userId, req.userId!),
          eq(goalsTable.status, "done"),
          gte(goalsTable.updatedAt, weekStart)
        )
      );

    const weeklySessions = Number(weeklySessionStats?.count ?? 0);
    const weeklyFocusMinutes = Number(weeklySessionStats?.minutes ?? 0);
    const weeklyGoalsDone = Number(weeklyGoalsStats?.count ?? 0);

    let currentLevel = Math.min(MAX_LEVEL, Math.max(1, user.level ?? 1));
    if (user.level !== currentLevel) {
      await db
        .update(usersTable)
        .set({ level: currentLevel })
        .where(eq(usersTable.id, req.userId!));
    }

    let milestones = buildWeeklyMilestonesForLevel(
      currentLevel,
      weeklySessions,
      weeklyFocusMinutes,
      weeklyGoalsDone,
      user.currentStreak ?? 0
    );

    const allCompletedThisWeek = milestones.every((m) => m.completed);
    const weeklyMilestoneBadgeKey = `weekly_lvl_${weekKey}_L${currentLevel}`;

    if (allCompletedThisWeek && currentLevel < MAX_LEVEL) {
      const [alreadyAwarded] = await db
        .select()
        .from(achievementsTable)
        .where(
          and(
            eq(achievementsTable.userId, req.userId!),
            eq(achievementsTable.badgeType, weeklyMilestoneBadgeKey)
          )
        )
        .limit(1);

      if (!alreadyAwarded) {
        currentLevel = Math.min(MAX_LEVEL, currentLevel + 1);
        await db
          .update(usersTable)
          .set({ level: currentLevel })
          .where(eq(usersTable.id, req.userId!));

        await db.insert(achievementsTable).values({
          userId: req.userId!,
          badgeType: weeklyMilestoneBadgeKey,
          earned: true,
          unlockedAt: new Date(),
        });

        milestones = buildWeeklyMilestonesForLevel(
          currentLevel,
          weeklySessions,
          weeklyFocusMinutes,
          weeklyGoalsDone,
          user.currentStreak ?? 0
        );
      }
    }

    const completedMilestonesCount = milestones.filter((m) => m.completed).length;
    const rankTitle = getLevelRankTitle(currentLevel);

    res.json({
      level: currentLevel,
      maxLevel: MAX_LEVEL,
      rankTitle,
      xp: user.xp,
      xpNeeded: currentLevel * 100,
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      weekKey,
      weeklyCompletedCount: completedMilestonesCount,
      weeklyTotalCount: milestones.length,
      milestones,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
