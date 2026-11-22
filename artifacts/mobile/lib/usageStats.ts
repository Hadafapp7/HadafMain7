import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppUsageEntry, FocusSession, Goal } from "@workspace/api-client-react";
import { useCallback, useEffect, useState } from "react";

export const DEFAULT_TARGET_MIN = 180;
const TARGET_KEY = "hadaf_daily_target_min";
export const MIN_TARGET = 30;
export const MAX_TARGET = 600;
export const TARGET_STEP = 30;

export type PeriodRange = "WEEK" | "MONTH" | "YEAR";

export function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fmtMin(m: number): string {
  const v = Math.max(0, Math.round(m));
  const h = Math.floor(v / 60);
  const r = v % 60;
  if (h > 0 && r > 0) return `${h}h ${r}m`;
  if (h > 0) return `${h}h`;
  return `${v}m`;
}

export function fmtShort(m: number): string {
  if (m <= 0) return "0m";
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10}h`;
}

export interface ChartIntervalStat {
  key: string;
  label: string;
  minutes: number;
  targetMinutes: number;
  isOver: boolean;
  overMinutes: number;
  isCurrent: boolean;
  focusCompleted: number;
  focusForfeited: number;
  focusMinutes: number;
  goalsCompleted: number;
  goalsMissed: number;
  goalsForfeited: number;
}

const SOCIAL_AND_GAME_KEYWORDS = [
  // Social media
  "instagram",
  "tiktok",
  "musically",
  "youtube",
  "snapchat",
  "facebook",
  "twitter",
  "x (twitter)",
  "reddit",
  "discord",
  "twitch",
  "pinterest",
  "threads",
  "whatsapp",
  "telegram",
  "linkedin",
  "bereal",
  "tumblr",
  // Games
  "game",
  "games",
  "gaming",
  "pubg",
  "bgmi",
  "free fire",
  "freefire",
  "call of duty",
  "cod",
  "activision",
  "roblox",
  "minecraft",
  "genshin",
  "candy crush",
  "candycrush",
  "clash of clans",
  "clash royale",
  "brawl stars",
  "brawlstars",
  "supercell",
  "ludo",
  "subway surfers",
  "subwaysurf",
  "8 ball",
  "miniclip",
  "asphalt",
  "gameloft",
  "mobile legends",
  "moonton",
  "fifa",
  "ea sports",
  "efootball",
  "angry birds",
  "rovio",
  "zynga",
  "valorant",
  "fortnite",
  "pokemon",
];

/**
 * Returns true if the app belongs to Social Media or Games.
 * DoomScore and Total Screen Time are calculated exclusively from Social Media and Games.
 */
export function isSocialOrGameApp(
  appName?: string | null,
  category?: string | null,
  packageName?: string | null
): boolean {
  const n = (appName || "").trim().toLowerCase();
  const c = (category || "").trim().toLowerCase();
  const p = (packageName || "").trim().toLowerCase();

  if (
    c === "social" ||
    c === "games" ||
    c === "game" ||
    c === "gaming" ||
    c === "video" ||
    c === "entertainment"
  ) {
    // Exclude non-social music/TV apps from entertainment if needed, or check keywords
    if (c === "social" || c === "games" || c === "game" || c === "gaming") {
      return true;
    }
  }
  if (n === "x") return true;
  return SOCIAL_AND_GAME_KEYWORDS.some(
    (kw) => n.includes(kw) || p.includes(kw) || c.includes(kw)
  );
}

function parseClock12Or24(value?: string | null): { hh: number; mm: number } {
  const m = String(value || "00:00")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return { hh: 0, mm: 0 };
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (m[3]) {
    hh = (hh % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  }
  return { hh: hh > 23 ? 0 : hh, mm: mm > 59 ? 0 : mm };
}

export interface HealthStats {
  score: number;
  scoreLabel: "EXCELLENT" | "HEALTHY" | "NEEDS WORK" | "SLIPPING" | "NEUTRAL";
  focusCompleted: number;
  focusForfeited: number;
  focusTotalMinutes: number;
  focusCompletionRate: number; // 0-100
  goalsCompleted: number;
  goalsMissed: number;
  goalsForfeited: number;
  goalSuccessRate: number; // 0-100
}

export interface PeriodGoalTracker {
  intervals: ChartIntervalStat[];
  totalUsedMinutes: number;
  totalTargetMinutes: number;
  todayUsedMinutes: number;
  dailyAvgUsedMinutes: number;
  isOverallOver: boolean;
  diffMinutes: number;
  daysExceeded: number;
  targetPerDay: number;
}

export interface DiagnosticCardItem {
  title: string;
  text: string;
}

export interface BedrockDiagnosticResult {
  headline: string;
  summary: string;
  cards?: DiagnosticCardItem[];
  laggingPoints: string[];
  actionStep: string;
}

export interface PeriodInsights {
  range: PeriodRange;
  health: HealthStats;
  tracker: PeriodGoalTracker;
  topApps: { appName: string; minutes: number }[];
}

export function computePeriodInsights(
  entries: AppUsageEntry[],
  sessions: FocusSession[],
  goals: Goal[],
  dailyTargetMin: number,
  range: PeriodRange = "WEEK"
): PeriodInsights {
  const now = new Date();
  const nowMs = now.getTime();

  let daysCount = 7;
  if (range === "MONTH") daysCount = 30;
  if (range === "YEAR") daysCount = 365;

  const rangeStartMs = nowMs - daysCount * 86_400_000;

  // ── 1. Focus Sessions in Range ──
  let focusCompleted = 0;
  let focusForfeited = 0;
  let focusTotalMinutes = 0;

  for (const s of sessions) {
    const started = new Date(s.startedAt).getTime();
    if (started >= rangeStartMs) {
      if (s.status === "completed") {
        focusCompleted++;
        focusTotalMinutes += s.plannedDurationMinutes;
      } else if (s.status === "stopped") {
        focusForfeited++;
        if (s.endedAt) {
          const ran = (new Date(s.endedAt).getTime() - started) / 60_000;
          focusTotalMinutes += Math.max(0, Math.round(ran));
        }
      }
    }
  }

  const totalFocusSessions = focusCompleted + focusForfeited;
  const focusCompletionRate =
    totalFocusSessions > 0 ? Math.round((focusCompleted / totalFocusSessions) * 100) : 0;

  // ── 2. Goals in Range ──
  let goalsCompleted = 0;
  let goalsMissed = 0;
  let goalsForfeited = 0;

  const getGoalTimestamp = (g: Goal): number => {
    const statusStr = g.status as string;
    if ((statusStr === "done" || statusStr === "forfeited") && g.updatedAt) {
      const u = new Date(g.updatedAt).getTime();
      if (Number.isFinite(u)) return u;
    }
    const c = new Date(g.createdAt).getTime();
    return Number.isFinite(c) ? c : nowMs;
  };

  const isGoalMissed = (g: Goal): boolean => {
    const statusStr = g.status as string;
    if (statusStr === "done" || statusStr === "forfeited") return false;
    const { hh, mm } = parseClock12Or24(g.startTime);
    const dateStr = g.scheduledDate || localDayKey(now);
    const [y, m, d] = dateStr.split("-").map(Number);
    const endMs =
      new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0).getTime() +
      (g.durationMinutes || 30) * 60_000;
    return endMs < nowMs;
  };

  for (const g of goals) {
    const ts = getGoalTimestamp(g);
    if (ts >= rangeStartMs) {
      const statusStr = g.status as string;
      if (statusStr === "done") {
        goalsCompleted++;
      } else if (statusStr === "forfeited") {
        goalsForfeited++;
      } else if (isGoalMissed(g)) {
        goalsMissed++;
      }
    }
  }

  const totalGoals = goalsCompleted + goalsMissed + goalsForfeited;
  const goalSuccessRate =
    totalGoals > 0 ? Math.round((goalsCompleted / totalGoals) * 100) : 0;

  // ── 3. Screen Time & Intervals (Social Media & Games only, deduplicated per app per day) ──
  const rawEntriesInRange = entries.filter(
    (e) =>
      new Date(e.loggedAt).getTime() >= rangeStartMs &&
      isSocialOrGameApp(e.appName, e.category)
  );

  // Deduplicate cumulative daily sync entries by taking the max duration per (day, appName)
  const dedupedByDayApp = new Map<string, AppUsageEntry>();
  for (const e of rawEntriesInRange) {
    const dayK = localDayKey(new Date(e.loggedAt));
    const mapKey = `${dayK}|${e.appName.toLowerCase()}`;
    const prev = dedupedByDayApp.get(mapKey);
    if (!prev || e.durationMinutes >= prev.durationMinutes) {
      dedupedByDayApp.set(mapKey, e);
    }
  }
  const entriesInRange = Array.from(dedupedByDayApp.values());

  let intervals: ChartIntervalStat[] = [];
  let totalTargetMinutes = 0;

  if (range === "WEEK") {
    // 7 days
    totalTargetMinutes = dailyTargetMin * 7;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = localDayKey(d);
      const label = d.toLocaleDateString("en", { weekday: "short" });

      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayStartMs = dayStart.getTime();
      const dayEndMs = dayStartMs + 86_400_000;

      const dayMinutes = entriesInRange
        .filter((e) => localDayKey(new Date(e.loggedAt)) === key)
        .reduce((sum, e) => sum + e.durationMinutes, 0);

      const dayFocus = sessions.filter((s) => {
        const t = new Date(s.startedAt).getTime();
        return t >= dayStartMs && t < dayEndMs;
      });
      const intervalFocusCompleted = dayFocus.filter((s) => s.status === "completed").length;
      const intervalFocusForfeited = dayFocus.filter((s) => s.status === "stopped").length;
      const intervalFocusMinutes = dayFocus.reduce((sum, s) => {
        if (s.status === "completed") return sum + s.plannedDurationMinutes;
        if (s.endedAt) {
          const dur = (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60_000;
          return sum + Math.max(0, Math.round(dur));
        }
        return sum;
      }, 0);

      const dayGoals = goals.filter((g) => {
        const t = getGoalTimestamp(g);
        return t >= dayStartMs && t < dayEndMs;
      });
      const intervalGoalsCompleted = dayGoals.filter((g) => g.status === "done").length;
      const intervalGoalsForfeited = dayGoals.filter((g) => (g.status as string) === "forfeited").length;
      const intervalGoalsMissed = dayGoals.filter((g) => isGoalMissed(g)).length;

      const isOver = dayMinutes > dailyTargetMin;
      intervals.push({
        key,
        label,
        minutes: dayMinutes,
        targetMinutes: dailyTargetMin,
        isOver,
        overMinutes: isOver ? dayMinutes - dailyTargetMin : 0,
        isCurrent: i === 0,
        focusCompleted: intervalFocusCompleted,
        focusForfeited: intervalFocusForfeited,
        focusMinutes: intervalFocusMinutes,
        goalsCompleted: intervalGoalsCompleted,
        goalsMissed: intervalGoalsMissed,
        goalsForfeited: intervalGoalsForfeited,
      });
    }
  } else if (range === "MONTH") {
    // 4 Weeks
    totalTargetMinutes = dailyTargetMin * 30;
    const weekTarget = dailyTargetMin * 7;
    for (let w = 3; w >= 0; w--) {
      const endOffset = w * 7;
      const startOffset = endOffset + 7;
      const wStartMs = nowMs - startOffset * 86_400_000;
      const wEndMs = nowMs - endOffset * 86_400_000;

      const wEntries = entriesInRange.filter((e) => {
        const t = new Date(e.loggedAt).getTime();
        return t >= wStartMs && t < wEndMs;
      });
      const wMinutes = wEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
      const activeDaysInWeek = Math.max(
        1,
        new Set(wEntries.map((e) => localDayKey(new Date(e.loggedAt)))).size
      );
      const effectiveWeekTarget =
        wEntries.length > 0 && activeDaysInWeek < 7
          ? dailyTargetMin * activeDaysInWeek
          : weekTarget;

      const wFocus = sessions.filter((s) => {
        const t = new Date(s.startedAt).getTime();
        return t >= wStartMs && t < wEndMs;
      });
      const intervalFocusCompleted = wFocus.filter((s) => s.status === "completed").length;
      const intervalFocusForfeited = wFocus.filter((s) => s.status === "stopped").length;
      const intervalFocusMinutes = wFocus.reduce((sum, s) => {
        if (s.status === "completed") return sum + s.plannedDurationMinutes;
        if (s.endedAt) {
          const dur = (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60_000;
          return sum + Math.max(0, Math.round(dur));
        }
        return sum;
      }, 0);

      const wGoals = goals.filter((g) => {
        const t = getGoalTimestamp(g);
        return t >= wStartMs && t < wEndMs;
      });
      const intervalGoalsCompleted = wGoals.filter((g) => g.status === "done").length;
      const intervalGoalsForfeited = wGoals.filter((g) => (g.status as string) === "forfeited").length;
      const intervalGoalsMissed = wGoals.filter((g) => isGoalMissed(g)).length;

      const isOver = wMinutes > effectiveWeekTarget;
      intervals.push({
        key: `week-${4 - w}`,
        label: `Wk ${4 - w}`,
        minutes: wMinutes,
        targetMinutes: weekTarget,
        isOver,
        overMinutes: isOver ? wMinutes - effectiveWeekTarget : 0,
        isCurrent: w === 0,
        focusCompleted: intervalFocusCompleted,
        focusForfeited: intervalFocusForfeited,
        focusMinutes: intervalFocusMinutes,
        goalsCompleted: intervalGoalsCompleted,
        goalsMissed: intervalGoalsMissed,
        goalsForfeited: intervalGoalsForfeited,
      });
    }
  } else {
    // YEAR: 12 months
    totalTargetMinutes = dailyTargetMin * 365;
    const monthTarget = dailyTargetMin * 30;
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(curYear, curMonth - i, 1);
      const mIdx = d.getMonth();
      const yVal = d.getFullYear();
      const label = d.toLocaleDateString("en", { month: "short" });

      const mStart = new Date(yVal, mIdx, 1).getTime();
      const mEnd = new Date(yVal, mIdx + 1, 1).getTime();

      const mEntries = entriesInRange.filter((e) => {
        const ed = new Date(e.loggedAt);
        return ed.getFullYear() === yVal && ed.getMonth() === mIdx;
      });
      const mMinutes = mEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
      const activeDaysInMonth = Math.max(
        1,
        new Set(mEntries.map((e) => localDayKey(new Date(e.loggedAt)))).size
      );
      const effectiveMonthTarget =
        mEntries.length > 0 && activeDaysInMonth < 30
          ? dailyTargetMin * activeDaysInMonth
          : monthTarget;

      const mFocus = sessions.filter((s) => {
        const t = new Date(s.startedAt).getTime();
        return t >= mStart && t < mEnd;
      });
      const intervalFocusCompleted = mFocus.filter((s) => s.status === "completed").length;
      const intervalFocusForfeited = mFocus.filter((s) => s.status === "stopped").length;
      const intervalFocusMinutes = mFocus.reduce((sum, s) => {
        if (s.status === "completed") return sum + s.plannedDurationMinutes;
        if (s.endedAt) {
          const dur = (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60_000;
          return sum + Math.max(0, Math.round(dur));
        }
        return sum;
      }, 0);

      const mGoals = goals.filter((g) => {
        const t = getGoalTimestamp(g);
        return t >= mStart && t < mEnd;
      });
      const intervalGoalsCompleted = mGoals.filter((g) => g.status === "done").length;
      const intervalGoalsForfeited = mGoals.filter((g) => (g.status as string) === "forfeited").length;
      const intervalGoalsMissed = mGoals.filter((g) => isGoalMissed(g)).length;

      const isOver = mMinutes > effectiveMonthTarget;
      intervals.push({
        key: `${yVal}-${mIdx}`,
        label,
        minutes: mMinutes,
        targetMinutes: monthTarget,
        isOver,
        overMinutes: isOver ? mMinutes - effectiveMonthTarget : 0,
        isCurrent: i === 0,
        focusCompleted: intervalFocusCompleted,
        focusForfeited: intervalFocusForfeited,
        focusMinutes: intervalFocusMinutes,
        goalsCompleted: intervalGoalsCompleted,
        goalsMissed: intervalGoalsMissed,
        goalsForfeited: intervalGoalsForfeited,
      });
    }
  }

  const totalUsedMinutes = intervals.reduce((s, it) => s + it.minutes, 0);
  const todayKeyStr = localDayKey(now);
  const todayUsedMinutes = entriesInRange
    .filter((e) => localDayKey(new Date(e.loggedAt)) === todayKeyStr)
    .reduce((sum, e) => sum + e.durationMinutes, 0);
  const activeLoggedDays = Math.max(
    1,
    new Set(entriesInRange.map((e) => localDayKey(new Date(e.loggedAt)))).size
  );
  const dailyAvgUsedMinutes = Math.round(totalUsedMinutes / activeLoggedDays);

  const daysExceeded = intervals.filter((it) => it.isOver).length;
  // Compare actual daily screen time (today or daily average across active logged days) against dailyTargetMin
  // so going above the daily target is ALWAYS flagged as OVER / BAD!
  const effectivePeriodTarget = dailyTargetMin * activeLoggedDays;
  const isOverallOver =
    todayUsedMinutes > dailyTargetMin ||
    dailyAvgUsedMinutes > dailyTargetMin ||
    daysExceeded > 0 ||
    totalUsedMinutes > effectivePeriodTarget;

  const primaryDailyUsed = todayUsedMinutes > 0 ? todayUsedMinutes : dailyAvgUsedMinutes;
  const diffMinutes = isOverallOver
    ? Math.max(
        primaryDailyUsed - dailyTargetMin,
        totalUsedMinutes - effectivePeriodTarget,
        intervals.reduce((max, it) => Math.max(max, it.overMinutes), 0)
      )
    : Math.max(0, dailyTargetMin - primaryDailyUsed);

  // ── 4. Focus Score (0-100) ──
  const isNewUser = totalFocusSessions === 0 && totalGoals === 0;

  let score: number;
  let scoreLabel: HealthStats["scoreLabel"];

  if (isNewUser) {
    // New user with no sessions and no goals: default to neutral
    score = 50;
    scoreLabel = "NEUTRAL";
  } else {
    let sessionWeight = 0;
    let goalWeight = 0;
    let adherenceWeight = 0;

    if (totalFocusSessions > 0 && totalGoals > 0) {
      sessionWeight = (focusCompletionRate / 100) * 45;
      goalWeight = (goalSuccessRate / 100) * 35;
      adherenceWeight = isOverallOver
        ? Math.max(0, 20 - (diffMinutes / Math.max(1, totalTargetMinutes)) * 20)
        : 20;
    } else if (totalFocusSessions > 0) {
      sessionWeight = (focusCompletionRate / 100) * 75;
      adherenceWeight = isOverallOver
        ? Math.max(0, 25 - (diffMinutes / Math.max(1, totalTargetMinutes)) * 25)
        : 25;
    } else {
      goalWeight = (goalSuccessRate / 100) * 75;
      adherenceWeight = isOverallOver
        ? Math.max(0, 25 - (diffMinutes / Math.max(1, totalTargetMinutes)) * 25)
        : 25;
    }

    score = Math.min(100, Math.max(10, Math.round(sessionWeight + goalWeight + adherenceWeight)));
    scoreLabel =
      score >= 80 ? "EXCELLENT" : score >= 65 ? "HEALTHY" : score >= 50 ? "NEEDS WORK" : "SLIPPING";
  }

  // ── 5. Top Apps ──
  const appMap = new Map<string, number>();
  for (const e of entriesInRange) {
    appMap.set(e.appName, (appMap.get(e.appName) ?? 0) + e.durationMinutes);
  }
  const topApps = [...appMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([appName, minutes]) => ({ appName, minutes }));

  return {
    range,
    health: {
      score,
      scoreLabel,
      focusCompleted,
      focusForfeited,
      focusTotalMinutes,
      focusCompletionRate,
      goalsCompleted,
      goalsMissed,
      goalsForfeited,
      goalSuccessRate,
    },
    tracker: {
      intervals,
      totalUsedMinutes,
      totalTargetMinutes,
      todayUsedMinutes,
      dailyAvgUsedMinutes,
      isOverallOver,
      diffMinutes,
      daysExceeded,
      targetPerDay: dailyTargetMin,
    },
    topApps,
  };
}

export function useTargetMinutes(): [number, (v: number) => void] {
  const [target, setTarget] = useState(DEFAULT_TARGET_MIN);

  useEffect(() => {
    AsyncStorage.getItem(TARGET_KEY)
      .then((v) => {
        const n = v ? parseInt(v, 10) : NaN;
        if (!Number.isNaN(n)) setTarget(Math.min(MAX_TARGET, Math.max(MIN_TARGET, n)));
      })
      .catch(() => {});
  }, []);

  const update = useCallback((v: number) => {
    const clamped = Math.min(MAX_TARGET, Math.max(MIN_TARGET, v));
    setTarget(clamped);
    AsyncStorage.setItem(TARGET_KEY, String(clamped)).catch(() => {});
  }, []);

  return [target, update];
}
