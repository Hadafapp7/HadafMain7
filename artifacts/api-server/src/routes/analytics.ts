import { Router, type IRouter } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  goalsTable,
  focusSessionsTable,
  appUsageEntriesTable,
  analyticsSnapshotsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { generateWithBedrock, isBedrockConfigured } from "../lib/bedrock";

const router: IRouter = Router();

// Auto-ensure analytics_snapshots table exists in the PostgreSQL database
pool
  .query(
    `CREATE TABLE IF NOT EXISTS analytics_snapshots (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      range TEXT NOT NULL,
      focus_score INTEGER NOT NULL DEFAULT 0,
      screen_minutes INTEGER NOT NULL DEFAULT 0,
      target_minutes INTEGER NOT NULL DEFAULT 180,
      focus_completed INTEGER NOT NULL DEFAULT 0,
      focus_forfeited INTEGER NOT NULL DEFAULT 0,
      goals_completed INTEGER NOT NULL DEFAULT 0,
      goals_missed INTEGER NOT NULL DEFAULT 0,
      goals_forfeited INTEGER NOT NULL DEFAULT 0,
      diagnostic_summary TEXT,
      diagnostic_details JSONB DEFAULT '[]'::jsonb,
      top_apps JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );`
  )
  .catch((err) => console.warn("[Analytics] Table init warning:", err.message));

const DAY_MS = 86_400_000;

function fmtMin(m: number): string {
  const v = Math.max(0, Math.round(m));
  const h = Math.floor(v / 60);
  const r = v % 60;
  if (h > 0 && r > 0) return `${h}h ${r}m`;
  if (h > 0) return `${h}h`;
  return `${v}m`;
}

function parseRange(rangeStr?: string): { range: "WEEK" | "MONTH" | "YEAR"; days: number } {
  const r = (rangeStr ?? "").toUpperCase();
  if (r === "MONTH") return { range: "MONTH", days: 30 };
  if (r === "YEAR") return { range: "YEAR", days: 365 };
  return { range: "WEEK", days: 7 };
}

/**
 * Diagnostic analysis powered by AWS Bedrock LLM.
 * Aggregates all user metrics across the chosen range (WEEK, MONTH, YEAR)
 * and generates a simple-words honest diagnosis of where the user is lagging.
 * Saves the resulting snapshot to `analytics_snapshots` in the database.
 */
router.post("/analytics/diagnostic", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { range: rangeInput, targetMinutes: targetMinInput } = req.body ?? {};
  const { range, days } = parseRange(rangeInput);
  const targetMin = Number(targetMinInput) || 180;

  const now = new Date();
  const rangeStart = new Date(now.getTime() - days * DAY_MS);

  try {
    const [[user], goals, sessions, usageEntries] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, userId)),
      db
        .select()
        .from(goalsTable)
        .where(and(eq(goalsTable.userId, userId), gte(goalsTable.createdAt, rangeStart))),
      db
        .select()
        .from(focusSessionsTable)
        .where(
          and(eq(focusSessionsTable.userId, userId), gte(focusSessionsTable.startedAt, rangeStart))
        )
        .orderBy(desc(focusSessionsTable.startedAt)),
      db
        .select()
        .from(appUsageEntriesTable)
        .where(
          and(
            eq(appUsageEntriesTable.userId, userId),
            gte(appUsageEntriesTable.loggedAt, rangeStart)
          )
        ),
    ]);

    // For brand new users with no activity yet, return null diagnostic
    if (usageEntries.length === 0 && sessions.length === 0 && goals.length === 0) {
      res.json({
        range,
        days,
        focusScore: 50,
        targetMin,
        totalScreenMin: 0,
        dailyAvgMinutes: 0,
        daysOverTarget: 0,
        focusCompleted: 0,
        focusForfeited: 0,
        focusMinutes: 0,
        goalsCompleted: 0,
        goalsMissed: 0,
        goalsForfeited: 0,
        topApps: [],
        diagnostic: null,
      });
      return;
    }

    // ── 1. Focus Sessions Stats ──
    let focusCompleted = 0;
    let focusForfeited = 0;
    let focusMinutes = 0;
    for (const s of sessions) {
      if (s.status === "completed") {
        focusCompleted++;
        focusMinutes += s.plannedDurationMinutes;
      } else if (s.status === "stopped") {
        focusForfeited++;
        if (s.endedAt) {
          const ran = (s.endedAt.getTime() - s.startedAt.getTime()) / 60_000;
          focusMinutes += Math.max(0, Math.round(ran));
        }
      }
    }

    // ── 2. Goals Stats ──
    let goalsCompleted = 0;
    let goalsMissed = 0;
    let goalsForfeited = 0;
    for (const g of goals) {
      if (g.status === "done") {
        goalsCompleted++;
      } else if (g.status === "forfeited") {
        goalsForfeited++;
      } else {
        // Goal is pending or was not marked done
        const [hh, mm] = (g.startTime || "00:00").split(":").map(Number);
        const goalDateStr = g.scheduledDate || now.toISOString().slice(0, 10);
        const [y, m, d] = goalDateStr.split("-").map(Number);
        const endMs =
          new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0).getTime() +
          (g.durationMinutes || 30) * 60_000;

        if (endMs < now.getTime()) {
          goalsMissed++;
        }
      }
    }

    // ── 3. App Usage & Screen Time ──
    const appMap = new Map<string, number>();
    const dayMap = new Map<string, number>();
    let totalScreenMin = 0;

    for (const u of usageEntries) {
      const mins = Number(u.durationMinutes) || 0;
      totalScreenMin += mins;
      appMap.set(u.appName, (appMap.get(u.appName) ?? 0) + mins);
      const dayKey = new Date(u.loggedAt).toISOString().slice(0, 10);
      dayMap.set(dayKey, (dayMap.get(dayKey) ?? 0) + mins);
    }

    const topApps = [...appMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([appName, minutes]) => ({ appName, minutes }));

    let daysOverTarget = 0;
    for (const [_, dayMins] of dayMap) {
      if (dayMins > targetMin) daysOverTarget++;
    }

    const activeDaysCount = Math.max(1, dayMap.size);
    const dailyAvgMinutes = Math.round(totalScreenMin / activeDaysCount);

    // ── 4. Health / Focus Score Calculation ──
    // Score out of 100 based on session completion, goal completion, and screen target adherence
    const totalSessions = focusCompleted + focusForfeited;
    const totalGoals = goalsCompleted + goalsMissed + goalsForfeited;

    let focusScore = 50;
    if (totalSessions === 0 && totalGoals === 0) {
      focusScore = 50; // Neutral baseline for new accounts
    } else {
      const sessionRate = totalSessions > 0 ? focusCompleted / totalSessions : 0.5;
      const goalRate = totalGoals > 0 ? goalsCompleted / totalGoals : 0.5;
      const targetAdherenceRate = Math.max(0, 1 - daysOverTarget / Math.max(1, days));

      if (totalSessions > 0 && totalGoals > 0) {
        focusScore = Math.min(
          100,
          Math.max(15, Math.round(sessionRate * 45 + goalRate * 35 + targetAdherenceRate * 20))
        );
      } else if (totalSessions > 0) {
        focusScore = Math.min(
          100,
          Math.max(15, Math.round(sessionRate * 75 + targetAdherenceRate * 25))
        );
      } else {
        focusScore = Math.min(
          100,
          Math.max(15, Math.round(goalRate * 75 + targetAdherenceRate * 25))
        );
      }
    }

    // ── 5. LLM Prompt Formulation for Bedrock ──
    const facts = [
      `- Time range: Last ${days} days (${range})`,
      `- Total screen time: ${fmtMin(totalScreenMin)} (Daily average: ${fmtMin(dailyAvgMinutes)})`,
      `- User's daily screen time target: ${fmtMin(targetMin)} (Days exceeded target: ${daysOverTarget} of ${activeDaysCount} active days)`,
      `- Focus sessions completed: ${focusCompleted}`,
      `- Focus sessions forfeited / stopped early: ${focusForfeited}`,
      `- Total focus time: ${fmtMin(focusMinutes)}`,
      `- Goals completed: ${goalsCompleted}`,
      `- Goals missed / overdue: ${goalsMissed}`,
      `- Goals forfeited / pending: ${goalsForfeited}`,
      topApps.length > 0
        ? `- Top time sinks: ${topApps.map((a) => `${a.appName} (${fmtMin(a.minutes)})`).join(", ")}`
        : "- Top time sinks: No app usage logged yet",
      user?.name ? `- User name: ${user.name}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are Hadaf's Unfiltered Performance Diagnostician.
Analyze this user's digital wellness, attention, focus sessions, and goal data for the last ${days} days.
Deliver an UNFILTERED, honest, no-sugarcoating diagnostic with ALWAYS exactly 5 punchy improvement cards that push the user into action.

Rules:
1. Deliver ALWAYS exactly 5 distinct improvement cards.
2. Unfiltered motivation: Speak directly to "you" with fierce honesty, zero corporate fluff, and uncompromising motivation.
3. Call out specific numbers, apps, session counts, and goal slips from the user data.
4. Reply ONLY with a valid JSON object in this exact format:
{
  "headline": "3-6 word blunt diagnostic headline",
  "summary": "1-2 sentences delivering the unfiltered truth about their current performance.",
  "cards": [
    { "title": "Focus Session Execution", "text": "Unfiltered point about completed vs forfeited sessions." },
    { "title": "Distraction Bleed", "text": "Unfiltered callout on their biggest app time-sink and wasted hours." },
    { "title": "Goal Follow-Through", "text": "Unfiltered reality on goals completed vs missed." },
    { "title": "Screen Time Boundary", "text": "Unfiltered truth regarding daily screen time target adherence." },
    { "title": "Unfiltered Mindset Kick", "text": "Ruthless, fierce kick telling them to stop making excuses and lock in." }
  ],
  "actionStep": "One immediate, zero-excuse action to do right now."
}

USER DATA:
${facts}`;

    let diagnosticSummary = "";
    let diagnosticDetails: string[] = [];
    let diagnosticCards: Array<{ title: string; text: string }> = [];
    let diagnosticHeadline = "Hadaf Diagnostic";
    let actionStep = "Start one 25-minute focus session without distractions.";

    if (isBedrockConfigured()) {
      try {
        const raw = await generateWithBedrock(prompt, { maxTokens: 420, temperature: 0.7 });
        const match = raw.match(/\{[\s\S]*?\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.summary) diagnosticSummary = String(parsed.summary).trim();
          if (parsed.headline) diagnosticHeadline = String(parsed.headline).trim();
          if (Array.isArray(parsed.cards) && parsed.cards.length >= 5) {
            diagnosticCards = parsed.cards.slice(0, 5).map((c: any) => ({
              title: String(c.title || "Improvement Point").trim(),
              text: String(c.text || "").trim(),
            }));
            diagnosticDetails = diagnosticCards.map((c) => `${c.title}: ${c.text}`);
          } else if (Array.isArray(parsed.laggingPoints) && parsed.laggingPoints.length > 0) {
            diagnosticDetails = parsed.laggingPoints.map(String);
          }
          if (parsed.actionStep) actionStep = String(parsed.actionStep).trim();
        }
      } catch (err: any) {
        console.warn("[Analytics] Bedrock diagnostic call failed, using intelligent fallback:", err?.message || err);
      }
    }

    // Contextual intelligent fallback: ALWAYS 5 distinct improvement cards with unfiltered motivation
    if (!diagnosticCards || diagnosticCards.length < 5) {
      if (daysOverTarget > 0) {
        diagnosticHeadline = "Screen limit breached";
        diagnosticSummary = `You broke your ${fmtMin(targetMin)} daily ceiling on ${daysOverTarget} day(s) this ${range.toLowerCase()}. Distractions won't build your future—discipline will.`;
      } else if (focusForfeited > focusCompleted) {
        diagnosticHeadline = "Giving up mid-session";
        diagnosticSummary = `You forfeited ${focusForfeited} focus sessions before the clock ran out. Real builders push through discomfort instead of tapping out early.`;
      } else if (focusMinutes < 60) {
        diagnosticHeadline = "Low focus logged";
        diagnosticSummary = `Only ${fmtMin(focusMinutes)} of total focus logged this ${range.toLowerCase()}. Without dedicated blocks of focus, you're running on autopilot.`;
      } else {
        diagnosticHeadline = "Solid momentum, stay ruthless";
        diagnosticSummary = `${focusCompleted} focus sessions locked in. Don't get comfortable—standards must rise every week.`;
      }

      diagnosticCards = [
        {
          title: "Focus Session Execution",
          text:
            focusForfeited > 0
              ? `You stopped ${focusForfeited} sessions early. Giving up when mental friction hits destroys your concentration. Finish every timer you start.`
              : focusCompleted === 0
              ? `You logged 0 completed focus sessions this ${range.toLowerCase()}. You cannot expect extraordinary results with casual effort. Start a 25-minute block now.`
              : `${focusCompleted} sessions completed. Now double down and eliminate all remaining micro-distractions.`,
        },
        {
          title: "Distraction Bleed",
          text: topApps[0]
            ? `${topApps[0].appName} consumed ${fmtMin(topApps[0].minutes)}. That is valuable prime time handed over to someone else's platform. Set a hard limit.`
            : "Passive app consumption creeps up silently. Identify your #1 digital leak before it robs your productive hours.",
        },
        {
          title: "Goal Follow-Through",
          text:
            goalsMissed > 0
              ? `${goalsMissed} scheduled goals expired or were missed. Intentions without execution are meaningless. Stop postponing what you planned.`
              : goalsCompleted === 0
              ? `No goals completed this ${range.toLowerCase()}. Pick one high-leverage objective and finish it before you sleep.`
              : `${goalsCompleted} goals conquered. Hold yourself accountable to this exact standard every single day.`,
        },
        {
          title: "Screen Time Boundary",
          text:
            daysOverTarget > 0
              ? `You exceeded your daily target on ${daysOverTarget} days (${fmtMin(totalScreenMin)} total screen time). Stop negotiating with your limits.`
              : `Screen time is within bounds (${fmtMin(totalScreenMin)}). Guard against late-night binges where discipline usually fails.`,
        },
        {
          title: "Unfiltered Mindset Kick",
          text: "Excuses produce zero results. Put your phone in another room, silence all notifications, and execute the hard task you've been putting off.",
        },
      ];

      diagnosticDetails = diagnosticCards.map((c) => `${c.title}: ${c.text}`);
      actionStep = "Silence notifications, open Focus, and complete 1 unbroken 25-minute session right now.";
    }

    // ── 6. Save Snapshot to Database ──
    try {
      await db.insert(analyticsSnapshotsTable).values({
        userId,
        range,
        focusScore,
        screenMinutes: totalScreenMin,
        targetMinutes: targetMin,
        focusCompleted,
        focusForfeited,
        goalsCompleted,
        goalsMissed,
        goalsForfeited,
        diagnosticSummary,
        diagnosticDetails,
        topApps,
      });
    } catch (dbErr: any) {
      console.warn("[Analytics] Could not save analytics snapshot to DB:", dbErr?.message || dbErr);
    }

    res.json({
      range,
      days,
      focusScore,
      targetMin,
      totalScreenMin,
      dailyAvgMinutes,
      daysOverTarget,
      focusCompleted,
      focusForfeited,
      focusMinutes,
      goalsCompleted,
      goalsMissed,
      goalsForfeited,
      topApps,
      diagnostic: {
        headline: diagnosticHeadline,
        summary: diagnosticSummary,
        cards: diagnosticCards,
        laggingPoints: diagnosticDetails,
        actionStep,
      },
    });
  } catch (err: any) {
    console.error("[Analytics] Diagnostic generation error:", err);
    res.status(500).json({ error: "Failed to generate analytics diagnostic", details: err?.message });
  }
});

/**
 * Fetch saved analytics snapshots from the database for the user.
 */
router.get("/analytics/snapshots", requireAuth, async (req, res): Promise<void> => {
  try {
    const snapshots = await db
      .select()
      .from(analyticsSnapshotsTable)
      .where(eq(analyticsSnapshotsTable.userId, req.userId!))
      .orderBy(desc(analyticsSnapshotsTable.createdAt))
      .limit(30);

    res.json(snapshots);
  } catch (err: any) {
    console.warn("[Analytics] Fetch snapshots failed:", err?.message || err);
    res.status(500).json({ error: "Failed to fetch snapshots" });
  }
});

export default router;

