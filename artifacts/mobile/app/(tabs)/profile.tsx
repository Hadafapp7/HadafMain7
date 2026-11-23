import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import UserAvatar from '@/components/UserAvatar';
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@clerk/expo";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  RefreshControl,
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
import {
  customFetch,
  getListGoalsQueryKey,
  type Goal,
  useGetMe,
  useListFocusSessions,
  useListGoals,
} from "@workspace/api-client-react";

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
  | { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; badge?: string; badgeType?: "pro" | "trial" | "limited"; danger?: false; right?: "chevron" | "light"; route?: string; onPress?: () => void }
  | { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; danger: true;  right?: never; route?: never; onPress: () => void };

function usePrefs(onSignOut: () => void, planBadge?: { badge: string; type: "pro" | "trial" | "limited" }): PrefRow[] {
  return [
    { icon: "account-circle",   label: "Account",           right: "chevron", route: "/account-settings" },
    { icon: "credit-card",      label: "Subscription",      badge: planBadge?.badge, badgeType: planBadge?.type, right: "chevron", route: "/subscription" },
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
    if (item.onPress) {
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
            {item.badge ? (
              <View style={[styles.prefBadge, item.badgeType === "pro" ? styles.badgePro : item.badgeType === "limited" ? styles.badgeLimited : styles.badgeTrial]}>
                <Text style={[styles.prefBadgeText, item.badgeType === "pro" ? styles.badgeTextPro : item.badgeType === "limited" ? styles.badgeTextLimited : styles.badgeTextTrial]}>
                  {item.badge}
                </Text>
              </View>
            ) : null}
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
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const topPad  = isWeb ? 0 : insets.top;
  const tabBarH = isWeb ? 84 : 62 + insets.bottom;
  const queryClient = useQueryClient();

  const { signOut } = useAuth();
  const sub = useSubscription();
  const { data: me, refetch: refetchMe } = useGetMe();
  const { data: userProfile, refetch: refetchUserProfile } = useQuery({
    queryKey: ["userMe"],
    queryFn: () => customFetch<any>("/api/users/me"),
  });
  const { data: rawFocusSessions, refetch: refetchSessions } = useListFocusSessions();
  const focusSessions = Array.isArray(rawFocusSessions) ? rawFocusSessions : [];
  const { data: rawGoals, refetch: refetchGoals } = useListGoals();
  const serverGoals = Array.isArray(rawGoals) ? rawGoals : [];
  const [localGoalsBackup, setLocalGoalsBackup] = useState<Goal[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const syncLocalCompletedGoalsToDatabase = React.useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem("@hadaf/local_goals_backup_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Goal[];
      if (!Array.isArray(parsed)) return;
      setLocalGoalsBackup(parsed);

      const currentServerGoals =
        (queryClient.getQueryData(getListGoalsQueryKey()) as Goal[] | undefined) ?? serverGoals;

      let didMutateServer = false;
      const updatedLocal = [...parsed];

      for (let i = 0; i < updatedLocal.length; i++) {
        const lg = updatedLocal[i];
        if (lg.status !== "done") continue;

        const match = currentServerGoals.find(
          (s) => s.id === lg.id || (s.title === lg.title && s.startTime === lg.startTime)
        );
        if (match && match.status !== "done" && !match.id.startsWith("local-")) {
          try {
            await customFetch(`/api/goals/${match.id}`, {
              method: "PATCH",
              body: JSON.stringify({ status: "done" }),
            });
            didMutateServer = true;
          } catch {}
        } else if (!match && lg.id.startsWith("local-")) {
          try {
            const created = await customFetch<Goal>("/api/goals", {
              method: "POST",
              body: JSON.stringify({
                title: lg.title,
                intent: lg.intent || undefined,
                type: lg.type,
                priority: lg.priority,
                startTime: lg.startTime,
                durationMinutes: lg.durationMinutes,
                scheduledDate: lg.scheduledDate || undefined,
                status: "done",
                blockApps: lg.blockApps ?? true,
                blockedApps: lg.blockedApps ?? [],
              }),
            });
            if (created?.id) {
              if (created.status !== "done") {
                await customFetch(`/api/goals/${created.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ status: "done" }),
                });
              }
              updatedLocal[i] = { ...created, status: "done" };
              didMutateServer = true;
            }
          } catch {}
        }
      }

      if (didMutateServer) {
        await AsyncStorage.setItem("@hadaf/local_goals_backup_v1", JSON.stringify(updatedLocal));
        setLocalGoalsBackup(updatedLocal);
        await Promise.allSettled([refetchGoals(), refetchMe(), refetchUserProfile()]);
      }
    } catch {}
  }, [queryClient, serverGoals, refetchGoals, refetchMe, refetchUserProfile]);

  useFocusEffect(
    React.useCallback(() => {
      console.log("[Profile] Tab focused. Refreshing stats from database...");
      void (async () => {
        await Promise.allSettled([
          refetchSessions(),
          refetchGoals(),
          refetchMe(),
          refetchUserProfile(),
        ]);
        await syncLocalCompletedGoalsToDatabase();
      })();
    }, [refetchSessions, refetchGoals, refetchMe, refetchUserProfile, syncLocalCompletedGoalsToDatabase])
  );

  const handlePullRefresh = React.useCallback(async () => {
    setRefreshing(true);
    Haptics.selectionAsync();
    try {
      await syncLocalCompletedGoalsToDatabase();
      await Promise.allSettled([
        refetchSessions(),
        refetchGoals(),
        refetchMe(),
        refetchUserProfile(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [syncLocalCompletedGoalsToDatabase, refetchSessions, refetchGoals, refetchMe, refetchUserProfile]);

  const handleSignOut = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    signOut();
  };
  const prefs = usePrefs(handleSignOut);

  // Merge server goals + local goals so GOALS DONE reflects database & any just-completed goal
  const mergedGoals = React.useMemo(() => {
    const byId = new Map<string, Goal>();
    for (const g of serverGoals) byId.set(g.id, g);
    for (const lg of localGoalsBackup) {
      const matched = serverGoals.find(
        (s) => s.id === lg.id || (s.title === lg.title && s.startTime === lg.startTime)
      );
      if (matched) {
        if (lg.status === "done" || matched.status === "done") {
          byId.set(matched.id, { ...matched, status: "done" });
        }
      } else {
        byId.set(lg.id, lg);
      }
    }
    return Array.from(byId.values());
  }, [serverGoals, localGoalsBackup]);

  const completedSessions = focusSessions.filter((s) => s.status === "completed");
  const listFocusMinutes = completedSessions.reduce((sum, s) => sum + s.plannedDurationMinutes, 0);
  const dbFocusMinutes = Number(userProfile?.totalFocusMinutes ?? (me as any)?.totalFocusMinutes ?? 0);
  const totalFocusMinutes = Math.max(listFocusMinutes, dbFocusMinutes);

  const dbSessionsCount = Number(userProfile?.completedSessionsCount ?? (me as any)?.completedSessionsCount ?? 0);
  const totalCompletedSessions = Math.max(completedSessions.length, dbSessionsCount);

  const listGoalsDone = mergedGoals.filter((g) => g.status === "done").length;
  const dbGoalsDone = Number(userProfile?.goalsDoneCount ?? (me as any)?.goalsDoneCount ?? 0);
  const goalsDone = Math.max(listGoalsDone, dbGoalsDone);

  const stats = [
    { label: "FOCUS",   value: formatHours(totalFocusMinutes) },
    { label: "SESSIONS", value: String(totalCompletedSessions) },
    { label: "GOALS DONE", value: String(goalsDone) },
  ];

  const displayName = me?.name?.toUpperCase() ?? userProfile?.name?.toUpperCase() ?? me?.email?.split("@")[0].toUpperCase() ?? (me as any)?.phone ?? "HADAF USER";

  // Point 12: Only show "Master your productivity without limits" card when the user has completed free tier (isLimited) and has NOT subscribed to any plan (!isPro)
  const showProUpgradeCard = sub.isLimited && !sub.isPro;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />

      {/* ── Top App Bar ── */}
      <View style={[styles.topBar, { paddingTop: topPad + 12 }]}>
        <MaterialIcons name="star-outline" size={22} color="#000" />
        <Text style={styles.topBarTitle}>ACCOUNT</Text>
      </View>

      <ScrollView scrollEventThrottle={16} decelerationRate="normal" 
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 72, paddingBottom: tabBarH + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handlePullRefresh}
            tintColor="#000"
            colors={["#000000"]}
          />
        }
      >

        {/* ── Profile Identity ── */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(0).springify()}
          style={styles.identitySection}
        >
          <View style={styles.avatarWrap}>
            <UserAvatar gender={(me as any)?.gender ?? userProfile?.gender} isPro={sub.isPro} size={84} />
          </View>

          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{me?.email ?? userProfile?.email ?? (me as any)?.phone ?? ""}</Text>
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

        {/* ── Premium Widget (Point 12: Only shown when free trial ended and user has not subscribed) ── */}
        {showProUpgradeCard && (
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
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/subscription" as any);
                }}
              >
                <Text style={styles.proBtnText}>UNLOCK PRO ACCESS</Text>
              </TouchableOpacity>
            </View>
          </PressCard>
        )}

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
  root:   { flex: 1, backgroundColor: "#E6E8ED" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },

  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: "#DDE0E6",
  },
  topBarTitle: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: 1, color: "#141618" },

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
    borderWidth: 3, borderColor: "#E6E8ED",
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
    flex: 1, backgroundColor: "#ffffff", borderRadius: 20,
    paddingVertical: 20, alignItems: "center", gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.13, shadowRadius: 16, elevation: 6,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.05)",
  },
  statLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.6, color: "#5f5e60", textAlign: "center" },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: -0.5 },

  proCard:    {
    backgroundColor: "#000", borderRadius: 24, overflow: "hidden", minHeight: 160,
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
  },
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
  prefsList:    { gap: 6 },
  prefCardWrap: {
    backgroundColor: "#fff", borderRadius: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.11, shadowRadius: 14, elevation: 5,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.05)",
  },

  prefBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 4,
  },
  badgePro: {
    backgroundColor: "#fef3c7",
    borderColor: "#fde68a",
  },
  badgeTrial: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  badgeLimited: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
  },
  prefBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  badgeTextPro: {
    color: "#b45309",
  },
  badgeTextTrial: {
    color: "#1d4ed8",
  },
  badgeTextLimited: {
    color: "#b91c1c",
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
