import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useFocusEffect, router } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HadafInlineLoader } from "@/components/AppLoadingScreen";
import OfflineCenterBanner from "@/components/OfflineCenterBanner";

const isWeb = Platform.OS === "web";
const MAX_LEVEL = 100;

const LEVEL_RANK_TIERS: { range: string; min: number; max: number; title: string }[] = [
  { range: "Lvl 1–5",    min: 1,   max: 5,   title: "Novice"      },
  { range: "Lvl 6–10",   min: 6,   max: 10,  title: "Apprentice"  },
  { range: "Lvl 11–15",  min: 11,  max: 15,  title: "Initiate"    },
  { range: "Lvl 16–20",  min: 16,  max: 20,  title: "Seeker"      },
  { range: "Lvl 21–25",  min: 21,  max: 25,  title: "Pathfinder"  },
  { range: "Lvl 26–30",  min: 26,  max: 30,  title: "Specialist"  },
  { range: "Lvl 31–35",  min: 31,  max: 35,  title: "Adept"       },
  { range: "Lvl 36–40",  min: 36,  max: 40,  title: "Guardian"    },
  { range: "Lvl 41–45",  min: 41,  max: 45,  title: "Vanguard"    },
  { range: "Lvl 46–50",  min: 46,  max: 50,  title: "Artisan"     },
  { range: "Lvl 51–60",  min: 51,  max: 60,  title: "Master"      },
  { range: "Lvl 61–70",  min: 61,  max: 70,  title: "Grandmaster" },
  { range: "Lvl 71–80",  min: 71,  max: 80,  title: "Sage"        },
  { range: "Lvl 81–90",  min: 81,  max: 90,  title: "Virtuoso"    },
  { range: "Lvl 91–99",  min: 91,  max: 99,  title: "Titan"       },
  { range: "Lvl 100",    min: 100, max: 100, title: "Legend"      },
];

function getRankTitleForLevel(rawLevel: number): string {
  const lvl = Math.min(MAX_LEVEL, Math.max(1, rawLevel || 1));
  const tier = LEVEL_RANK_TIERS.find((t) => lvl >= t.min && lvl <= t.max);
  return tier ? tier.title : "Novice";
}

function getFallbackWeeklyMilestones(level: number, rawMilestones: any[]) {
  const lvl = Math.min(MAX_LEVEL, Math.max(1, level || 1));
  // If backend already returned the 4 weekly milestones with `id`, use them directly
  if (Array.isArray(rawMilestones) && rawMilestones.length > 0 && rawMilestones[0]?.id) {
    return rawMilestones;
  }
  const targetSessions = Math.min(12, 3 + Math.floor((lvl - 1) / 10));
  const targetFocusMins = Math.min(360, 60 + Math.floor((lvl - 1) / 5) * 15);
  const targetGoals = Math.min(12, 3 + Math.floor((lvl - 1) / 10));
  const targetStreak = Math.min(7, 3 + Math.floor((lvl - 1) / 25));

  const sCurrent = Number(rawMilestones?.[0]?.current ?? 0);
  const gCurrent = Number(rawMilestones?.[1]?.current ?? 0);
  const stCurrent = Number(rawMilestones?.[2]?.current ?? 0);

  return [
    {
      id: "weekly_focus_sessions",
      label: `Complete ${targetSessions} focus sessions this week`,
      current: Math.min(targetSessions, sCurrent),
      total: targetSessions,
      completed: sCurrent >= targetSessions,
    },
    {
      id: "weekly_focus_minutes",
      label: `Log ${targetFocusMins} minutes of deep focus this week`,
      current: Math.min(targetFocusMins, sCurrent * 25),
      total: targetFocusMins,
      completed: sCurrent * 25 >= targetFocusMins,
    },
    {
      id: "weekly_goals_done",
      label: `Complete ${targetGoals} daily or scheduled goals this week`,
      current: Math.min(targetGoals, gCurrent),
      total: targetGoals,
      completed: gCurrent >= targetGoals,
    },
    {
      id: "weekly_streak",
      label: `Reach a ${targetStreak}-day active focus streak this week`,
      current: Math.min(targetStreak, stCurrent),
      total: targetStreak,
      completed: stCurrent >= targetStreak,
    },
  ];
}

export default function AchievementsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 0 : insets.top;
  const [refreshing, setRefreshing] = React.useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["achievements"],
    queryFn: () => customFetch<any>("/api/achievements"),
  });

  useFocusEffect(
    React.useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const handlePullRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  if (isLoading || !data) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <HadafInlineLoader message="Loading your weekly milestones..." light />
        <OfflineCenterBanner />
      </View>
    );
  }

  const clampedLevel = Math.min(MAX_LEVEL, Math.max(1, Number(data.level) || 1));
  const isMaxLevel = clampedLevel >= MAX_LEVEL;
  const rankTitle = (data.rankTitle || getRankTitleForLevel(clampedLevel)).toUpperCase();
  const milestones = getFallbackWeeklyMilestones(clampedLevel, data.milestones || []);
  const completedCount = milestones.filter(
    (m: any) => Boolean(m.completed) || Number(m.current) >= Number(m.total)
  ).length;
  const totalMilestones = milestones.length || 4;
  const weeklyProgressPct = Math.min(100, Math.round((completedCount / totalMilestones) * 100));

  return (
    <View style={styles.root}>
      {/* Top App Bar */}
      <View style={[styles.topBar, { paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>ACHIEVEMENTS</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        scrollEventThrottle={16}
        decelerationRate="normal"
        overScrollMode="never"
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 72, paddingBottom: 48 },
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
        {/* Level & Rank Card (Max Level 100) */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(0).springify()}
          style={styles.levelCard}
        >
          <View style={styles.levelDeco1} />
          <View style={styles.levelDeco2} />
          <View style={styles.levelDeco3} />

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>
                LEVEL {clampedLevel} / {MAX_LEVEL} {isMaxLevel ? "· MAX" : ""}
              </Text>
            </View>
            <View style={[styles.levelBadge, { backgroundColor: "rgba(74, 222, 128, 0.16)" }]}>
              <Text style={[styles.levelBadgeText, { color: "#4ade80" }]}>
                RANK: {rankTitle}
              </Text>
            </View>
          </View>

          <Text style={styles.levelTitle}>{`${rankTitle} OF\nFOCUS`}</Text>

          <Text style={styles.levelSubDesc}>
            {isMaxLevel
              ? "You have reached Level 100 — the highest Legend rank in Hadaf!"
              : `Complete all ${totalMilestones} weekly milestones below in a week's time to advance to Level ${Math.min(MAX_LEVEL, clampedLevel + 1)}.`}
          </Text>

          <View style={styles.xpRow}>
            <Text style={styles.xpLabel} numberOfLines={1} adjustsFontSizeToFit>
              WEEKLY PROGRESS
            </Text>
            <Text style={styles.xpValue} numberOfLines={1} adjustsFontSizeToFit>
              {completedCount}/{totalMilestones} DONE ({weeklyProgressPct}%)
            </Text>
          </View>
          <View style={styles.xpBarBg}>
            <View style={[styles.xpBarFill, { width: `${weeklyProgressPct}%` }]} />
          </View>
        </Animated.View>

        {/* Streak Cards */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(80).springify()}
          style={styles.streakRow}
        >
          <View style={styles.streakCard}>
            <Text style={styles.streakEmoji}>{"\uD83D\uDD25"}</Text>
            <Text style={styles.streakLabel}>CURRENT STREAK</Text>
            <Text style={styles.streakValue}>
              {data.currentStreak} {data.currentStreak === 1 ? "Day" : "Days"}
            </Text>
          </View>
          <View style={styles.streakCard}>
            <Text style={styles.streakEmoji}>{"\uD83C\uDFC6"}</Text>
            <Text style={styles.streakLabel}>BEST STREAK</Text>
            <Text style={styles.streakValue}>
              {data.bestStreak} {data.bestStreak === 1 ? "Day" : "Days"}
            </Text>
          </View>
        </Animated.View>

        {/* Weekly Milestones Section (Badge Gallery removed per Point 8) */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(140).springify()}
          style={styles.section}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Text style={styles.sectionLabel} numberOfLines={1} adjustsFontSizeToFit>
              MILESTONES · LVL {clampedLevel}
            </Text>
            <Text style={styles.weeklyResetTag} numberOfLines={1}>
              7-DAY CHALLENGE
            </Text>
          </View>

          <View style={styles.milestoneList}>
            {milestones.map((m: any, i: number) => {
              const cur = Math.min(Number(m.total) || 1, Number(m.current) || 0);
              const tot = Math.max(1, Number(m.total) || 1);
              const isDone = cur >= tot;
              const pct = Math.min(100, Math.round((cur / tot) * 100));
              return (
                <View
                  key={m.id || i}
                  style={[
                    styles.milestoneCard,
                    isDone && styles.milestoneCardDone,
                  ]}
                >
                  <View style={styles.milestoneTop}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, marginRight: 10 }}>
                      <View
                        style={[
                          styles.milestoneStatusIcon,
                          { backgroundColor: isDone ? "#16a34a" : "#f3f4f6" },
                        ]}
                      >
                        <MaterialIcons
                          name={isDone ? "check" : "flag"}
                          size={14}
                          color={isDone ? "#fff" : "#52525b"}
                        />
                      </View>
                      <Text style={styles.milestoneLabel}>{m.label}</Text>
                    </View>
                    <Text
                      style={[
                        styles.milestoneCount,
                        isDone && { color: "#15803d" },
                      ]}
                    >
                      {cur}/{tot}
                    </Text>
                  </View>
                  <View style={styles.milestoneBarBg}>
                    <View
                      style={[
                        styles.milestoneBarFill,
                        {
                          width: `${pct}%` as any,
                          backgroundColor: isDone ? "#16a34a" : "#000000",
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.View>

        {/* Rank Progression Tiers Reference (Level 1 to Level 100 MAX) */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(200).springify()}
          style={styles.rankGuideCard}
        >
          <Text style={styles.sectionLabel}>RANK PROGRESSION (LEVEL 1 – 100 MAX)</Text>
          <View style={styles.rankPillsGrid}>
            {LEVEL_RANK_TIERS.map((tier) => {
              const isCurrent = clampedLevel >= tier.min && clampedLevel <= tier.max;
              const isUnlocked = clampedLevel >= tier.min;
              return (
                <View
                  key={tier.title}
                  style={[
                    styles.rankTierPill,
                    isCurrent && styles.rankTierPillCurrent,
                    !isUnlocked && { opacity: 0.5 },
                  ]}
                >
                  <Text
                    style={[
                      styles.rankTierTitle,
                      isCurrent && { color: "#fff" },
                    ]}
                  >
                    {tier.title}
                  </Text>
                  <Text
                    style={[
                      styles.rankTierRange,
                      isCurrent && { color: "rgba(255,255,255,0.75)" },
                    ]}
                  >
                    {tier.range}
                  </Text>
                </View>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>

      <OfflineCenterBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#E6E8ED" },
  scroll: { flex: 1 },
  content:{ paddingHorizontal: 20, gap: 20 },

  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: "#DDE0E6",
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  topBarTitle: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: 1, color: "#141618" },

  levelCard: {
    backgroundColor: "#0a0a0a",
    borderRadius: 24,
    padding: 24,
    gap: 10,
    overflow: "hidden",
    minHeight: 210,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  levelDeco1: {
    position: "absolute", top: -60, right: -40,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  levelDeco2: {
    position: "absolute", top: 20, right: 30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  levelDeco3: {
    position: "absolute", bottom: -30, left: 60,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  levelBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
  },
  levelBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1.5 },
  levelTitle: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5, lineHeight: 38, marginTop: 2 },
  levelSubDesc: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.72)",
    lineHeight: 17,
  },
  xpRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6 },
  xpLabel:{ fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.6)", letterSpacing: 0.7, flexShrink: 1 },
  xpValue:{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#4ade80", letterSpacing: 0.5, flexShrink: 1 },
  xpBarBg:{ height: 7, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 4, overflow: "hidden" },
  xpBarFill:{ height: 7, backgroundColor: "#4ade80", borderRadius: 4 },

  streakRow: { flexDirection: "row", gap: 14 },
  streakCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 22,
    padding: 22, alignItems: "center", gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.13, shadowRadius: 16, elevation: 6,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.05)",
  },
  streakEmoji: { fontSize: 36 },
  streakLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 2, textAlign: "center" },
  streakValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#000" },

  section:      { gap: 14 },
  sectionLabel: { fontSize: 9.5, fontFamily: "Inter_700Bold", color: "#444", letterSpacing: 1.3, flexShrink: 1 },
  weeklyResetTag: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#0284C7",
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    letterSpacing: 0.6,
  },

  milestoneList: { gap: 12 },
  milestoneCard: {
    backgroundColor: "#fff", borderRadius: 18,
    padding: 18, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 5,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.05)",
  },
  milestoneCardDone: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
    borderWidth: 1.5,
  },
  milestoneStatusIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  milestoneTop:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  milestoneLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#000" },
  milestoneCount: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#666" },
  milestoneBarBg: { height: 6, backgroundColor: "#e5e7eb", borderRadius: 3, overflow: "hidden" },
  milestoneBarFill:{ height: 6, backgroundColor: "#000", borderRadius: 3 },

  rankGuideCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 18,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.11,
    shadowRadius: 14,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  rankPillsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rankTierPill: {
    width: "31%",
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  rankTierPillCurrent: {
    backgroundColor: "#000000",
    borderColor: "#000000",
  },
  rankTierTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  rankTierRange: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: "#6b7280",
    marginTop: 2,
  },
});
