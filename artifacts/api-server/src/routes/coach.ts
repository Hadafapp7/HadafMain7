import { Router, type IRouter } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import {
  db,
  usersTable,
  goalsTable,
  focusSessionsTable,
  appUsageEntriesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { generateWithBedrock, isBedrockConfigured } from "../lib/bedrock";

const router: IRouter = Router();

function fmtMin(m: number): string {
  const v = Math.max(0, Math.round(m));
  const h = Math.floor(v / 60);
  const r = v % 60;
  if (h > 0 && r > 0) return `${h}h ${r}m`;
  if (h > 0) return `${h}h`;
  return `${v}m`;
}

// In-memory cache per user with 5-minute TTL to keep home visits instant
const coachCache = new Map<string, { data: any; expiresAt: number }>();

router.get("/coach/reality-check", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const force = req.query.refresh === "true";

  const cached = coachCache.get(userId);
  if (!force && cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  try {
    const [[user], goals, sessions, todayUsage, weekUsage] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, userId)),
      db.select().from(goalsTable).where(eq(goalsTable.userId, userId)),
      db
        .select()
        .from(focusSessionsTable)
        .where(and(eq(focusSessionsTable.userId, userId), gte(focusSessionsTable.startedAt, weekAgo))),
      db
        .select()
        .from(appUsageEntriesTable)
        .where(and(eq(appUsageEntriesTable.userId, userId), gte(appUsageEntriesTable.loggedAt, todayStart))),
      db
        .select()
        .from(appUsageEntriesTable)
        .where(and(eq(appUsageEntriesTable.userId, userId), gte(appUsageEntriesTable.loggedAt, weekAgo))),
    ]);

    // Screen time stats
    const todayMins = todayUsage.reduce((s, e) => s + e.durationMinutes, 0);
    const sortedTodayApps = [...todayUsage].sort((a, b) => b.durationMinutes - a.durationMinutes);
    const topTodayApp = sortedTodayApps[0];

    // Weekly top apps
    const appMap = new Map<string, number>();
    for (const e of weekUsage) {
      appMap.set(e.appName, (appMap.get(e.appName) ?? 0) + e.durationMinutes);
    }
    const topWeekApp = [...appMap.entries()].sort((a, b) => b[1] - a[1])[0];

    // Focus & Goals
    const completedSessions = sessions.filter((s) => s.status === "completed").length;
    const quitSessions = sessions.filter((s) => s.status === "stopped").length;
    const pendingGoals = goals.filter((g) => g.status === "pending").length;
    const streak = user?.currentStreak ?? 0;

    const facts = [
      user?.name ? `- Name: ${user.name}` : "",
      `- Current streak: ${streak} day(s)`,
      `- Screen time today: ${fmtMin(todayMins)}`,
      topTodayApp ? `- Most used app today: ${topTodayApp.appName} (${fmtMin(topTodayApp.durationMinutes)})` : "",
      topWeekApp ? `- Biggest time sink this week: ${topWeekApp[0]} (${fmtMin(topWeekApp[1])})` : "",
      `- Focus sessions completed this week: ${completedSessions}`,
      `- Focus sessions forfeited / stopped early: ${quitSessions}`,
      `- Pending goals: ${pendingGoals}`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are Hadaf's AI Focus Coach. Write a short, punchy 2-sentence reality check widget for the app's home screen.
Sentence 1: Deliver an honest, sharp guilt feeling about their phone time, top app, or missed focus (speak directly to "you").
Sentence 2: Deliver an immediate, fierce motivational kick to lock in and focus right now.

Rules:
- Exactly 2 sentences.
- At most 28 words total.
- Simple, direct words. No clichés.
- Reply ONLY with a JSON object:
{"title": "3-5 word punchy hook", "message": "Sentence 1. Sentence 2."}

USER FACTS:
${facts}`;

    let title = "Time to lock in";
    let message = "";
    let source: "bedrock" | "fallback" = "fallback";

    if (isBedrockConfigured()) {
      try {
        const raw = await generateWithBedrock(prompt, { maxTokens: 120, temperature: 0.8 });
        const match = raw.match(/\{[\s\S]*?\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.message && String(parsed.message).trim().length >= 10) {
            title = String(parsed.title || "Reality Check").trim();
            message = String(parsed.message).trim();
            source = "bedrock";
          }
        }
      } catch (err: any) {
        console.warn("[Coach] Bedrock call failed, using intelligent fallback:", err?.message || err);
      }
    }

    if (!message) {
      if (topTodayApp && topTodayApp.durationMinutes > 45) {
        title = `${topTodayApp.appName} took ${fmtMin(topTodayApp.durationMinutes)}`;
        message = `You spent ${fmtMin(topTodayApp.durationMinutes)} on ${topTodayApp.appName} today while your goals waited. Close the feed and start 25 minutes of deep focus now.`;
      } else if (todayMins > 120) {
        title = `${fmtMin(todayMins)} on screen today`;
        message = `Over 2 hours gone to your screen today already. Take control of your attention before the day is over.`;
      } else if (quitSessions > 0) {
        title = "Don't quit on yourself";
        message = `You ended a focus session early this week. Prove your discipline and finish your next session strong.`;
      } else {
        title = "Own your focus today";
        message = `Distraction is easy, but mastery takes discipline. Start your focus session now and protect your streak.`;
      }
    }

    const result = {
      tag: "REALITY CHECK",
      title,
      message,
      source,
      streak,
      screenTimeToday: fmtMin(todayMins),
    };

    coachCache.set(userId, { data: result, expiresAt: Date.now() + 5 * 60_000 });
    res.json(result);
  } catch (err: any) {
    console.error("[Coach] Reality check error:", err);
    res.json({
      tag: "REALITY CHECK",
      title: "Focus on what matters",
      message: "Distraction steals your time silently. Lock in for a 25-minute focus session right now.",
      source: "fallback",
    });
  }
});

export default router;
