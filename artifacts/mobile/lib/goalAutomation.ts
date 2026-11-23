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
  dismissNativeNotification,
  getDeviceUsageStats,
  isNativeAppBlockerSupported,
  isScheduledBlockingSupported,
  playNativeCompletionAlarm,
  setScheduledBlocks,
  showNativeNotification,
  startNativeSession,
  stopNativeSession,
  type ScheduledBlockWindow,
} from "../modules/hadaf-native/src";
import { focusSessionState } from "./focusSessionState";
import { isSocialOrGameApp } from "./usageStats";

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
const wantsBlocking = (g: Goal): boolean => (g as any).blockApps !== false;

// ───────────────────────── top social apps ─────────────────────────

/** Known package mappings for blocking apps during goal sessions. */
const SOCIAL_APPS: Record<string, string[]> = {
  Instagram: ["com.instagram.android", "com.instagram.lite"],
  TikTok: ["com.zhiliaoapp.musically", "com.ss.android.ugc.trill"],
  YouTube: ["com.google.android.youtube"],
  Twitter: ["com.twitter.android"],
  Facebook: ["com.facebook.katana", "com.facebook.lite", "com.facebook.orca"],
  Snapchat: ["com.snapchat.android"],
  Reddit: ["com.reddit.frontpage"],
  Discord: ["com.discord"],
  Pinterest: ["com.pinterest"],
  WhatsApp: ["com.whatsapp", "com.whatsapp.w4b"],
  Telegram: ["org.telegram.messenger"],
  Threads: ["com.instagram.barcelona"],
  LinkedIn: ["com.linkedin.android"],
  Netflix: ["com.netflix.mediaclient"],
  Twitch: ["tv.twitch.android.app"],
  Chrome: ["com.android.chrome"],
  Brave: ["com.brave.browser"],
  Spotify: ["com.spotify.music"],
};
const DEFAULT_TOP_APPS = ["Instagram", "YouTube", "WhatsApp", "Chrome", "Snapchat", "Twitter"];
const MOST_USED_CACHE_KEY = "hadaf_most_used_apps_v4";

const PACKAGE_TO_APP: Record<string, string> = {};
for (const [name, pkgs] of Object.entries(SOCIAL_APPS)) for (const p of pkgs) PACKAGE_TO_APP[p] = name;

const ALIASES: Record<string, string> = { x: "Twitter", "x (twitter)": "Twitter" };

function canonicalAppName(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (ALIASES[key]) return ALIASES[key];
  const hit = Object.keys(SOCIAL_APPS).find((n) => n.toLowerCase() === key);
  return hit ?? (raw.trim() || null);
}

export interface TopSocialApps {
  names: string[];
  /** Full list of suggested apps (up to 8) that the user can choose from when creating a goal */
  suggestedNames?: string[];
  packages: string[];
  packagesByApp?: Record<string, string[]>;
}

let topCache: { at: number; value: TopSocialApps } | null = null;

export function resolvePackagesForAppNames(
  appNames: string[],
  packagesByApp?: Record<string, string[]>
): string[] {
  const pkgSet = new Set<string>();
  for (const rawName of appNames) {
    const clean = canonicalAppName(rawName) || rawName.trim();
    const known = SOCIAL_APPS[clean] ?? SOCIAL_APPS[rawName] ?? [];
    for (const kp of known) pkgSet.add(kp);
    const dynamic = packagesByApp?.[clean] ?? packagesByApp?.[rawName] ?? [];
    for (const dp of dynamic) pkgSet.add(dp);
  }
  return Array.from(pkgSet);
}

/**
 * Returns the top 3 default apps + up to 8 suggested apps from the user's actual Most Used Apps list
 * so the user can choose which apps to block out of the suggested block list.
 */
export async function getTopSocialApps(force = false): Promise<TopSocialApps> {
  if (!force && topCache && Date.now() - topCache.at < 2 * 60_000) return topCache.value;

  const minutesByApp = new Map<string, { minutes: number; pkg?: string; isSocialOrGame: boolean }>();
  const add = (
    rawName: string | null | undefined,
    minutes: number,
    pkg?: string | null,
    category?: string | null
  ) => {
    if (!rawName || !(minutes > 0)) return;
    const cleanRaw = rawName.trim();
    const lowerRaw = cleanRaw.toLowerCase();
    // Never include phone call UI in blocked apps
    if (lowerRaw === "call" || lowerRaw === "phone" || lowerRaw.includes("incallui")) return;
    const name = (pkg && PACKAGE_TO_APP[pkg]) || canonicalAppName(cleanRaw) || cleanRaw;
    const prev = minutesByApp.get(name);
    const socialOrGame = isSocialOrGameApp(name, category, pkg);
    minutesByApp.set(name, {
      minutes: Math.max(prev?.minutes ?? 0, minutes),
      pkg: pkg || prev?.pkg,
      isSocialOrGame: Boolean(prev?.isSocialOrGame || socialOrGame),
    });
  };

  try {
    const dailyStats = await getDeviceUsageStats(1);
    for (const s of dailyStats) {
      add(s.appName, s.totalMinutes * 10, s.packageName, s.category);
    }
    const weeklyStats = await getDeviceUsageStats(7);
    for (const s of weeklyStats) {
      if (!minutesByApp.has((s.packageName && PACKAGE_TO_APP[s.packageName]) || canonicalAppName(s.appName) || s.appName)) {
        add(s.appName, s.totalMinutes, s.packageName, s.category);
      }
    }
  } catch {
    /* fall through to cached most used apps */
  }

  if (minutesByApp.size === 0) {
    try {
      const cachedRaw =
        (await AsyncStorage.getItem(MOST_USED_CACHE_KEY)) ||
        (await AsyncStorage.getItem("hadaf_most_used_apps_v3"));
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const mins = (Number(item.dailyMinutes) || 0) * 10 + (Number(item.totalMinutes) || 0);
            add(item.appName, mins, item.packageName, item.category);
          }
        }
      }
    } catch {}
  }

  if (minutesByApp.size === 0) {
    try {
      const summary = await customFetch<{ appName: string; totalMinutes: number; category?: string }[]>(
        "/api/app-usage/summary"
      );
      if (Array.isArray(summary)) {
        for (const s of summary) add(s.appName, s.totalMinutes, undefined, s.category);
      }
    } catch {
      /* fall through to defaults */
    }
  }

  // Sort: prioritize social media & games from the user's actual used apps, then other used apps by minutes
  const entries = [...minutesByApp.entries()].sort((a, b) => {
    if (a[1].isSocialOrGame !== b[1].isSocialOrGame) {
      return a[1].isSocialOrGame ? -1 : 1;
    }
    return b[1].minutes - a[1].minutes;
  });

  const ranked = entries.map(([name]) => name);
  const suggestedSet = new Set<string>(ranked);
  for (const fallbackApp of DEFAULT_TOP_APPS) {
    if (suggestedSet.size < 6) suggestedSet.add(fallbackApp);
  }
  const suggestedNames = Array.from(suggestedSet).slice(0, 8);
  const names = (ranked.length > 0 ? ranked : DEFAULT_TOP_APPS).slice(0, 3);

  const packagesByApp: Record<string, string[]> = {};
  for (const n of suggestedNames) {
    const appPkgs = new Set<string>(SOCIAL_APPS[n] ?? []);
    const dyn = minutesByApp.get(n)?.pkg;
    if (dyn) appPkgs.add(dyn);
    packagesByApp[n] = Array.from(appPkgs);
  }

  const pkgSet = new Set<string>();
  for (const n of names) {
    for (const p of packagesByApp[n] ?? []) pkgSet.add(p);
  }
  const value: TopSocialApps = {
    names,
    suggestedNames,
    packages: Array.from(pkgSet),
    packagesByApp,
  };
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

/**
 * Rebuilds every reminder for all pending goals based on priority:
 *  - critical: many reminders (-60m, -45m, -30m) + 3 times in the last 15 minutes (-15m, -10m, -5m) + start (0m) + mid-goal + end alarm
 *  - high: -30m + 2 times in the last 15 minutes (-15m, -5m) + start (0m) + end alarm
 *  - medium: 1 time in the last 15 minutes (-15m) + start (0m) + end alarm
 *  - low: 1 light heads-up (-5m) + start (0m) + end alarm
 */
async function rescheduleReminders(goals: Goal[]) {
  if (!(await notificationsAllowed())) return;
  await cancelByPrefix(PREFIX);
  const T = triggerTypes();
  const now = Date.now();

  const priorityLeadOffsets: Record<string, number[]> = {
    critical: [60, 45, 30, 15, 10, 5],
    high: [30, 15, 5],
    medium: [15],
    low: [5],
  };

  for (const g of goals) {
    if (!isPending(g)) continue;
    const clock = parseClockTime(g.startTime);
    if (!clock) continue;
    const blocking = wantsBlocking(g);
    const prio = (g.priority || "medium").toLowerCase();
    const offsets = priorityLeadOffsets[prio] ?? priorityLeadOffsets.medium;
    const prioTag =
      prio === "critical"
        ? "🚨 CRITICAL GOAL"
        : prio === "high"
          ? "🔥 HIGH PRIORITY"
          : prio === "medium"
            ? "⏰ GOAL REMINDER"
            : "📌 GOAL HEADS-UP";

    const startBody = blocking
      ? `"${g.title}" starts NOW (${g.durationMinutes} min). Your top social apps are locked — zero excuses, execute now.`
      : `"${g.title}" starts NOW (${g.durationMinutes} min). Lock in and execute.`;

    const endBody = `Time is up for "${g.title}" (${g.durationMinutes} min). Open Hadaf and verify honestly if you truly completed it.`;

    if (g.type === "daily") {
      for (const leadMin of offsets) {
        const remindTotal = (clock.hour * 60 + clock.minute - leadMin + 1440) % 1440;
        const remindBody =
          prio === "critical" && leadMin <= 15
            ? `URGENT (${leadMin}m left): "${g.title}" starts in ${leadMin} minutes! Drop everything and prepare${blocking ? " — social apps lock at start" : ""}.`
            : `"${g.title}" starts in ${leadMin} minutes. Wrap up what you're doing${blocking ? " — social apps will lock when it begins" : ""}.`;
        await scheduleAt(`${PREFIX}${g.id}-remind-${leadMin}m`, `${prioTag} · ${leadMin}m`, remindBody, {
          type: T.daily,
          hour: Math.floor(remindTotal / 60),
          minute: remindTotal % 60,
        });
      }
      await scheduleAt(`${PREFIX}${g.id}-start`, `${prioTag} STARTING 🎯`, startBody, {
        type: T.daily,
        hour: clock.hour,
        minute: clock.minute,
      });
      const endTotal = (clock.hour * 60 + clock.minute + Math.max(1, g.durationMinutes || 30)) % 1440;
      await scheduleAt(`${PREFIX}${g.id}-end`, "Goal Duration Complete ⏰", endBody, {
        type: T.daily,
        hour: Math.floor(endTotal / 60),
        minute: endTotal % 60,
      });
    } else {
      const w = goalWindows(g, now)[0];
      if (!w) continue;
      for (const leadMin of offsets) {
        const remindAt = w.startMs - leadMin * 60_000;
        if (remindAt > now + 3_000) {
          const remindBody =
            prio === "critical" && leadMin <= 15
              ? `URGENT (${leadMin}m left): "${g.title}" starts in ${leadMin} minutes! Drop everything and prepare${blocking ? " — social apps lock at start" : ""}.`
              : `"${g.title}" starts in ${leadMin} minutes. Wrap up what you're doing${blocking ? " — social apps will lock when it begins" : ""}.`;
          await scheduleAt(
            `${PREFIX}${g.id}-remind-${leadMin}m`,
            `${prioTag} · ${leadMin}m`,
            remindBody,
            { type: T.date, date: new Date(remindAt) }
          );
        }
      }
      if (w.startMs > now + 3_000) {
        await scheduleAt(`${PREFIX}${g.id}-start`, `${prioTag} STARTING 🎯`, startBody, {
          type: T.date,
          date: new Date(w.startMs),
        });
      }
      // For critical goals, also schedule a mid-session accountability check-in
      if (prio === "critical" && g.durationMinutes >= 20) {
        const midAt = w.startMs + Math.round((g.durationMinutes * 60_000) / 2);
        if (midAt > now + 5_000) {
          await scheduleAt(
            `${PREFIX}${g.id}-mid`,
            "🚨 CRITICAL GOAL CHECK-IN",
            `Halfway through "${g.title}". Stay locked in — don't you dare quit now.`,
            { type: T.date, date: new Date(midAt) }
          );
        }
      }
      if (w.endMs > now + 3_000) {
        await scheduleAt(`${PREFIX}${g.id}-end`, "Goal Duration Complete ⏰", endBody, {
          type: T.date,
          date: new Date(w.endMs),
        });
      }
    }
  }
}

// ───────────────────────── app blocking ─────────────────────────

let jsBlockedWindow: string | null = null; // fallback for binaries without scheduled-block support

async function applyBlocking(goals: Goal[]) {
  const now = Date.now();
  const blockingGoals = goals.filter((g) => isPending(g) && wantsBlocking(g));
  const windowsWithGoal = blockingGoals.flatMap((g) =>
    goalWindows(g, now).map((w) => ({ window: w, goal: g }))
  );

  if (windowsWithGoal.length === 0) {
    if (isScheduledBlockingSupported) setScheduledBlocks([]);
    if (jsBlockedWindow) {
      jsBlockedWindow = null;
      void stopNativeSession();
    }
    return;
  }

  const top = await getTopSocialApps();
  if (top.packages.length === 0) return;

  const pkgsForGoal = (g: Goal): string[] => {
    const chosen = (g as any).blockedApps;
    if (Array.isArray(chosen) && chosen.length > 0) {
      const resolved = resolvePackagesForAppNames(chosen, top.packagesByApp);
      if (resolved.length > 0) return resolved;
    }
    return top.packages;
  };

  if (isScheduledBlockingSupported) {
    // 1. Save full schedule to SharedPreferences for background persistence
    const payload: ScheduledBlockWindow[] = windowsWithGoal.map(({ window: w, goal: g }) => ({
      id: w.id,
      start: w.startMs,
      end: w.endMs,
      pkgs: pkgsForGoal(g),
    }));
    setScheduledBlocks(payload);
  }

  // 2. Also directly activate startNativeSession whenever a goal window is currently active!
  if (!isNativeAppBlockerSupported) return;
  const activeItem = windowsWithGoal.find(({ window: w }) => w.startMs <= now && now < w.endMs);
  if (activeItem) {
    const active = activeItem.window;
    const targetPkgs = pkgsForGoal(activeItem.goal);
    const remainingMins = Math.max(1, Math.ceil((active.endMs - now) / 60_000));
    if (jsBlockedWindow !== active.id) {
      jsBlockedWindow = active.id;
    }
    await startNativeSession(targetPkgs, remainingMins);
  } else if (!activeItem && jsBlockedWindow) {
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

/** Returns the currently active pending goal and its window (whether app blocking is on or off). */
export function findActiveGoalSession(
  goals: Goal[],
  nowMs = Date.now()
): { goal: Goal; window: GoalWindow; remainingSeconds: number; totalSeconds: number } | null {
  for (const g of goals) {
    if (!isPending(g)) continue;
    const w = goalWindows(g, nowMs).find((x) => x.startMs <= nowMs && nowMs < x.endMs);
    if (w) {
      const remainingSeconds = Math.max(0, Math.ceil((w.endMs - nowMs) / 1000));
      const totalSeconds = Math.max(60, (g.durationMinutes || 30) * 60);
      return { goal: g, window: w, remainingSeconds, totalSeconds };
    }
  }
  return null;
}

export { showNativeNotification, dismissNativeNotification, playNativeCompletionAlarm };

// ───────────────────────── orchestration ─────────────────────────

let lastSignature = "";
let running = false;

const signatureOf = (goals: Goal[]): string =>
  goals
    .map((g) => [
      g.id,
      g.status,
      g.startTime,
      g.durationMinutes,
      g.type,
      g.scheduledDate ?? "",
      g.title,
      wantsBlocking(g) ? 1 : 0,
      Array.isArray((g as any).blockedApps) ? (g as any).blockedApps.join(",") : "",
    ].join("|"))
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

