import AsyncStorage from "@react-native-async-storage/async-storage";
import { customFetch } from "@workspace/api-client-react";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

// expo-notifications may be missing from an older binary - never crash the app over it.
let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
} catch {
  console.log("[Guilt] expo-notifications is not linked in this build");
}

interface GuiltItem {
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
const SHOWN_KEY = "guilt_shown_ids";
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
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.log("[Guilt] could not set notification handler:", e);
  }
}

async function cancelAllGuilt() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n: any) => typeof n.identifier === "string" && n.identifier.startsWith(PREFIX))
      .map((n: any) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

async function schedule(item: GuiltItem, at: Date, identifier: string) {
  const dateType = Notifications.SchedulableTriggerInputTypes?.DATE ?? "date";
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title: item.title, body: item.body, data: { guilt: true, trigger: item.trigger } },
    trigger: { type: dateType, date: at, channelId: CHANNEL_ID },
  });
}

/**
 * Asks the backend (AWS Bedrock) for guilt messages based on the user's goals, focus sessions
 * and app usage, then shows / schedules them as local notifications.
 * Safe to call as often as you like - it is throttled and fully error-tolerant.
 */
export async function syncGuiltNotifications(force = false): Promise<void> {
  if (Platform.OS === "web" || !Notifications || running) return;
  if (!force && Date.now() - lastSync < MIN_GAP_MS) return;
  running = true;
  lastSync = Date.now();
  try {
    ensureHandler();

    // Respect the master switch from the Notifications settings screen.
    if ((await AsyncStorage.getItem("local_notifications_enabled")) === "false") {
      await cancelAllGuilt();
      return;
    }

    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain && perm.status === "undetermined") {
      perm = await Notifications.requestPermissionsAsync();
    }
    if (!perm.granted) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Hadaf nudges",
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
      });
    }

    const tz = -new Date().getTimezoneOffset();
    const data = await customFetch<GuiltResponse>(`/api/notifications/guilt?tz=${tz}`);

    await cancelAllGuilt();

    const shown: string[] = JSON.parse((await AsyncStorage.getItem(SHOWN_KEY)) ?? "[]");
    const fresh = (data.immediate ?? []).filter((i) => !shown.includes(i.id)).slice(0, 1);
    for (const item of fresh) {
      await schedule(item, new Date(Date.now() + 4000), `${PREFIX}now-${item.id}`);
      shown.push(item.id);
    }
    await AsyncStorage.setItem(SHOWN_KEY, JSON.stringify(shown.slice(-100)));

    for (const item of data.scheduled ?? []) {
      if (!item.fireAt) continue;
      const at = new Date(item.fireAt);
      if (at.getTime() > Date.now() + 30_000) await schedule(item, at, `${PREFIX}${item.id}`);
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
