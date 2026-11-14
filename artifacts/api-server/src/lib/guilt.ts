import { and, desc, eq, gte } from "drizzle-orm";
import {
  db,
  usersTable,
  goalsTable,
  focusSessionsTable,
  appUsageEntriesTable,
} from "@workspace/db";
import { generateWithBedrock, isBedrockConfigured } from "./bedrock";
import { ensureSchema } from "./schema-sync";

export type GuiltTrigger =
  | "missed_goal"
  | "failed_focus"
  | "inactive"
  | "inconsistent"
  | "general";

export interface GuiltItem {
  id: string;
  trigger: GuiltTrigger;
  title: string;
  body: string;
  source: "bedrock" | "fallback";
  /** ISO time - only present for notifications the phone should schedule for later. */
  fireAt?: string;
  /** Only populated by the /preview debug endpoint. */
  error?: string;
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const INACTIVITY_DAYS = 3;

// ───────────────────────── helpers ─────────────────────────

const fmtMin = (n: number): string => {
  const m = Math.max(0, Math.round(n));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? (r > 0 ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
};

/** `tz` = minutes the user's clock is ahead of UTC (IST = 330). */
const localDate = (ms: number, tz: number): string =>
  new Date(ms + tz * MIN).toISOString().slice(0, 10);

const localHour = (ms: number, tz: number): number =>
  new Date(ms + tz * MIN).getUTCHours();

const fmtClock = (ms: number, tz: number): string => {
  const d = new Date(ms + tz * MIN);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
};

/** Goals store the start time as "10:00 AM" (app picker) — older rows may be 24h "HH:MM". Accept both. */
const parseClock = (t: string): [number, number] => {
  const m = String(t ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return [0, 0];
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3]) h = (h % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return [h, min];
};

const goalEndMs = (
  dateStr: string,
  startTime: string,
  durationMin: number,
  tz: number,
): number => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = parseClock(startTime);
  return (
    Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0) +
    durationMin * MIN -
    tz * MIN
  );
};

/** Never ping people between 22:00 and 08:00 local time. */
const avoidQuietHours = (ms: number, tz: number): number => {
  const local = new Date(ms + tz * MIN);
  const h = local.getUTCHours();
  if (h >= 8 && h < 22) return ms;
  const dayOffset = h >= 22 ? 1 : 0;
  return (
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + dayOffset,
      8,
      30,
    ) -
    tz * MIN
  );
};

// ───────────────────────── data → facts ─────────────────────────

interface Facts {
  name: string | null;
  streak: number;
  bestStreak: number;
  topApps: { name: string; minutes: number }[];
  topAppToday: { name: string; minutes: number } | null;
  focusTodayMin: number;
  focusSessionsCompletedWeek: number;
  goalsDoneWeek: number;
  goalsPendingToday: number;
  goalsForfeitedWeek: number;
  goalsMissedNow: number;
  daysInactive: number;
}

interface Loaded {
  facts: Facts;
  missedGoals: { id: string; key: string; title: string; endMs: number }[];
  forfeitedGoals: { id: string; title: string; reason: string | null }[];
  upcomingGoals: { id: string; key: string; title: string; endMs: number }[];
  pendingGoalTitles: string[];
  failedSessions: {
    id: string;
    planned: number;
    ran: number;
    abandoned: boolean;
    intention: string | null;
  }[];
}

function factsToText(f: Facts): string {
  const lines: string[] = [];
  lines.push(`- Name: ${f.name ?? "friend"}`);
  lines.push(
    `- Current streak: ${f.streak} day(s) (best streak ever: ${f.bestStreak})`,
  );
  lines.push(`- Focus time completed today: ${fmtMin(f.focusTodayMin)}`);
  lines.push(
    `- Focus sessions completed in the last 7 days: ${f.focusSessionsCompletedWeek} (target for consistency: at least 7)`,
  );
  lines.push(`- Goals completed in the last 7 days: ${f.goalsDoneWeek}`);
  lines.push(`- Goals currently pending: ${f.goalsPendingToday}`);
  lines.push(`- Goals forfeited/quit this week: ${f.goalsForfeitedWeek}`);
  lines.push(`- Goals currently overdue: ${f.goalsMissedNow}`);
  if (f.topApps.length > 0) {
    lines.push(
      `- Most used distracting apps in the last 7 days: ${f.topApps
        .map((a) => `${a.name} (${fmtMin(a.minutes)})`)
        .join(", ")}`,
    );
  }
  if (f.topAppToday) {
    lines.push(
      `- Most used app today: ${f.topAppToday.name} (${fmtMin(
        f.topAppToday.minutes,
      )})`,
    );
  }
  if (f.daysInactive > 0) {
    lines.push(`- Days since the user last opened Hadaf: ${f.daysInactive}`);
  }
  return lines.join("\n");
}

async function loadAll(
  userId: string,
  tz: number,
  prevLastActive: Date | null,
): Promise<Loaded> {
  await ensureSchema();
  const nowMs = Date.now();
  const today = localDate(nowMs, tz);
  const weekAgo = new Date(nowMs - 7 * DAY);

  const [[user], goals, sessions, usage] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, userId)),
    db.select().from(goalsTable).where(eq(goalsTable.userId, userId)),
    db
      .select()
      .from(focusSessionsTable)
      .where(
        and(
          eq(focusSessionsTable.userId, userId),
          gte(focusSessionsTable.startedAt, weekAgo),
        ),
      )
      .orderBy(desc(focusSessionsTable.startedAt)),
    db
      .select()
      .from(appUsageEntriesTable)
      .where(
        and(
          eq(appUsageEntriesTable.userId, userId),
          gte(appUsageEntriesTable.loggedAt, weekAgo),
        ),
      ),
  ]);

  // Goals ------------------------------------------------------
  const missedGoals: Loaded["missedGoals"] = [];
  const forfeitedGoals: Loaded["forfeitedGoals"] = [];
  const upcomingGoals: Loaded["upcomingGoals"] = [];
  const pendingGoalTitles: string[] = [];
  let goalsDoneWeek = 0;
  let goalsForfeitedWeek = 0;

  for (const g of goals) {
    if ((g.status as string) === "forfeited") {
      if (g.updatedAt.getTime() >= weekAgo.getTime()) {
        goalsForfeitedWeek++;
        forfeitedGoals.push({
          id: g.id,
          title: g.title,
          reason: (g as any).forfeitReason ?? null,
        });
      }
      continue;
    }
    if (g.status === "done") {
      if (g.updatedAt.getTime() >= weekAgo.getTime()) goalsDoneWeek++;
      continue;
    }
    pendingGoalTitles.push(g.title);
    const dateStr = g.scheduledDate || today;
    const endMs = goalEndMs(dateStr, g.startTime, g.durationMinutes, tz);
    if (!Number.isFinite(endMs)) continue;
    const entry = {
      id: g.id,
      key: `${g.id}:${dateStr}`,
      title: g.title,
      endMs,
    };
    if (endMs < nowMs) {
      if (nowMs - endMs <= 2 * DAY) missedGoals.push(entry);
    } else if (endMs - nowMs <= 1.5 * DAY) {
      upcomingGoals.push(entry);
    }
  }
  missedGoals.sort((a, b) => b.endMs - a.endMs);
  upcomingGoals.sort((a, b) => a.endMs - b.endMs);

  // Focus sessions ---------------------------------------------
  const failedSessions: Loaded["failedSessions"] = [];
  let focusTodayMin = 0;
  let focusSessionsCompletedWeek = 0;
  for (const s of sessions) {
    const started = s.startedAt.getTime();
    if (s.status === "completed") {
      focusSessionsCompletedWeek++;
      if (localDate(started, tz) === today)
        focusTodayMin += s.plannedDurationMinutes;
      continue;
    }
    if (nowMs - started > DAY) continue;
    if (s.status === "stopped" && s.endedAt) {
      const ran = (s.endedAt.getTime() - started) / MIN;
      if (ran < s.plannedDurationMinutes * 0.8) {
        failedSessions.push({
          id: s.id,
          planned: s.plannedDurationMinutes,
          ran: Math.round(ran),
          abandoned: false,
          intention: s.intention,
        });
      }
    } else if (
      (s.status === "running" || s.status === "paused") &&
      nowMs - started > (s.plannedDurationMinutes + 60) * MIN
    ) {
      failedSessions.push({
        id: s.id,
        planned: s.plannedDurationMinutes,
        ran: 0,
        abandoned: true,
        intention: s.intention,
      });
    }
  }

  // App usage (entries are cumulative snapshots per day -> take max per app per day) ---
  const perAppDay = new Map<string, number>();
  for (const e of usage) {
    const k = `${e.appName}|${localDate(e.loggedAt.getTime(), tz)}`;
    perAppDay.set(k, Math.max(perAppDay.get(k) ?? 0, e.durationMinutes));
  }
  const perApp = new Map<string, number>();
  const perAppToday = new Map<string, number>();
  for (const [k, minutes] of perAppDay) {
    const [name, day] = k.split("|");
    perApp.set(name, (perApp.get(name) ?? 0) + minutes);
    if (day === today) perAppToday.set(name, minutes);
  }
  const rank = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([name, minutes]) => ({ name, minutes }))
      .sort((a, b) => b.minutes - a.minutes);
  const topApps = rank(perApp).slice(0, 3);
  const topAppToday = rank(perAppToday)[0] ?? null;

  const daysInactive = prevLastActive
    ? Math.floor((nowMs - prevLastActive.getTime()) / DAY)
    : 0;

  return {
    facts: {
      name: user?.name ?? null,
      streak: user?.currentStreak ?? 0,
      bestStreak: user?.bestStreak ?? 0,
      topApps,
      topAppToday,
      focusTodayMin,
      focusSessionsCompletedWeek,
      goalsDoneWeek,
      goalsPendingToday: pendingGoalTitles.length,
      goalsForfeitedWeek,
      goalsMissedNow: missedGoals.length,
      daysInactive,
    },
    missedGoals,
    forfeitedGoals,
    upcomingGoals,
    pendingGoalTitles,
    failedSessions,
  };
}

// ───────────────────────── LLM prompt ─────────────────────────

function buildPrompt(situation: string, facts: string): string {
  return `You write short, high-impact push notifications for "Hadaf", a strict focus and discipline app.
Your job is to make the user feel a real pang of GUILT about not being consistent with their focus sessions and goals so they stop procrastinating and lock in immediately.

Rules:
- Use the USER FACTS. Contrast their lack of consistency (0 focus minutes today, broken streak, unfinished or forfeited goals) against the time they gave to distracting apps (like Instagram, YouTube, TikTok) if available.
- Tone: a sharp, disappointed, no-excuses mentor who knows the user is capable of much more. Speak directly to "you" (and use their first name if known).
- Guilt the INCONSISTENCY and the ACTION, never insult the person's worth. No profanity, no threats, nothing about health, body, family, money or self-harm.
- Title: 3 to 6 punchy words (max 45 chars).
- Body: 1 to 2 sharp sentences, at most 28 words total. End with a call to lock in right now.
- Reply with ONLY a valid JSON object, nothing else: {"title": "...", "body": "..."}

Examples:
SITUATION: The user has not been consistent today (0m focus) while spending time on distracting apps.
{"title": "Consistent on reels, not goals?", "body": "You found time for Instagram today, yet your focus timer is still at 0 minutes. Stop negotiating with weakness and lock in one session right now."}

SITUATION: The user abandoned a 25 minute focus session after 4 minutes.
{"title": "4 minutes. That's your limit?", "body": "You promised 25 minutes and folded after 4. Consistency isn't built when it's easy—get back in and finish what you started."}

SITUATION: ${situation}

USER FACTS:
${facts}`;
}

function parseModelOutput(raw: string): { title: string; body: string } | null {
  const clean = (s: string) =>
    s
      .replace(/\s+/g, " ")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
  const match = raw.match(/\{[\s\S]*?\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as { title?: unknown; body?: unknown };
      if (typeof obj.body === "string" && obj.body.trim().length >= 8) {
        const title =
          typeof obj.title === "string" && obj.title.trim()
            ? clean(obj.title)
            : "Consistency Check";
        return {
          title: title.slice(0, 55),
          body: clean(obj.body).slice(0, 200),
        };
      }
    } catch {
      /* fall through to plain-text handling */
    }
  }
  const firstLine = clean(
    raw.split("\n").find((l) => l.trim().length > 8) ?? "",
  );
  if (firstLine.length >= 8 && !firstLine.startsWith("{"))
    return { title: "Consistency Check", body: firstLine.slice(0, 200) };
  return null;
}

interface Crafted {
  title: string;
  body: string;
  source: "bedrock" | "fallback";
  error?: string;
}

const cache = new Map<string, Crafted>();
const cacheSet = (key: string, value: Crafted) => {
  if (cache.size >= 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, value);
};

async function craft(
  key: string,
  situation: string,
  facts: Facts,
  fallback: { title: string; body: string },
  opts: { useCache?: boolean } = {},
): Promise<Crafted> {
  const useCache = opts.useCache !== false;
  if (useCache) {
    const hit = cache.get(key);
    if (hit) return hit;
  }

  let error: string | undefined;
  if (isBedrockConfigured()) {
    try {
      const raw = await generateWithBedrock(
        buildPrompt(situation, factsToText(facts)),
      );
      const parsed = parseModelOutput(raw);
      if (parsed) {
        const result: Crafted = { ...parsed, source: "bedrock" };
        if (useCache) cacheSet(key, result);
        return result;
      }
      error = `Could not parse model output: ${raw.slice(0, 120)}`;
    } catch (err: any) {
      error = `${err?.name ?? "Error"}: ${err?.message ?? err}`;
      console.warn("[Guilt] Bedrock call failed, using fallback copy:", error);
    }
  } else {
    error =
      "AWS credentials are not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).";
  }
  return { ...fallback, source: "fallback", error };
}

const withApp = (f: Facts, tail: string): string =>
  f.topAppToday
    ? `${f.topAppToday.name} already got ${fmtMin(
        f.topAppToday.minutes,
      )} of your day. ${tail}`
    : f.topApps[0]
      ? `${f.topApps[0].name} got ${fmtMin(
          f.topApps[0].minutes,
        )} this week. ${tail}`
      : tail;

// ───────────────────────── public API ─────────────────────────

export async function buildGuiltNotifications(
  userId: string,
  tz: number,
  prevLastActive: Date | null,
): Promise<{ immediate: GuiltItem[]; scheduled: GuiltItem[] }> {
  const nowMs = Date.now();
  const today = localDate(nowMs, tz);
  const hour = localHour(nowMs, tz);
  // Group day into 3 windows (morning / afternoon / evening) so consistency nudges can fire if the user remains inconsistent
  const daySlot = hour < 12 ? "am" : hour < 17 ? "pm" : "eve";

  const {
    facts,
    missedGoals,
    forfeitedGoals,
    upcomingGoals,
    pendingGoalTitles,
    failedSessions,
  } = await loadAll(userId, tz, prevLastActive);

  // ---- things that already happened (shown now, once per id) ----
  type Pending = {
    id: string;
    trigger: GuiltTrigger;
    situation: string;
    fallback: { title: string; body: string };
  };
  const pending: Pending[] = [];

  for (const s of failedSessions.slice(0, 1)) {
    pending.push({
      id: `failed_focus:${s.id}`,
      trigger: "failed_focus",
      situation: s.abandoned
        ? `The user started a ${s.planned} minute focus session${
            s.intention ? ` ("${s.intention}")` : ""
          } and walked away without finishing.`
        : `The user quit a ${s.planned} minute focus session${
            s.intention ? ` ("${s.intention}")` : ""
          } after only ${s.ran} minutes.`,
      fallback: {
        title: "Focus session abandoned",
        body: s.abandoned
          ? `You started ${s.planned} minutes of focus and walked away. ${withApp(
              facts,
              "Consistency means finishing what you start.",
            )}`
          : `You quit after ${s.ran} of ${s.planned} minutes. ${withApp(
              facts,
              "Your future self noticed.",
            )}`,
      },
    });
  }

  for (const g of missedGoals.slice(0, 1)) {
    pending.push({
      id: `missed_goal:${g.key}`,
      trigger: "missed_goal",
      situation: `The user scheduled the goal "${g.title}" which was due to end at ${fmtClock(
        g.endMs,
        tz,
      )} but never completed it.`,
      fallback: {
        title: "Goal slipped away",
        body: `"${g.title}" was due at ${fmtClock(
          g.endMs,
          tz,
        )} and it's still not done. ${withApp(
          facts,
          "Excuses don't build consistency.",
        )}`,
      },
    });
  }

  if (facts.daysInactive >= INACTIVITY_DAYS && prevLastActive) {
    pending.push({
      id: `inactive:${localDate(prevLastActive.getTime(), tz)}`,
      trigger: "inactive",
      situation: `The user disappeared from Hadaf for ${facts.daysInactive} days, breaking their consistency, and just came back.`,
      fallback: {
        title: "Look who's back",
        body: `${facts.daysInactive} days without opening Hadaf. ${withApp(
          facts,
          "Your goals didn't go anywhere — your consistency did.",
        )}`,
      },
    });
  }

  // Consistency check: if the user has 0 focus minutes today or low weekly consistency, trigger an LLM guilt notification!
  const isInconsistentToday =
    facts.focusTodayMin === 0 ||
    facts.focusSessionsCompletedWeek < 4 ||
    facts.goalsForfeitedWeek > 0 ||
    (facts.streak === 0 && facts.bestStreak > 0);

  if (pending.length === 0 && isInconsistentToday) {
    const goalHint = pendingGoalTitles[0]
      ? ` while "${pendingGoalTitles[0]}" sits untouched`
      : forfeitedGoals[0]
        ? ` after forfeiting "${forfeitedGoals[0].title}"`
        : "";
    pending.push({
      id: `inconsistent:${today}:${daySlot}`,
      trigger: "inconsistent",
      situation: `The user is not being consistent with their discipline (${facts.focusTodayMin}m focused today, ${facts.focusSessionsCompletedWeek} sessions all week, streak: ${facts.streak}d)${goalHint}. Make them feel guilty about their inconsistency and urge them to start a focus session or complete their goal right now.`,
      fallback: {
        title: "Where is your consistency?",
        body: withApp(
          facts,
          `0 focus minutes logged today${goalHint}. Stop breaking promises to yourself and lock in one session right now.`,
        ),
      },
    });
  }

  const immediate: GuiltItem[] = await Promise.all(
    pending.slice(0, 2).map(async (p) => {
      const c = await craft(p.id, p.situation, facts, p.fallback);
      return {
        id: p.id,
        trigger: p.trigger,
        title: c.title,
        body: c.body,
        source: c.source,
      };
    }),
  );

  // ---- things that may happen (phone schedules them, resynced every app open) ----
  const scheduledPending: (Pending & { fireAtMs: number })[] = [];

  // 1. Same-day consistency check (fires 3 hours from now if they don't stay consistent today)
  const sameDayFire = avoidQuietHours(nowMs + 3 * HOUR, tz);
  scheduledPending.push({
    id: `inconsistent_later:${today}:${daySlot}`,
    trigger: "inconsistent",
    fireAtMs: sameDayFire,
    situation: `3 hours have passed and the user still hasn't stayed consistent with their focus sessions and daily goals${
      pendingGoalTitles[0] ? ` (especially "${pendingGoalTitles[0]}")` : ""
    }. Deliver a sharp guilt nudge about choosing distractions over consistency.`,
    fallback: {
      title: "Another day slipping by?",
      body: withApp(
        facts,
        `You still haven't locked in your daily focus. Consistency is built today, not "tomorrow".`,
      ),
    },
  });

  // 2. Next-day consistency check (fires ~22 hours from now so if they skip tomorrow they get called out)
  const nextDayFire = avoidQuietHours(nowMs + 22 * HOUR, tz);
  scheduledPending.push({
    id: `inconsistent_tomorrow:${today}`,
    trigger: "inconsistent",
    fireAtMs: nextDayFire,
    situation: `24 hours have passed since the user last checked in, and they are about to break their daily consistency streak (${facts.streak} day streak). Make them feel guilty about letting another day slip into distraction.`,
    fallback: {
      title: "Don't break the chain",
      body: withApp(
        facts,
        `Skipping one day makes skipping two easy. Open Hadaf and protect your consistency right now.`,
      ),
    },
  });

  // 3. Upcoming goals that become overdue
  for (const g of upcomingGoals.slice(0, 2)) {
    scheduledPending.push({
      id: `missed_goal_future:${g.key}`,
      trigger: "missed_goal",
      fireAtMs: avoidQuietHours(g.endMs + 10 * MIN, tz),
      situation: `The user's goal "${g.title}" was due to end at ${fmtClock(
        g.endMs,
        tz,
      )} and it is still not marked as done.`,
      fallback: {
        title: "Goal still not done?",
        body: `"${g.title}" was due at ${fmtClock(g.endMs, tz)}. ${withApp(
          facts,
          "Did you finish it, or did distraction win again?",
        )}`,
      },
    });
  }

  // 4. 3-day inactivity callout
  const inactiveFire = avoidQuietHours(nowMs + INACTIVITY_DAYS * DAY, tz);
  scheduledPending.push({
    id: `inactive_future:${today}`,
    trigger: "inactive",
    fireAtMs: inactiveFire,
    situation: `The user has not opened Hadaf for ${INACTIVITY_DAYS} days (sent after 3 days of silence).`,
    fallback: {
      title: "3 days of excuses?",
      body: withApp(
        facts,
        `You haven't opened Hadaf in ${INACTIVITY_DAYS} days. Your goals are still waiting on you.`,
      ),
    },
  });

  const scheduled: GuiltItem[] = await Promise.all(
    scheduledPending.map(async (p) => {
      const c = await craft(p.id, p.situation, facts, p.fallback);
      return {
        id: p.id,
        trigger: p.trigger,
        title: c.title,
        body: c.body,
        source: c.source,
        fireAt: new Date(p.fireAtMs).toISOString(),
      };
    }),
  );

  return { immediate, scheduled };
}

/** Debug helper: generates one message on demand and reports why Bedrock failed (if it did). */
export async function generateGuiltPreview(
  userId: string,
  trigger: "missed_goal" | "failed_focus" | "inactive" | "inconsistent",
  tz: number,
): Promise<GuiltItem> {
  const { facts } = await loadAll(userId, tz, null);
  const samples = {
    missed_goal: {
      situation: `The user scheduled the goal "Finish project report" which was due to end at 18:00 but never marked it as done.`,
      fallback: {
        title: "Goal slipped away",
        body: `"Finish project report" was due at 18:00 and it's still not done.`,
      },
    },
    failed_focus: {
      situation: `The user quit a 25 minute focus session after only 4 minutes.`,
      fallback: {
        title: "Focus session abandoned",
        body: `You quit after 4 of 25 minutes. Your future self noticed.`,
      },
    },
    inactive: {
      situation: `The user did not open Hadaf for 4 days and just came back.`,
      fallback: {
        title: "Look who's back",
        body: `4 days without opening Hadaf. Your goals didn't go anywhere - you did.`,
      },
    },
    inconsistent: {
      situation: `The user has not been consistent with their daily focus sessions and goals while spending hours on distracting social media apps.`,
      fallback: {
        title: "Where is your consistency?",
        body: `You found hours for social feeds this week, yet your focus goals sit unfinished. Lock in right now.`,
      },
    },
  }[trigger];

  const c = await craft(
    `preview:${trigger}`,
    samples.situation,
    {
      ...facts,
      daysInactive: trigger === "inactive" ? 4 : facts.daysInactive,
    },
    samples.fallback,
    { useCache: false },
  );
  return {
    id: `preview:${trigger}`,
    trigger,
    title: c.title,
    body: c.body,
    source: c.source,
    error: c.error,
  };
}
