import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { customFetch } from "@workspace/api-client-react";

const COACH_CACHE_KEY = "hadaf_ai_coach_reality_check_v2";

interface CoachData {
  tag: string;
  title: string | null;
  message: string | null;
  isNull?: boolean;
  source?: "bedrock" | "fallback";
  streak?: number;
  screenTimeToday?: string;
}

const DEFAULT_COACH: CoachData = {
  tag: "REALITY CHECK",
  title: null,
  message: null,
  isNull: true,
  source: "fallback",
};

export default function AiCoachWidget({ firstName }: { firstName: string }) {
  const [data, setData] = useState<CoachData>(DEFAULT_COACH);
  const [loading, setLoading] = useState(false);

  // Load cached message immediately on mount
  useEffect(() => {
    AsyncStorage.getItem(COACH_CACHE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.message) setData(parsed);
        } catch {}
      }
    });
  }, []);

  const fetchCoachMessage = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await customFetch<CoachData>(
        `/api/coach/reality-check${refresh ? "?refresh=true" : ""}`
      );
      if (res?.isNull || !res?.message) {
        setData({ tag: "REALITY CHECK", title: null, message: null, isNull: true });
        AsyncStorage.removeItem(COACH_CACHE_KEY).catch(() => {});
      } else {
        setData(res);
        AsyncStorage.setItem(COACH_CACHE_KEY, JSON.stringify(res)).catch(() => {});
      }
    } catch (err) {
      console.warn("[AiCoachWidget] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch fresh message in background on mount
  useEffect(() => {
    fetchCoachMessage(false);
  }, [fetchCoachMessage]);

  const onRefreshPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fetchCoachMessage(true);
  };

  const onStartFocusPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(tabs)/focus" as any);
  };

  if (data.isNull || !data.message) {
    return null;
  }

  return (
    <Animated.View entering={FadeInDown.delay(20).springify()} style={styles.card}>
      {/* Top row */}
      <View style={styles.topRow}>
        <View style={styles.tagWrap}>
          <MaterialIcons name="bolt" size={13} color="#f59e0b" />
          <Text style={styles.tagText}>REALITY CHECK</Text>
        </View>

        <TouchableOpacity
          onPress={onRefreshPress}
          hitSlop={8}
          disabled={loading}
          style={styles.refreshBtn}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#999" />
          ) : (
            <MaterialIcons name="refresh" size={16} color="#888" />
          )}
        </TouchableOpacity>
      </View>

      {/* Main message */}
      <Text style={styles.title}>{data.title}</Text>
      <Text style={styles.message}>{data.message}</Text>

      {/* Action footer */}
      <View style={styles.footerRow}>
        <TouchableOpacity
          style={styles.focusBtn}
          onPress={onStartFocusPress}
          activeOpacity={0.85}
        >
          <MaterialIcons name="timer" size={14} color="#000" />
          <Text style={styles.focusBtnText}>Start Focus Session</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#101014",
    borderRadius: 22,
    padding: 16,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tagWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#f59e0b",
    letterSpacing: 0.8,
  },
  refreshBtn: {
    padding: 4,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    letterSpacing: -0.2,
    marginTop: 2,
  },
  message: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#d4d4d8",
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: 4,
  },
  focusBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  focusBtnText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#000000",
    letterSpacing: 0.3,
  },
});

