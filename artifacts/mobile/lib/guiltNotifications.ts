import AsyncStorage from "@react-native-async-storage/async-storage";
import { customFetch } from "@workspace/api-client-react";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import {
  requestNotificationPermission,
  showNativeNotification,
} from "../modules/hadaf-native/src";

// expo-notifications may be missing from an older binary - never crash the app over it.
let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
} catch {
  console.log("[Guilt] expo-notifications is not linked in this build");
}

export interface GuiltItem {
  id: string;
  trigger: string;
  title: string;
  body: string;
  source: string;
  fireAt?: string;
}

interface GuiltResponse {
  immediate: GuiltItem[];
  scheduled: GuiltItem[];
}

const PREFIX = "guilt-";
const SHOWN_KEY = "guilt_shown_ids_v2";
const CHANNEL_ID = "guilt";
const MIN_GAP_MS = 60_000;

let handlerSet = false;
let lastSync = 0;
let running = false;

function ensureHandler() {
  if (handlerSet || !Notifications) return;
  handlerSet = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.log("[Guilt] could not set notification handler:", e);
  }
}

async function cancelAllGuilt() {
  if (!Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(
          (n: any) =>
            typeof n.identifier === "string" && n.identifier.startsWith(PREFIX),
        )
        .map((n: any) =>
          Notifications.cancelScheduledNotificationAsync(n.identifier),
        ),
    );
  } catch {}
}

async function fireImmediateGuilt(item: GuiltItem, identifier: string) {
  // 1. Fire via expo-notifications with trigger: null (immediate heads-up alert)
  if (Notifications) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: item.title,
          body: item.body,
          sound: true,
          priority:
            Notifications.AndroidNotificationPriority?.MAX ?? "max",
          data: { guilt: true, trigger: item.trigger },
        },
        trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null,
      });
      return;
    } catch {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: item.title,
            body: item.body,
            sound: true,
            data: { guilt: true, trigger: item.trigger },
          },
          trigger: null,
        });
        return;
      } catch (e) {
        console.log("[Guilt] immediate expo notification fallback:", e);
      }
    }
  }

  // 2. Native Android notification bridge fallback
  try {
    showNativeNotification(item.title, item.body, false, 0);
  } catch {}
}

async function scheduleFutureGuilt(
  item: GuiltItem,
  at: Date,
  identifier: string,
) {
  if (!Notifications) return;
  const secondsFromNow = Math.max(
    60,
    Math.round((at.getTime() - Date.now()) / 1000),
  );
  const timeIntervalType =
    Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? "timeInterval";
  const dateType = Notifications.SchedulableTriggerInputTypes?.DATE ?? "date";

  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: item.title,
        body: item.body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority?.MAX ?? "max",
        data: { guilt: true, trigger: item.trigger },
      },
      trigger: {
        type: timeIntervalType,
        seconds: secondsFromNow,
        repeats: false,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: item.title,
          body: item.body,
          sound: true,
          data: { guilt: true, trigger: item.trigger },
        },
        trigger: { type: dateType, date: at, channelId: CHANNEL_ID },
      });
    } catch (e) {
      console.log("[Guilt] could not schedule future guilt notification:", e);
    }
  }
}

function currentDaySlotKey(): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(now.getDate()).padStart(2, "0")}`;
  const h = now.getHours();
  const slot = h < 12 ? "am" : h < 17 ? "pm" : "eve";
  return `${dateStr}:${slot}`;
}

/**
 * Fallback consistency guilt builder using the LLM `/api/coach/evaluate-forfeit` or `/api/coach/reality-check`
 * if the backend `/api/notifications/guilt` returned empty (e.g. before backend redeploy).
 */
async function buildClientConsistencyGuilt(
  shownIds: string[],
): Promise<{ immediate: GuiltItem[]; scheduled: GuiltItem[] }> {
  const slotKey = currentDaySlotKey();
  const immediateId = `inconsistent:${slotKey}`;
  const immediate: GuiltItem[] = [];

  if (!shownIds.includes(immediateId)) {
    try {
      // Ask the LLM endpoint to craft a sharp consistency guilt message
      const llmRes = await customFetch<{
        roast?: string;
        title?: string;
      }>("/api/coach/evaluate-forfeit", {
        method: "POST",
        body: JSON.stringify({
          type: "goal",
          reason:
            "Not being consistent with daily focus sessions and procrastinating on goals",
          context: {
            title: "Daily Consistency & Focus",
            plannedMinutes: 30,
          },
        }),
      });

      if (llmRes?.roast) {
        immediate.push({
          id: immediateId,
          trigger: "inconsistent",
          title: "Where is your consistency? ⚠️",
          body: llmRes.roast,
          source: "bedrock",
        });
      }
    } catch {}

    if (immediate.length === 0) {
      immediate.push({
        id: immediateId,
        trigger: "inconsistent",
        title: "Consistency check: 0 excuses left",
        body: "You promised yourself discipline, yet your focus goals are still waiting. Stop scrolling and lock in one focus session right now.",
        source: "fallback",
      });
    }
  }

  const threeHoursLater = new Date(Date.now() + 3 * 3600 * 1000);
  const tomorrow = new Date(Date.now() + 22 * 3600 * 1000);

  const scheduled: GuiltItem[] = [
    {
      id: `inconsistent_later:${slotKey}`,
      trigger: "inconsistent",
      title: "Still procrastinating today?",
      body: immediate[0]?.body ||
        "Hours have passed and your focus timer hasn't moved. Consistency is built today, not tomorrow—lock in now.",
      source: immediate[0]?.source || "fallback",
      fireAt: threeHoursLater.toISOString(),
    },
    {
      id: `inconsistent_tomorrow:${slotKey}`,
      trigger: "inconsistent",
      title: "Don't break your consistency chain 🔥",
      body: "Skipping one day makes skipping two easy. Open Hadaf and complete one focus session to stay consistent.",
      source: "fallback",
      fireAt: tomorrow.toISOString(),
    },
  ];

  return { immediate, scheduled };
}

/**
 * Asks the backend (AWS Bedrock) for guilt messages based on the user's goals, focus sessions
 * and app usage, then shows / schedules them as local notifications.
 * Safe to call as often as you like - it is throttled and fully error-tolerant.
 */
export async function syncGuiltNotifications(force = false): Promise<void> {
  if (Platform.OS === "web" || running) return;
  if (!force && Date.now() - lastSync < MIN_GAP_MS) return;
  running = true;
  lastSync = Date.now();
  try {
    ensureHandler();

    // Respect the master switch from the Notifications settings screen.
    if (
      (await AsyncStorage.getItem("local_notifications_enabled")) === "false"
    ) {
      await cancelAllGuilt();
      return;
    }

    try {
      requestNotificationPermission();
    } catch {}

    if (Notifications) {
      let perm = await Notifications.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        perm = await Notifications.requestPermissionsAsync();
      }
      if (!perm.granted) return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: "Hadaf Reality Checks & Guilt Nudges",
          importance: Notifications.AndroidImportance?.MAX ?? 5,
          enableVibrate: true,
          vibrationPattern: [0, 300, 150, 300],
          sound: "default",
        });
      }
    }

    const shown: string[] = JSON.parse(
      (await AsyncStorage.getItem(SHOWN_KEY)) ?? "[]",
    );

    const tz = -new Date().getTimezoneOffset();
    let data: GuiltResponse = { immediate: [], scheduled: [] };
    try {
      data = await customFetch<GuiltResponse>(
        `/api/notifications/guilt?tz=${tz}`,
      );
    } catch (fetchErr) {
      console.log("[Guilt] Backend guilt fetch failed, using LLM fallback:", fetchErr);
    }

    // If the server returned no immediate or scheduled items (e.g. older backend deployment),
    // generate a consistency guilt notification via the LLM coach endpoint so the user always gets nudged!
    if (
      (!data.immediate || data.immediate.length === 0) &&
      (!data.scheduled || data.scheduled.length <= 1)
    ) {
      const fallbackData = await buildClientConsistencyGuilt(shown);
      if (!data.immediate || data.immediate.length === 0) {
        data.immediate = fallbackData.immediate;
      }
      data.scheduled = [
        ...(data.scheduled ?? []),
        ...fallbackData.scheduled,
      ];
    }

    await cancelAllGuilt();

    const fresh = (data.immediate ?? [])
      .filter((i) => !shown.includes(i.id))
      .slice(0, 1);

    for (const item of fresh) {
      shown.push(item.id);
      setTimeout(() => {
        void fireImmediateGuilt(item, `${PREFIX}now-${item.id}`);
      }, 2500);
    }
    await AsyncStorage.setItem(SHOWN_KEY, JSON.stringify(shown.slice(-100)));

    for (const item of data.scheduled ?? []) {
      if (!item.fireAt) continue;
      const at = new Date(item.fireAt);
      if (at.getTime() > Date.now() + 30_000) {
        await scheduleFutureGuilt(item, at, `${PREFIX}${item.id}`);
      }
    }
  } catch (e) {
    console.log("[Guilt] sync skipped:", e);
  } finally {
    running = false;
  }
}

/** Mount once inside the signed-in area: syncs on launch and every time the app returns to foreground. */
export function useGuiltNotifications() {
  useEffect(() => {
    const first = setTimeout(() => void syncGuiltNotifications(true), 2500);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncGuiltNotifications();
    });
    return () => {
      clearTimeout(first);
      sub.remove();
    };
  }, []);
}
