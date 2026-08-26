import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, usersTable, achievementsTable, focusSessionsTable, appUsageEntriesTable } from "@workspace/db";

export async function awardXpAndCheckBadges(
  userId: string,
  xpGained: number,
  actionType: "focus_session" | "goal_done",
  context: { durationMinutes?: number; localHour?: number } = {}
) {
  try {
    const [user] = await db
      .select({
        xp: usersTable.xp,
        level: usersTable.level,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) return;

    let newXp = user.xp + xpGained;
    let newLevel = user.level;

    while (newXp >= newLevel * 100) {
      newXp -= newLevel * 100;
      newLevel += 1;
    }

    await db
      .update(usersTable)
      .set({ xp: newXp, level: newLevel })
      .where(eq(usersTable.id, userId));

    const upsertBadge = async (badgeType: string) => {
      const [existing] = await db
        .select()
        .from(achievementsTable)
        .where(
          and(
            eq(achievementsTable.userId, userId),
            eq(achievementsTable.badgeType, badgeType)
          )
        )
        .limit(1);

      if (existing) {
        if (!existing.earned) {
          await db
            .update(achievementsTable)
            .set({ earned: true, unlockedAt: new Date() })
            .where(eq(achievementsTable.id, existing.id));
        }
      } else {
        await db
          .insert(achievementsTable)
          .values({
            userId,
            badgeType,
            earned: true,
            unlockedAt: new Date(),
          });
      }
    };

    if (actionType === "focus_session") {
      await upsertBadge("focus_guru");

      if (context.durationMinutes && context.durationMinutes >= 45) {
        await upsertBadge("deep_diver");
      }

      if (context.durationMinutes && context.durationMinutes >= 60) {
        await upsertBadge("zen_mode");
      }

      const [sessionsCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(focusSessionsTable)
        .where(
          and(
            eq(focusSessionsTable.userId, userId),
            eq(focusSessionsTable.status, "completed")
          )
        );
      if (Number(sessionsCount?.count ?? 0) >= 5) {
        await upsertBadge("speedster");
      }
    } else if (actionType === "goal_done") {
      const currentHour = context.localHour ?? new Date().getHours();
      
      if (currentHour < 9) {
        await upsertBadge("early_bird");
      }

      if (currentHour >= 22) {
        await upsertBadge("night_owl");
      }
    }
  } catch (err: any) {
    console.error("[Gamification] Error in awardXpAndCheckBadges:", err.message || err);
  }
}

export async function updateStreak(userId: string) {
  try {
    const [user] = await db
      .select({
        currentStreak: usersTable.currentStreak,
        bestStreak: usersTable.bestStreak,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const yesterdayLogs = await db
      .select()
      .from(appUsageEntriesTable)
      .where(
        and(
          eq(appUsageEntriesTable.userId, userId),
          gte(appUsageEntriesTable.loggedAt, yesterdayStart),
          lt(appUsageEntriesTable.loggedAt, todayStart)
        )
      )
      .limit(1);

    const todayLogs = await db
      .select()
      .from(appUsageEntriesTable)
      .where(
        and(
          eq(appUsageEntriesTable.userId, userId),
          gte(appUsageEntriesTable.loggedAt, todayStart)
        )
      )
      .limit(1);

    let newCurrentStreak = user.currentStreak;

    if (todayLogs.length > 0) {
      if (newCurrentStreak === 0) {
        newCurrentStreak = 1;
      }
    } else if (yesterdayLogs.length > 0) {
      newCurrentStreak += 1;
    } else {
      newCurrentStreak = 1;
    }

    const newBestStreak = Math.max(newCurrentStreak, user.bestStreak);

    await db
      .update(usersTable)
      .set({
        currentStreak: newCurrentStreak,
        bestStreak: newBestStreak,
      })
      .where(eq(usersTable.id, userId));
  } catch (err: any) {
    console.error("[Gamification] Error in updateStreak:", err.message || err);
  }
}
