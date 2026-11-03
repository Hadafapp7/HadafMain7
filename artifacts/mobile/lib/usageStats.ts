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
  isOverallOver: boolean;
  diffMinutes: number;
  daysExceeded: number;
  targetPerDay: number;
}

export interface BedrockDiagnosticResult {
  headline: string;
  summary: string;
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

  for (const g of goals) {
    const created = new Date(g.createdAt).getTime();
    if (created >= rangeStartMs) {
      if (g.status === "done") {
        goalsCompleted++;
      } else {
        const [hh, mm] = (g.startTime || "00:00").split(":").map(Number);
        const dateStr = g.scheduledDate || now.toISOString().slice(0, 10);
        const [y, m, d] = dateStr.split("-").map(Number);
        const endMs =
          new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0).getTime() +
          (g.durationMinutes || 30) * 60_000;

        if (endMs < nowMs) {
          goalsMissed++;
        } else {
          goalsForfeited++;
        }
      }
    }
  }

  const totalGoals = goalsCompleted + goalsMissed + goalsForfeited;
  const goalSuccessRate =
    totalGoals > 0 ? Math.round((goalsCompleted / totalGoals) * 100) : 0;

  // ── 3. Screen Time & Intervals ──
  const entriesInRange = entries.filter(
    (e) => new Date(e.loggedAt).getTime() >= rangeStartMs
  );

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

      const dayMinutes = entriesInRange
        .filter((e) => localDayKey(new Date(e.loggedAt)) === key)
        .reduce((sum, e) => sum + e.durationMinutes, 0);

      const isOver = dayMinutes > dailyTargetMin;
      intervals.push({
        key,
        label,
        minutes: dayMinutes,
        targetMinutes: dailyTargetMin,
        isOver,
        overMinutes: isOver ? dayMinutes - dailyTargetMin : 0,
        isCurrent: i === 0,
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

      const wMinutes = entriesInRange
        .filter((e) => {
          const t = new Date(e.loggedAt).getTime();
          return t >= wStartMs && t < wEndMs;
        })
        .reduce((sum, e) => sum + e.durationMinutes, 0);

      const isOver = wMinutes > weekTarget;
      intervals.push({
        key: `week-${4 - w}`,
        label: `Wk ${4 - w}`,
        minutes: wMinutes,
        targetMinutes: weekTarget,
        isOver,
        overMinutes: isOver ? wMinutes - weekTarget : 0,
        isCurrent: w === 0,
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

      const mMinutes = entriesInRange
        .filter((e) => {
          const ed = new Date(e.loggedAt);
          return ed.getFullYear() === yVal && ed.getMonth() === mIdx;
        })
        .reduce((sum, e) => sum + e.durationMinutes, 0);

      const isOver = mMinutes > monthTarget;
      intervals.push({
        key: `${yVal}-${mIdx}`,
        label,
        minutes: mMinutes,
        targetMinutes: monthTarget,
        isOver,
        overMinutes: isOver ? mMinutes - monthTarget : 0,
        isCurrent: i === 0,
      });
    }
  }

  const totalUsedMinutes = intervals.reduce((s, it) => s + it.minutes, 0);
  const daysExceeded = intervals.filter((it) => it.isOver).length;
  const isOverallOver = totalUsedMinutes > totalTargetMinutes;
  const diffMinutes = Math.abs(totalUsedMinutes - totalTargetMinutes);

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
