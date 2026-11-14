/**
 * Goal automation (client side):
 *   • local notifications: "goal added", "starts in 15 minutes", "time to start"
 *   • app blocking while a goal window is open (top-3 social apps by screen time)
 *   • reality-check notification after a goal is forfeited
 *
 * Everything here is fully error-tolerant: a failing notification or native call must never break the UI.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { customFetch, type Goal } from "@workspace/api-client-react";
import { AppState, Platform } from "react-native";
import { useEffect } from "react";

import {
  getDeviceUsageStats,
  isNativeAppBlockerSupported,
  isScheduledBlockingSupported,
  setScheduledBlocks,
  startNativeSession,
  stopNativeSession,
  type ScheduledBlockWindow,
} from "../modules/hadaf-native/src";
import { focusSessionState } from "./focusSessionState";

// expo-notifications may be missing from an older binary - never crash the app over it.
let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
} catch {
  console.log("[Goals] expo-notifications is not linked in this build");
}

// ───────────────────────── time helpers ─────────────────────────

export const REMINDER_LEAD_MIN = 15;
const DAY_MS = 86_400_000;
const HORIZON_DAYS = 7;
const PREFIX = "goal-";
const CHANNEL_ID = "goals";

/** Goals store "10:00 AM" (picker) - older rows may be 24h "HH:MM". Accept both. Returns 24h hour/minute. */
export function parseClockTime(value: string | null | undefined): { hour: number; minute: number } | null {
  const m = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (m[3]) hour = (hour % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local "today" -> YYYY-MM-DD, used as the default date of a scheduled goal. */
export function todayKey(): string {
  return localDateKey(new Date());
}

export function formatDateLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" });
}

export interface GoalWindow {
  /** `${goalId}:${YYYY-MM-DD}` */
  id: string;
  goalId: string;
  title: string;
  startMs: number;
  endMs: number;
}

/** All upcoming/active windows of one goal inside the horizon (daily goals repeat every day). */
export function goalWindows(goal: Goal, nowMs = Date.now()): GoalWindow[] {
  const clock = parseClockTime(goal.startTime);
  if (!clock) return [];
  const durationMs = Math.max(1, goal.durationMinutes || 0) * 60_000;
  const out: GoalWindow[] = [];

  const build = (day: Date) => {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), clock.hour, clock.minute, 0, 0);
    const startMs = start.getTime();
    const endMs = startMs + durationMs;
    if (endMs > nowMs) {
      out.push({
        id: `${goal.id}:${localDateKey(start)}`,
        goalId: goal.id,
        title: goal.title,
        startMs,
        endMs,
      });
    }
  };

  if (goal.type === "daily") {
    const today = new Date(nowMs);
    // -1 catches a window that started yesterday evening and runs past midnight.
    for (let i = -1; i <= HORIZON_DAYS; i++) {
      build(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
    }
  } else {
    const key = goal.scheduledDate || localDateKey(new Date(goal.createdAt as any));
    const [y, m, d] = key.split("-").map(Number);
    if (y && m && d) build(new Date(y, m - 1, d));
  }
  return out;
}

const isPending = (g: Goal): boolean => (g.status as string) === "pending";
const wantsBlocking = (g: Goal): boolean => (g as any).blockApps === true;

// ───────────────────────── top social apps ─────────────────────────

/** Social / feed apps we are willing to block (messaging + productivity apps are intentionally NOT here). */
const SOCIAL_APPS: Record<string, string[]> = {
  Instagram: ["com.instagram.android"],
  TikTok: ["com.zhiliaoapp.musically", "com.ss.android.ugc.trill"],
  YouTube: ["com.google.android.youtube"],
  Twitter: ["com.twitter.android"],
  Facebook: ["com.facebook.katana"],
  Snapchat: ["com.snapchat.android"],
  Reddit: ["com.reddit.frontpage"],
  Discord: ["com.discord"],
  Pinterest: ["com.pinterest"],
};
const DEFAULT_TOP_APPS = ["Instagram", "YouTube", "TikTok"];

const PACKAGE_TO_APP: Record<string, string> = {};
for (const [name, pkgs] of Object.entries(SOCIAL_APPS)) for (const p of pkgs) PACKAGE_TO_APP[p] = name;

const ALIASES: Record<string, string> = { x: "Twitter", "x (twitter)": "Twitter" };

function canonicalAppName(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (ALIASES[key]) return ALIASES[key];
  const hit = Object.keys(SOCIAL_APPS).find((n) => n.toLowerCase() === key);
  return hit ?? null;
}

export interface TopSocialApps {
  names: string[];
  packages: string[];
}

let topCache: { at: number; value: TopSocialApps } | null = null;

/** The 3 social apps with the most screen time (device stats -> server summary -> sensible defaults). */
export async function getTopSocialApps(force = false): Promise<TopSocialApps> {
  if (!force && topCache && Date.now() - topCache.at < 10 * 60_000) return topCache.value;

  const minutesByApp = new Map<string, number>();
  const add = (name: string | null, minutes: number) => {
    if (!name || !(minutes > 0)) return;
    minutesByApp.set(name, (minutesByApp.get(name) ?? 0) + minutes);
  };

  try {
    const stats = await getDeviceUsageStats(7);
    for (const s of stats) add(PACKAGE_TO_APP[s.packageName] ?? canonicalAppName(s.appName), s.totalMinutes);
  } catch {
    /* fall through to the server summary */
  }

  if (minutesByApp.size === 0) {
    try {
      const summary = await customFetch<{ appName: string; totalMinutes: number }[]>("/api/app-usage/summary");
      if (Array.isArray(summary)) for (const s of summary) add(canonicalAppName(s.appName), s.totalMinutes);
    } catch {
      /* fall through to defaults */
    }
  }

  const ranked = [...minutesByApp.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const names = [...ranked, ...DEFAULT_TOP_APPS.filter((n) => !ranked.includes(n))].slice(0, 3);
  const value: TopSocialApps = { names, packages: names.flatMap((n) => SOCIAL_APPS[n] ?? []) };
  topCache = { at: Date.now(), value };
  return value;
}

// ───────────────────────── notifications ─────────────────────────

async function notificationsAllowed(): Promise<boolean> {
  if (Platform.OS === "web" || !Notifications) return false;
  try {
    if ((await AsyncStorage.getItem("local_notifications_enabled")) === "false") return false;
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain && perm.status === "undetermined") {
      perm = await Notifications.requestPermissionsAsync();
    }
    if (!perm.granted) return false;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Goal reminders",
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
      });
    }
    return true;
  } catch (e) {
    console.log("[Goals] notification permission check failed:", e);
    return false;
  }
}

const triggerTypes = () => ({
  date: Notifications?.SchedulableTriggerInputTypes?.DATE ?? "date",
  daily: Notifications?.SchedulableTriggerInputTypes?.DAILY ?? "daily",
  interval: Notifications?.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? "timeInterval",
});

async function scheduleAt(identifier: string, title: string, body: string, trigger: any, data: any = {}) {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body, sound: true, data: { goal: true, ...data } },
    trigger: { ...trigger, channelId: CHANNEL_ID },
  });
}

async function cancelByPrefix(prefix: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n: any) => typeof n.identifier === "string" && n.identifier.startsWith(prefix))
      .map((n: any) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Instant confirmation shown right after a goal is saved. */
export async function notifyGoalAdded(goal: Pick<Goal, "title" | "startTime" | "type" | "scheduledDate">, blocking: boolean) {
  try {
    if (!(await notificationsAllowed())) return;
    const when = goal.type === "scheduled" && goal.scheduledDate ? `${formatDateLabel(goal.scheduledDate)} at ${goal.startTime}` : `${goal.startTime}${goal.type === "daily" ? " every day" : ""}`;
    const tail = blocking ? " Your top social apps will be blocked while it runs." : "";
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Goal added ✅",
        body: `"${goal.title}" is set for ${when}. We'll remind you ${REMINDER_LEAD_MIN} minutes before.${tail}`,
        sound: true,
        data: { goal: true },
      },
      trigger: { type: triggerTypes().interval, seconds: 1, channelId: CHANNEL_ID },
    });
  } catch (e) {
    console.log("[Goals] could not show 'goal added' notification:", e);
  }
}

/** Instant reality-check notification built from the LLM answer after a goal / session is abandoned. */
export async function notifyRealityCheck(title: string, body: string) {
  try {
    if (!body || !(await notificationsAllowed())) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: title || "Reality check", body, sound: true, data: { goal: true, forfeit: true } },
      trigger: { type: triggerTypes().interval, seconds: 2, channelId: CHANNEL_ID },
    });
  } catch (e) {
    console.log("[Goals] could not show reality-check notification:", e);
  }
}

/** Rebuilds every reminder: 15-minutes-before + start-time, for all pending goals. */
async function rescheduleReminders(goals: Goal[]) {
  if (!(await notificationsAllowed())) return;
  await cancelByPrefix(PREFIX);
  const T = triggerTypes();
  const now = Date.now();

  for (const g of goals) {
    if (!isPending(g)) continue;
    const clock = parseClockTime(g.startTime);
    if (!clock) continue;
    const blocking = wantsBlocking(g);
    const startBody = blocking
      ? `"${g.title}" starts now. Your top social apps are blocked for ${g.durationMinutes} min — stay on it.`
      : `"${g.title}" starts now. ${g.durationMinutes} minutes of focus — let's go.`;
    const remindBody = `"${g.title}" starts in ${REMINDER_LEAD_MIN} minutes. Wrap up what you're doing${blocking ? " — social apps will lock when it begins" : ""}.`;

    if (g.type === "daily") {
      const remindTotal = (clock.hour * 60 + clock.minute - REMINDER_LEAD_MIN + 1440) % 1440;
      await scheduleAt(`${PREFIX}${g.id}-remind`, "Goal starting soon ⏰", remindBody, {
        type: T.daily,
        hour: Math.floor(remindTotal / 60),
        minute: remindTotal % 60,
      });
      await scheduleAt(`${PREFIX}${g.id}-start`, "Time to start 🎯", startBody, {
        type: T.daily,
        hour: clock.hour,
        minute: clock.minute,
      });
    } else {
      const w = goalWindows(g, now)[0];
      if (!w) continue;
      const remindAt = w.startMs - REMINDER_LEAD_MIN * 60_000;
      if (remindAt > now + 5_000) {
        await scheduleAt(`${PREFIX}${g.id}-remind`, "Goal starting soon ⏰", remindBody, { type: T.date, date: new Date(remindAt) });
      }
      if (w.startMs > now + 5_000) {
        await scheduleAt(`${PREFIX}${g.id}-start`, "Time to start 🎯", startBody, { type: T.date, date: new Date(w.startMs) });
      }
    }
  }
}

// ───────────────────────── app blocking ─────────────────────────

let jsBlockedWindow: string | null = null; // fallback for binaries without scheduled-block support

async function applyBlocking(goals: Goal[]) {
  const now = Date.now();
  const blockingGoals = goals.filter((g) => isPending(g) && wantsBlocking(g));
  const windows = blockingGoals.flatMap((g) => goalWindows(g, now));

  if (windows.length === 0) {
    if (isScheduledBlockingSupported) setScheduledBlocks([]);
    if (jsBlockedWindow) {
      jsBlockedWindow = null;
      void stopNativeSession();
    }
    return;
  }

  const top = await getTopSocialApps();
  if (top.packages.length === 0) return;

  if (isScheduledBlockingSupported) {
    // Enforced natively by the accessibility service, even when Hadaf is closed.
    const payload: ScheduledBlockWindow[] = windows.map((w) => ({
      id: w.id,
      start: w.startMs,
      end: w.endMs,
      pkgs: top.packages,
    }));
    setScheduledBlocks(payload);
    return;
  }

  // Older binary: only works while the app process is alive.
  if (!isNativeAppBlockerSupported || focusSessionState.isActive) return;
  const active = windows.find((w) => w.startMs <= now && now < w.endMs);
  if (active && jsBlockedWindow !== active.id) {
    jsBlockedWindow = active.id;
    await startNativeSession(top.packages, Math.max(1, Math.ceil((active.endMs - now) / 60_000)));
  } else if (!active && jsBlockedWindow) {
    jsBlockedWindow = null;
    await stopNativeSession();
  }
}

/** Is any pending goal with app-blocking switched on running right now? (used for UI hints) */
export function activeBlockingGoal(goals: Goal[], nowMs = Date.now()): GoalWindow | null {
  for (const g of goals) {
    if (!isPending(g) || !wantsBlocking(g)) continue;
    const w = goalWindows(g, nowMs).find((x) => x.startMs <= nowMs && nowMs < x.endMs);
    if (w) return w;
  }
  return null;
}

// ───────────────────────── orchestration ─────────────────────────

let lastSignature = "";
let running = false;

const signatureOf = (goals: Goal[]): string =>
  goals
    .map((g) => [g.id, g.status, g.startTime, g.durationMinutes, g.type, g.scheduledDate ?? "", g.title, wantsBlocking(g) ? 1 : 0].join("|"))
    .sort()
    .join("§");

/**
 * Brings notifications + native blocking in line with the goal list.
 * `force` re-applies even if nothing changed (e.g. when the app returns to the foreground).
 */
export async function syncGoalAutomation(goals: Goal[], force = false): Promise<void> {
  if (Platform.OS === "web" || running) return;
  const signature = signatureOf(goals);
  const unchanged = signature === lastSignature;
  if (unchanged && !force) return;
  running = true;
  try {
    if (!unchanged) {
      lastSignature = signature;
      try {
        await rescheduleReminders(goals);
      } catch (e) {
        console.log("[Goals] reminder scheduling failed:", e);
      }
    }
    try {
      await applyBlocking(goals);
    } catch (e) {
      console.log("[Goals] app-blocking sync failed:", e);
    }
  } finally {
    running = false;
  }
}

/** Mount once inside the signed-in area. Keeps reminders + blocking in sync with the goal list. */
export function useGoalAutomation(goals: Goal[] | undefined) {
  useEffect(() => {
    if (!goals) return;
    void syncGoalAutomation(goals);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void syncGoalAutomation(goals, true);
    });
    // Light heartbeat: rolls the 7-day blocking window forward and (old binaries) starts/stops the JS fallback.
    const timer = setInterval(() => void syncGoalAutomation(goals, true), 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [goals]);
}

