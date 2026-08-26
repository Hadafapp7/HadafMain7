import { useAuth } from "@clerk/expo";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";
import { useGetMe, useListFocusSessions, useListGoals } from "@workspace/api-client-react";

const isWeb = Platform.OS === "web";

function formatHours(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── Preference rows ────────────────────────────────────────────────────────────
type PrefRow =
  | { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; danger?: false; right?: "chevron" | "light"; route?: string; onPress?: never }
  | { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; danger: true;  right?: never; route?: never; onPress: () => void };

function usePrefs(onSignOut: () => void): PrefRow[] {
  return [
    { icon: "account-circle",   label: "Account",           right: "chevron", route: "/account-settings" },
    { icon: "credit-card",      label: "Subscription",      right: "chevron", route: "/subscription" },
    { icon: "emoji-events",     label: "Achievements",      right: "chevron", route: "/achievements" },
    { icon: "notifications",    label: "Notifications",     right: "chevron", route: "/notifications-settings" },
    { icon: "lock",             label: "Privacy & Security",right: "chevron", route: "/privacy-security" },
    { icon: "help",             label: "Help",              right: "chevron", route: "/help" },

    { icon: "logout",           label: "Sign Out",          danger: true, onPress: onSignOut },
  ];
}

// ── Press-scale card wrapper ───────────────────────────────────────────────────
function PressCard({ children, style, delay = 0 }: {
  children: React.ReactNode; style?: any; delay?: number;
}) {
  return (
    <Animated.View
      style={style}
      entering={isWeb ? undefined : FadeInDown.delay(delay).springify()}
    >
      {children}
    </Animated.View>
  );
}

// ── Preference row ─────────────────────────────────────────────────────────────
function PrefItem({ item }: { item: PrefRow }) {
  const scale = useSharedValue(1);
  const anim  = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const chevX = useSharedValue(0);
  const chevAnim = useAnimatedStyle(() => ({ transform: [{ translateX: chevX.value }] }));

  const handleIn  = () => {
    scale.value = withSpring(0.98, { damping: 14 });
    chevX.value = withSpring(4,    { damping: 14 });
    Haptics.selectionAsync();
  };
  const handleOut = () => {
    scale.value = withSpring(1, { damping: 14 });
    chevX.value = withSpring(0, { damping: 14 });
  };
  const handlePress = () => {
    if (item.danger) {
      item.onPress();
    } else if (item.route) {
      router.push(item.route as any);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={handleIn}
      onPressOut={handleOut}
      onPress={handlePress}
    >
      <Animated.View style={[styles.prefRow, anim]}>
        <View style={styles.prefLeft}>
          <MaterialIcons
            name={item.icon}
            size={22}
            color={item.danger ? "#ba1a1a" : "#000"}
          />
          <Text style={[styles.prefLabel, item.danger && { color: "#ba1a1a" }]}>
            {item.label}
          </Text>
        </View>
        {!item.danger && (
          <Animated.View style={[styles.prefRight, chevAnim]}>
            {item.right === "light" && (
              <Text style={styles.prefRightLabel}>LIGHT</Text>
            )}
            <MaterialIcons name="chevron-right" size={22} color="#c6c6c6" />
          </Animated.View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Profile screen ─────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const insets  = useSafeAreaInsets();
  const topPad  = isWeb ? 0 : insets.top;
  const tabBarH = isWeb ? 84 : 62 + insets.bottom;

  const { signOut } = useAuth();
  const { data: me, refetch: refetchMe } = useGetMe();
  const { data: rawFocusSessions, refetch: refetchSessions } = useListFocusSessions();
  const focusSessions = Array.isArray(rawFocusSessions) ? rawFocusSessions : [];
  const { data: rawGoals, refetch: refetchGoals } = useListGoals();
  const goals = Array.isArray(rawGoals) ? rawGoals : [];

  useFocusEffect(
    React.useCallback(() => {
      console.log("[Profile] Tab focused. Refreshing stats...");
      refetchSessions();
      refetchGoals();
      refetchMe();
    }, [refetchSessions, refetchGoals, refetchMe])
  );

  const handleSignOut = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    signOut();
  };
  const prefs = usePrefs(handleSignOut);

  const completedSessions = focusSessions.filter((s) => s.status === "completed");
  const totalFocusMinutes = completedSessions.reduce((sum, s) => sum + s.plannedDurationMinutes, 0);
  const goalsDone = goals.filter((g) => g.status === "done").length;

  const stats = [
    { label: "FOCUS",   value: formatHours(totalFocusMinutes) },
    { label: "SESSIONS", value: String(completedSessions.length) },
    { label: "GOALS DONE", value: String(goalsDone) },
  ];

  const displayName = me?.name?.toUpperCase() ?? me?.email?.split("@")[0].toUpperCase() ?? me?.phone ?? "HADAF USER";

  return (
    <View style={styles.root}>
      <AnimatedBackground />

      {/* ── Top App Bar ── */}
      <View style={[styles.topBar, { paddingTop: topPad + 12 }]}>
        <MaterialIcons name="star-outline" size={22} color="#000" />
        <Text style={styles.topBarTitle}>ACCOUNT</Text>
      </View>

      <ScrollView scrollEventThrottle={16} decelerationRate="normal" removeClippedSubviews={true}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 72, paddingBottom: tabBarH + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Profile Identity ── */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(0).springify()}
          style={styles.identitySection}
        >
          <View style={styles.avatarWrap}>
            <View style={styles.avatarBox}>
              <MaterialIcons name="person" size={60} color="#b0b0b0" />
            </View>
            <View style={styles.verifiedBadge}>
              <MaterialIcons name="verified" size={14} color="#fff" />
            </View>
          </View>

          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{me?.email ?? me?.phone ?? ""}</Text>
        </Animated.View>

        {/* ── Stats Row ── */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(60).springify()}
          style={styles.statsRow}
        >
          {stats.map((s, i) => (
            <View key={i} style={styles.statCard}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ── Premium Widget ── */}
        <PressCard delay={120} style={styles.proCard}>
          <View style={styles.sparkleWrap} pointerEvents="none">
            <MaterialIcons name="auto-awesome" size={88} color="#fff" style={{ opacity: 0.10 }} />
          </View>

          <View style={styles.proContent}>
            <View style={styles.proTierBadge}>
              <Text style={styles.proTierText}>PRO TIER</Text>
            </View>

            <Text style={styles.proHeadline}>
              {"MASTER YOUR PRODUCTIVITY\nWITHOUT LIMITS."}
            </Text>

            <TouchableOpacity
              style={styles.proBtn}
              activeOpacity={0.85}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
            >
              <Text style={styles.proBtnText}>UNLOCK PRO ACCESS</Text>
            </TouchableOpacity>
          </View>
        </PressCard>

        {/* ── Preferences ── */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(180).springify()}
          style={styles.prefsSection}
        >
          <Text style={styles.prefsLabel}>PREFERENCES</Text>
          <View style={styles.prefsList}>
            {prefs.map((item, i) => (
              <View
                key={i}
                style={[
                  styles.prefCardWrap,
                  i < prefs.length - 1 && { marginBottom: 4 },
                ]}
              >
                <PrefItem item={item} />
              </View>
            ))}
          </View>
        </Animated.View>

      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#f9f9f9" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },

  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: "#f3f3f3",
  },
  topBarTitle: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.5, color: "#000" },

  identitySection: { alignItems: "center", gap: 6 },
  avatarWrap:      { marginBottom: 6, position: "relative" },
  avatarBox: {
    width: 128, height: 128, borderRadius: 24,
    backgroundColor: "#2a2a2a", alignItems: "center", justifyContent: "center",
  },
  verifiedBadge: {
    position: "absolute", bottom: -8, right: -8,
    width: 32, height: 32, borderRadius: 16, backgroundColor: "#000",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#f9f9f9",
  },
  profileName: {
    fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5,
    color: "#000", textAlign: "center",
  },
  profileEmail: {
    fontSize: 14, fontFamily: "Inter_500Medium", color: "#5f5e60", textAlign: "center",
  },

  statsRow: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1, backgroundColor: "#f3f3f3", borderRadius: 20,
    paddingVertical: 20, alignItems: "center", gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  statLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.6, color: "#5f5e60", textAlign: "center" },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: -0.5 },

  proCard:    { backgroundColor: "#000", borderRadius: 24, overflow: "hidden", minHeight: 160 },
  sparkleWrap:{ position: "absolute", top: -8, right: -8 },
  proContent: { padding: 24, gap: 14 },
  proTierBadge: {
    alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  proTierText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 2, color: "#fff" },
  proHeadline: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5, lineHeight: 26 },
  proBtn: {
    alignSelf: "flex-start", backgroundColor: "#fff",
    borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10,
  },
  proBtnText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 1.2 },

  prefsSection: { gap: 14 },
  prefsLabel:   { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 3, color: "#5f5e60", paddingHorizontal: 4 },
  prefsList:    { gap: 4 },
  prefCardWrap: {
    backgroundColor: "#fff", borderRadius: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 8, elevation: 1,
  },
  prefRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 18,
  },
  prefLeft:      { flexDirection: "row", alignItems: "center", gap: 20 },
  prefLabel:     { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 0.3 },
  prefRight:     { flexDirection: "row", alignItems: "center", gap: 6 },
  prefRightLabel:{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#5f5e60", letterSpacing: 1.5 },
});
