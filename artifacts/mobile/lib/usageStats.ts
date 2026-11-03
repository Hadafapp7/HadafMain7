import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppUsageEntry, FocusSession } from "@workspace/api-client-react";
import { useCallback, useEffect, useState } from "react";

/** Pure analytics helpers behind the "where am I lagging" section of the Analytics tab. */

export const DEFAULT_TARGET_MIN = 180;
const TARGET_KEY = "hadaf_daily_target_min";
export const MIN_TARGET = 30;
export const MAX_TARGET = 600;
export const TARGET_STEP = 30;

export const CATEGORY_COLORS = ["#0a0a0a", "#3b82f6", "#f97316", "#10b981", "#a855f7", "#a1a1aa"];

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

/** Compact label for chart bars: "45m", "2.5h". */
export function fmtShort(m: number): string {
  if (m <= 0) return "";
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10}h`;
}

export interface DayStat {
  key: string;
  /** "Mon" */
  label: string;
  /** "M" */
  initial: string;
  minutes: number;
  focusMinutes: number;
  isToday: boolean;
}

export interface CategoryStat {
  name: string;
  minutes: number;
  share: number;
  color: string;
}

export type Severity = "high" | "medium" | "good";

export interface Insight {
  id: string;
  severity: Severity;
  icon: string;
  title: string;
  detail: string;
}

export interface WeekInsights {
  hasData: boolean;
  days: DayStat[];
  targetMin: number;
  totalMinutes: number;
  prevTotalMinutes: number;
  /** % change of screen time vs the previous 7 days (null when there is nothing to compare). */
  weekDeltaPct: number | null;
  avgDaily: number;
  activeDays: number;
  daysOver: number;
  categories: CategoryStat[];
  focusMinutes: number;
  focusCompleted: number;
  focusStopped: number;
  completionRate: number | null;
  /** Screen minutes spent for every focused minute (null when no focus yet). */
  screenPerFocus: number | null;
  score: number;
  scoreLabel: string;
  scoreParts: { label: string; value: number; max: number }[];
  insights: Insight[];
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, good: 2 };

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function computeWeekInsights(
  entries: AppUsageEntry[],
  sessions: FocusSession[],
  targetMin: number,
): WeekInsights {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: DayStat[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en", { weekday: "short" });
    days.push({ key: localDayKey(d), label, initial: label.charAt(0), minutes: 0, focusMinutes: 0, isToday: i === 0 });
  }
  const dayIndex = new Map(days.map((d, i) => [d.key, i]));

  const prevKeys = new Set<string>();
  for (let i = 7; i <= 13; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    prevKeys.add(localDayKey(d));
  }

  // ── Screen time ──
  const catMap = new Map<string, number>();
  const appMap = new Map<string, number>();
  let prevTotal = 0;
  for (const e of entries) {
    const key = localDayKey(new Date(e.loggedAt));
    const mins = Number(e.durationMinutes) || 0;
    const i = dayIndex.get(key);
    if (i !== undefined) {
      days[i].minutes += mins;
      const cat = titleCase((e.category ?? "").trim().toLowerCase()) || "Other";
      catMap.set(cat, (catMap.get(cat) ?? 0) + mins);
      appMap.set(e.appName, (appMap.get(e.appName) ?? 0) + mins);
    } else if (prevKeys.has(key)) {
      prevTotal += mins;
    }
  }

  // ── Focus sessions ──
  let focusCompleted = 0;
  let focusStopped = 0;
  for (const s of sessions) {
    if (s.status === "running" || s.status === "paused") continue;
    const start = new Date(s.startedAt);
    const i = dayIndex.get(localDayKey(start));
    if (i === undefined) continue;
    const planned = Number(s.plannedDurationMinutes) || 0;
    let mins = 0;
    if (s.status === "completed") {
      mins = planned;
      focusCompleted++;
    } else {
      focusStopped++;
      if (s.endedAt) mins = Math.min(planned, Math.max(0, Math.round((new Date(s.endedAt).getTime() - start.getTime()) / 60000)));
    }
    days[i].focusMinutes += mins;
  }

  const totalMinutes = days.reduce((s, d) => s + d.minutes, 0);
  const focusMinutes = days.reduce((s, d) => s + d.focusMinutes, 0);
  const activeDays = days.filter((d) => d.minutes > 0).length;
  const daysOver = days.filter((d) => d.minutes > targetMin).length;
  const avgDaily = activeDays > 0 ? totalMinutes / activeDays : 0;
  const weekDeltaPct = prevTotal > 0 ? Math.round(((totalMinutes - prevTotal) / prevTotal) * 100) : null;
  const ended = focusCompleted + focusStopped;
  const completionRate = ended > 0 ? focusCompleted / ended : null;
  const screenPerFocus = focusMinutes > 0 ? totalMinutes / focusMinutes : null;

  const categories: CategoryStat[] = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, minutes], i) => ({
      name,
      minutes,
      share: totalMinutes > 0 ? minutes / totalMinutes : 0,
      color: CATEGORY_COLORS[Math.min(i, CATEGORY_COLORS.length - 1)],
    }));
  const topApps = [...appMap.entries()].sort((a, b) => b[1] - a[1]);

  const hasData = totalMinutes > 0 || ended > 0;

  // ── Focus score (0-100) ──
  let screenPts = 0;
  if (activeDays > 0) {
    const ratio = avgDaily / Math.max(1, targetMin);
    screenPts = ratio <= 1 ? 50 : Math.max(0, 50 * (2 - ratio));
  }
  const focusPts = Math.min(1, focusMinutes / 140) * 30;
  const consistencyPts = activeDays > 0 ? ((activeDays - daysOver) / activeDays) * 20 : 0;
  const score = hasData ? Math.round(screenPts + focusPts + consistencyPts) : 0;
  const scoreLabel = !hasData ? "NO DATA YET" : score >= 75 ? "STRONG" : score >= 50 ? "ON TRACK" : score >= 30 ? "NEEDS WORK" : "SLIPPING";

  // ── Insights ──
  const insights: Insight[] = [];
  if (activeDays > 0 && avgDaily > targetMin) {
    insights.push({
      id: "over-target",
      severity: avgDaily > targetMin * 1.3 ? "high" : "medium",
      icon: "schedule",
      title: "Over your daily target",
      detail: `You average ${fmtMin(avgDaily)} a day, ${fmtMin(avgDaily - targetMin)} above your ${fmtMin(targetMin)} target.`,
    });
  }
  if (weekDeltaPct !== null && weekDeltaPct >= 15) {
    insights.push({
      id: "week-up",
      severity: weekDeltaPct >= 35 ? "high" : "medium",
      icon: "trending-up",
      title: `Screen time is up ${weekDeltaPct}%`,
      detail: `${fmtMin(totalMinutes)} this week vs ${fmtMin(prevTotal)} the week before.`,
    });
  } else if (weekDeltaPct !== null && weekDeltaPct <= -10) {
    insights.push({
      id: "week-down",
      severity: "good",
      icon: "trending-down",
      title: `Screen time is down ${Math.abs(weekDeltaPct)}%`,
      detail: `${fmtMin(totalMinutes)} this week vs ${fmtMin(prevTotal)} the week before. Keep it up!`,
    });
  }
  const topCat = categories[0];
  if (topCat && topCat.name !== "Other" && topCat.share >= 0.45 && categories.length > 1) {
    insights.push({
      id: "category",
      severity: "medium",
      icon: "pie-chart",
      title: `${topCat.name} apps dominate`,
      detail: `${Math.round(topCat.share * 100)}% of your week (${fmtMin(topCat.minutes)}) goes to ${topCat.name.toLowerCase()} apps.`,
    });
  }
  if (topApps[0] && totalMinutes > 0 && topApps[0][1] / totalMinutes >= 0.3) {
    insights.push({
      id: "top-app",
      severity: "medium",
      icon: "smartphone",
      title: `${topApps[0][0]} is your biggest time sink`,
      detail: `${Math.round((topApps[0][1] / totalMinutes) * 100)}% of your screen time, ${fmtMin(topApps[0][1])} this week.`,
    });
  }
  if (hasData && focusMinutes < 60) {
    insights.push({
      id: "low-focus",
      severity: focusMinutes === 0 ? "high" : "medium",
      icon: "center-focus-strong",
      title: "Not enough focus time",
      detail:
        focusMinutes === 0
          ? "No focus sessions this week. Even one 25-minute session a day builds the habit."
          : `Only ${fmtMin(focusMinutes)} focused this week. Aim for about 20 minutes a day.`,
    });
  }
  if (completionRate !== null && ended >= 2 && completionRate < 0.6) {
    insights.push({
      id: "early-stop",
      severity: "medium",
      icon: "pause-circle-filled",
      title: "You end sessions early",
      detail: `${focusStopped} of ${ended} focus sessions were stopped before the timer finished.`,
    });
  }
  const heaviest = days.reduce((best, d) => (d.minutes > best.minutes ? d : best), days[0]);
  if (activeDays >= 3 && heaviest.minutes > targetMin * 1.2) {
    insights.push({
      id: "heavy-day",
      severity: "medium",
      icon: "event",
      title: `${heaviest.label} was your heaviest day`,
      detail: `${fmtMin(heaviest.minutes)} on screen, ${fmtMin(heaviest.minutes - targetMin)} over target.`,
    });
  }
  if (activeDays >= 3 && daysOver === 0) {
    insights.push({
      id: "on-target",
      severity: "good",
      icon: "check-circle",
      title: "On target all week",
      detail: `Every tracked day stayed under ${fmtMin(targetMin)}. Nice discipline.`,
    });
  }
  if (focusMinutes >= 140) {
    insights.push({
      id: "good-focus",
      severity: "good",
      icon: "emoji-events",
      title: "Strong focus habit",
      detail: `${fmtMin(focusMinutes)} of focused time this week.`,
    });
  }
  insights.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    hasData,
    days,
    targetMin,
    totalMinutes,
    prevTotalMinutes: prevTotal,
    weekDeltaPct,
    avgDaily,
    activeDays,
    daysOver,
    categories,
    focusMinutes,
    focusCompleted,
    focusStopped,
    completionRate,
    screenPerFocus,
    score,
    scoreLabel,
    scoreParts: [
      { label: "Screen time", value: Math.round(screenPts), max: 50 },
      { label: "Focus habit", value: Math.round(focusPts), max: 30 },
      { label: "Consistency", value: Math.round(consistencyPts), max: 20 },
    ],
    insights: insights.slice(0, 5),
  };
}

/** The user's daily screen-time goal, saved on the device. */
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

