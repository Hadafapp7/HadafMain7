import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { isNativeNetworkConnected } from "../modules/hadaf-native/src";

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

// ── Centered "Needs network" Overlay ───────────────────────────────────────────
export default function OfflineCenterBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [checking, setChecking] = useState(false);

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
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [checkNetwork]);

  if (!isOffline) return null;

  return (
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
});
