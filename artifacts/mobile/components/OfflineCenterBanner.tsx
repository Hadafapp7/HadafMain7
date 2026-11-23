import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Dimensions,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import {
  isNativeMiniPlayerActive,
  isNativeNetworkConnected,
  openOverlaySettings,
  getPermissionStatus,
  startNativeMiniPlayer,
  stopNativeMiniPlayer,
  updateNativeMiniPlayer,
} from "../modules/hadaf-native/src";

const SCREEN_W = Dimensions.get("window").width;
const SCREEN_H = Dimensions.get("window").height;

// ── Shared reactive state for Hadaf Mini Player across the app ────────────────
export interface MiniPlayerSnapshot {
  enabled: boolean;
  doomScore: number;
  targetScore: number;
  screenTimeLabel: string;
}

const MINI_PLAYER_STORAGE_KEY = "@hadaf/mini_player_state_v1";

let currentSnapshot: MiniPlayerSnapshot = {
  enabled: false,
  doomScore: 0,
  targetScore: 30,
  screenTimeLabel: "0m",
};

const listeners = new Set<(snap: MiniPlayerSnapshot) => void>();

export function getMiniPlayerSnapshot(): MiniPlayerSnapshot {
  return currentSnapshot;
}

export function subscribeMiniPlayer(fn: (snap: MiniPlayerSnapshot) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publishMiniPlayerUpdate(partial: Partial<MiniPlayerSnapshot>) {
  currentSnapshot = { ...currentSnapshot, ...partial };
  for (const fn of listeners) {
    fn(currentSnapshot);
  }
  AsyncStorage.setItem(MINI_PLAYER_STORAGE_KEY, JSON.stringify(currentSnapshot)).catch(() => {});

  if (Platform.OS === "android") {
    // Always sync latest DoomScore, target, and screen time to native SharedPreferences.
    // The native floating mini-player automatically shows ONLY when the user switches away
    // from Hadaf to their phone's home screen or another app, and hides when inside Hadaf!
    updateNativeMiniPlayer(
      currentSnapshot.doomScore,
      currentSnapshot.targetScore,
      currentSnapshot.screenTimeLabel
    );
  }
}

export async function toggleMiniPlayer(requestOverlayIfMissing = true): Promise<boolean> {
  const nextEnabled = !currentSnapshot.enabled;
  if (nextEnabled && Platform.OS === "android") {
    const perms = getPermissionStatus();
    if (!perms.hasOverlayPermission && requestOverlayIfMissing) {
      openOverlaySettings();
    }
  }
  publishMiniPlayerUpdate({ enabled: nextEnabled });
  return nextEnabled;
}

// Load saved mini-player preference on startup
AsyncStorage.getItem(MINI_PLAYER_STORAGE_KEY)
  .then((raw) => {
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        publishMiniPlayerUpdate({
          enabled: Boolean(parsed.enabled),
          doomScore: Number(parsed.doomScore) || 0,
          targetScore: Number(parsed.targetScore) || 30,
          screenTimeLabel: String(parsed.screenTimeLabel || "0m"),
        });
      }
    }
  })
  .catch(() => {});

// ── Wi-Fi with Question Mark Icon ──────────────────────────────────────────────
function WifiQuestionIcon({ size = 48 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        {/* Outer Wi-Fi Arc */}
        <Path
          d="M6 17.5 C16 8.5, 32 8.5, 42 17.5"
          stroke="#111827"
          strokeWidth={3.6}
          strokeLinecap="round"
          fill="none"
        />
        {/* Middle Wi-Fi Arc */}
        <Path
          d="M12 24 C18.8 17.8, 29.2 17.8, 36 24"
          stroke="#111827"
          strokeWidth={3.6}
          strokeLinecap="round"
          fill="none"
        />
        {/* Inner Wi-Fi Arc */}
        <Path
          d="M18 30.5 C21.4 27.5, 26.6 27.5, 30 30.5"
          stroke="#111827"
          strokeWidth={3.6}
          strokeLinecap="round"
          fill="none"
        />
        {/* Bottom Wi-Fi Dot */}
        <Circle cx="24" cy="37" r="2.6" fill="#111827" />
      </Svg>

      {/* Question Mark Badge overlaid on the Wi-Fi Symbol */}
      <View style={styles.questionBadge}>
        <Text style={styles.questionBadgeText}>?</Text>
      </View>
    </View>
  );
}

// ── Centered "Needs network" Overlay + In-App Draggable Mini Player ────────────
export default function OfflineCenterBanner({ showMiniPlayer = false }: { showMiniPlayer?: boolean }) {
  const [isOffline, setIsOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const [miniSnap, setMiniSnap] = useState<MiniPlayerSnapshot>(getMiniPlayerSnapshot());
  const [pos, setPos] = useState({ x: SCREEN_W - 158, y: 112 });

  useEffect(() => {
    return subscribeMiniPlayer((snap) => setMiniSnap({ ...snap }));
  }, []);

  const checkNetwork = useCallback(async () => {
    // 1. Web browser check
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.onLine === false) {
      setIsOffline(true);
      return;
    }

    // 2. Native Android ConnectivityManager check
    const nativeConnected = isNativeNetworkConnected();
    if (nativeConnected !== null) {
      setIsOffline(!nativeConnected);
      return;
    }

    // 3. Fallback lightweight HTTP reachability check
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch("https://api.hadaf.co.in/api/healthz", {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setIsOffline(!res.ok);
    } catch {
      setIsOffline(true);
    }
  }, []);

  useEffect(() => {
    void checkNetwork();
    const interval = setInterval(() => {
      void checkNetwork();
    }, 2500);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkNetwork();
        // User is inside Hadaf -> hide the floating mini player
        if (Platform.OS === "android") {
          stopNativeMiniPlayer();
        }
      } else if (state === "background" || state === "inactive") {
        // User switched away from Hadaf to phone home screen or another app -> show floating mini player!
        if (Platform.OS === "android") {
          const snap = getMiniPlayerSnapshot();
          startNativeMiniPlayer(snap.doomScore, snap.targetScore, snap.screenTimeLabel);
        }
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [checkNetwork]);

  return (
    <>
      {/* Directly Centered "Needs network" Card when mobile internet / Wi-Fi is off */}
      {isOffline && (
        <View style={styles.centerOverlay} pointerEvents="box-none">
          <View style={styles.offlineCard}>
            <View style={styles.iconCircle}>
              <WifiQuestionIcon size={46} />
            </View>
            <Text style={styles.offlineTitle}>Needs network</Text>
            <Text style={styles.offlineSub}>
              Turn on mobile data or Wi-Fi to sync your Hadaf data
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              activeOpacity={0.85}
              onPress={async () => {
                Haptics.selectionAsync();
                setChecking(true);
                await checkNetwork();
                setChecking(false);
              }}
            >
              <MaterialIcons name="refresh" size={15} color="#ffffff" />
              <Text style={styles.retryBtnText}>{checking ? "Checking..." : "Try Again"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    paddingHorizontal: 28,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  offlineCard: {
    backgroundColor: "#ffffff",
    borderRadius: 26,
    paddingVertical: 26,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 310,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  questionBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  questionBadgeText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    lineHeight: 15,
  },
  offlineTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  offlineSub: {
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#000000",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  retryBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  miniPill: {
    position: "absolute",
    zIndex: 8888,
    width: 148,
    backgroundColor: "rgba(10, 10, 12, 0.95)",
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 12,
  },
  miniPillTouch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  miniDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  miniTitle: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  miniSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 9,
    fontFamily: "Inter_500Medium",
  },
});
