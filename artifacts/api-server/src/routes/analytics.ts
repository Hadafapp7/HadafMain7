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
        } else {
          goalsForfeited++; // pending / not scheduled
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
    const sessionRate = totalSessions > 0 ? focusCompleted / totalSessions : 0.6;
    const totalGoals = goalsCompleted + goalsMissed + goalsForfeited;
    const goalRate = totalGoals > 0 ? goalsCompleted / totalGoals : 0.6;
    const targetAdherenceRate = Math.max(0, 1 - daysOverTarget / Math.max(1, days));

    const focusScore = Math.min(
      100,
      Math.max(
        15,
        Math.round(sessionRate * 40 + goalRate * 35 + targetAdherenceRate * 25)
      )
    );

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

    const prompt = `You are Hadaf's AI Productivity Diagnostician.
Analyze this user's digital wellness and attention data for the last ${days} days.
Write a clear, honest, simple-words diagnosis explaining where they are lagging and how to fix it.

Rules:
1. Use simple, everyday words. No corporate buzzwords or medical jargon.
2. Speak directly to "you".
3. Point out specific numbers and app names (e.g. mention if an app took hours, or if sessions were quit early, or if goals were missed).
4. Highlight the primary lagging leak (where their attention slipped).
5. Give 1 straightforward action step to take today.
6. Reply ONLY with a valid JSON object in this exact shape:
{
  "headline": "Short punchy 3-6 word diagnosis",
  "summary": "1-2 short sentences giving the honest diagnosis in plain words.",
  "laggingPoints": [
    "Specific leak with app name or session count",
    "Second key lagging habit or goal slip",
    "Third actionable observation"
  ],
  "actionStep": "One clear action step to do today."
}

USER DATA:
${facts}`;

    let diagnosticSummary = "";
    let diagnosticDetails: string[] = [];
    let diagnosticHeadline = "Attention Diagnostic";
    let actionStep = "Start one 25-minute focus session without distractions.";

    if (isBedrockConfigured()) {
      try {
        const raw = await generateWithBedrock(prompt, { maxTokens: 260, temperature: 0.7 });
        const match = raw.match(/\{[\s\S]*?\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.summary) diagnosticSummary = String(parsed.summary).trim();
          if (parsed.headline) diagnosticHeadline = String(parsed.headline).trim();
          if (Array.isArray(parsed.laggingPoints)) {
            diagnosticDetails = parsed.laggingPoints.map(String);
          }
          if (parsed.actionStep) actionStep = String(parsed.actionStep).trim();
        }
      } catch (err: any) {
        console.warn("[Analytics] Bedrock diagnostic call failed, using intelligent fallback:", err?.message || err);
      }
    }

    // Contextual intelligent fallback if Bedrock was unconfigured or failed
    if (!diagnosticSummary) {
      if (daysOverTarget > 0) {
        diagnosticHeadline = "Screen time exceeding target";
        diagnosticSummary = `You went over your ${fmtMin(targetMin)} daily goal on ${daysOverTarget} days this ${range.toLowerCase()}. ${topApps[0]?.appName ? `${topApps[0].appName} was your largest distraction.` : "Cut screen time back down."}`;
      } else if (focusForfeited > focusCompleted) {
        diagnosticHeadline = "Focus sessions quit early";
        diagnosticSummary = `You stopped ${focusForfeited} focus sessions before the timer ended. Finishing sessions builds the discipline you need.`;
      } else if (focusMinutes < 60) {
        diagnosticHeadline = "Low focus time logged";
        diagnosticSummary = `You only logged ${fmtMin(focusMinutes)} of focus in this ${range.toLowerCase()}. Even 20 minutes a day changes your habit trajectory.`;
      } else {
        diagnosticHeadline = "Strong focus discipline";
        diagnosticSummary = `Great work completing ${focusCompleted} focus sessions and staying near your daily targets this ${range.toLowerCase()}. Keep the momentum going.`;
      }

      diagnosticDetails = [
        topApps[0]
          ? `${topApps[0].appName} consumed ${fmtMin(topApps[0].minutes)}, making it your top time sink.`
          : "Keep an eye on social and entertainment apps.",
        focusForfeited > 0
          ? `${focusForfeited} sessions were abandoned before the planned timer finished.`
          : `${focusCompleted} focus sessions completed successfully.`,
        goalsMissed > 0
          ? `${goalsMissed} scheduled goals passed without being checked off.`
          : `${goalsCompleted} goals marked complete.`,
      ];
      actionStep = "Set your daily target and complete 1 unbroken focus session today.";
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
