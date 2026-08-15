/**
 * hadaf-native — TypeScript bridge
 *
 * This module wraps the native Kotlin (Android) and Swift (iOS) modules
 * with a unified, type-safe API that your React Native screens import.
 *
 * On the Expo Managed Workflow preview (running in Expo Go / the Replit dev
 * server), all functions fall back to no-ops / mock data so the JS screens
 * still render. Real native behaviour only activates in a dev-client or
 * production build (EAS Build / Android Studio / Xcode).
 */
import { Platform } from "react-native";
import { requireNativeModule } from "expo";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AppUsageStat {
  appName: string;
  packageName: string; // Android package / iOS bundle ID
  totalMinutes: number;
  category: string;
}

export interface NativePermissionStatus {
  hasUsagePermission: boolean;
  hasAccessibilityPermission: boolean;
  hasOverlayPermission: boolean;
}

// ── Module resolution ──────────────────────────────────────────────────────

let UsageStatsNative: any = null;
let AppBlockerNative: any = null;

try {
  UsageStatsNative = requireNativeModule("HadafUsageStats");
} catch (e: any) {
  console.log(`[HadafNative] HadafUsageStats module is not available in this build: ${e.message}`);
}

try {
  AppBlockerNative = requireNativeModule("HadafAppBlocker");
} catch (e: any) {
  console.log(`[HadafNative] HadafAppBlocker module is not available in this build: ${e.message}`);
}

export const isNativeAppBlockerSupported = AppBlockerNative !== null;

const isAndroid = Platform.OS === "android";
const isIOS     = Platform.OS === "ios";
const isNative  = isAndroid || isIOS;

// ── Usage Stats ────────────────────────────────────────────────────────────

/**
 * Returns whether the device has granted the Usage Access permission.
 * Android: PACKAGE_USAGE_STATS  |  iOS: FamilyControls authorisation
 */
export function hasUsagePermission(): boolean {
  if (!isNative || !UsageStatsNative) return false;
  return UsageStatsNative.hasUsagePermission() as boolean;
}

/**
 * Opens the OS screen where the user can grant Usage Access.
 * Android → Settings > Special App Access > Usage Access
 * iOS     → shows an in-app FamilyControls system sheet
 */
export async function requestUsagePermission(): Promise<boolean> {
  if (!isNative || !UsageStatsNative) return false;
  if (isIOS && typeof UsageStatsNative.requestUsagePermission === "function") {
    return UsageStatsNative.requestUsagePermission() as Promise<boolean>;
  }
  if (isAndroid && typeof UsageStatsNative.openUsageAccessSettings === "function") {
    UsageStatsNative.openUsageAccessSettings();
  }
  return false;
}

/**
 * Fetch real per-app usage statistics from the device.
 * Returns up to 30 apps sorted by totalMinutes descending.
 * Falls back to an empty array when permission is not granted or on web.
 */
export async function getDeviceUsageStats(
  days: number = 7
): Promise<AppUsageStat[]> {
  if (!isNative || !UsageStatsNative) return [];
  try {
    const raw = await UsageStatsNative.getUsageStats(days) as AppUsageStat[];
    return raw ?? [];
  } catch {
    return [];
  }
}

// ── App Blocker ────────────────────────────────────────────────────────────

/**
 * Check all required permissions in one call.
 */
export function getPermissionStatus(): NativePermissionStatus {
  if (!isNative || !AppBlockerNative) {
    return {
      hasUsagePermission:         false,
      hasAccessibilityPermission: false,
      hasOverlayPermission:       false,
    };
  }
  return {
    hasUsagePermission:         hasUsagePermission(),
    hasAccessibilityPermission: AppBlockerNative.hasAccessibilityPermission() as boolean,
    hasOverlayPermission:       AppBlockerNative.hasOverlayPermission() as boolean,
  };
}

/**
 * Open the Accessibility settings screen (Android only).
 * iOS uses FamilyControls — no Settings redirect needed.
 */
export function openAccessibilitySettings(): void {
  if (!isNative || !AppBlockerNative) return;
  AppBlockerNative.openAccessibilitySettings();
}

/**
 * Open the Overlay / Draw over other apps settings screen (Android only).
 */
export function openOverlaySettings(): void {
  if (!isNative || !AppBlockerNative) return;
  AppBlockerNative.openOverlaySettings();
}

/**
 * Start a focus session — instructs the native layer to begin blocking the
 * specified apps/packages.
 *
 * @param identifiers  On Android: package names (e.g. "com.instagram.android")
 *                     On iOS: bundle IDs (e.g. "com.burbn.instagram")
 * @param durationMinutes  Session length in minutes
 */
export async function startNativeSession(
  identifiers: string[],
  durationMinutes: number
): Promise<void> {
  if (!isNative || !AppBlockerNative) return;
  try {
    if (isAndroid) {
      AppBlockerNative.startSession(identifiers, durationMinutes);
    } else {
      await AppBlockerNative.startSession(identifiers, durationMinutes);
    }
  } catch (e) {
    console.warn("[HadafNative] startSession failed:", e);
  }
}

/**
 * End the current focus session — removes all app blocks.
 */
export async function stopNativeSession(): Promise<void> {
  if (!isNative || !AppBlockerNative) return;
  try {
    if (isAndroid) {
      AppBlockerNative.stopSession();
    } else {
      await AppBlockerNative.stopSession();
    }
  } catch (e) {
    console.warn("[HadafNative] stopSession failed:", e);
  }
}

/**
 * Returns true if a native focus session is currently active.
 */
export function isNativeSessionActive(): boolean {
  if (!isNative || !AppBlockerNative) return false;
  return AppBlockerNative.isSessionActive() as boolean;
}

// ── Package → App name lookup table ───────────────────────────────────────
// Maps common Android package names and iOS bundle IDs to human-readable
// app names and categories so the UI can display them nicely.

export const KNOWN_APPS: Record<string, { name: string; category: string }> = {
  // Android packages
  "com.instagram.android":          { name: "Instagram",  category: "Social"         },
  "com.zhiliaoapp.musically":       { name: "TikTok",     category: "Entertainment"  },
  "com.ss.android.ugc.trill":       { name: "TikTok",     category: "Entertainment"  },
  "com.google.android.youtube":     { name: "YouTube",    category: "Entertainment"  },
  "com.twitter.android":            { name: "Twitter",    category: "Social"         },
  "com.reddit.frontpage":           { name: "Reddit",     category: "Social"         },
  "com.facebook.katana":            { name: "Facebook",   category: "Social"         },
  "com.snapchat.android":           { name: "Snapchat",   category: "Social"         },
  "com.netflix.mediaclient":        { name: "Netflix",    category: "Entertainment"  },
  "com.discord":                    { name: "Discord",    category: "Social"         },
  "tv.twitch.android.app":          { name: "Twitch",     category: "Entertainment"  },
  "com.whatsapp":                   { name: "WhatsApp",   category: "Social"         },
  "com.spotify.music":              { name: "Spotify",    category: "Entertainment"  },
  "com.linkedin.android":           { name: "LinkedIn",   category: "Productivity"   },
  "com.pinterest":                  { name: "Pinterest",  category: "Social"         },
  "com.amazon.mShop.android.shopping": { name: "Amazon", category: "Shopping"       },
  // iOS bundle IDs
  "com.burbn.instagram":            { name: "Instagram",  category: "Social"         },
  "com.zhiliaoapp.musically.ios":   { name: "TikTok",     category: "Entertainment"  },
  "com.google.ios.youtube":         { name: "YouTube",    category: "Entertainment"  },
  "com.atebits.Tweetie2":           { name: "Twitter",    category: "Social"         },
  "com.reddit.Reddit":              { name: "Reddit",     category: "Social"         },
  "com.facebook.Facebook":          { name: "Facebook",   category: "Social"         },
  "com.toyopagroup.picaboo":        { name: "Snapchat",   category: "Social"         },
  "com.netflix.Netflix":            { name: "Netflix",    category: "Entertainment"  },
  "com.hammerandchisel.discord":    { name: "Discord",    category: "Social"         },
  "tv.twitch":                      { name: "Twitch",     category: "Entertainment"  },
  "net.whatsapp.WhatsApp":          { name: "WhatsApp",   category: "Social"         },
  "com.spotify.client":             { name: "Spotify",    category: "Entertainment"  },
};
