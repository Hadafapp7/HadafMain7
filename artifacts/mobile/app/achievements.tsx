import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useFocusEffect } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const isWeb = Platform.OS === "web";

export default function AchievementsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 0 : insets.top;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["achievements"],
    queryFn: () => customFetch<any>("/api/achievements"),
  });

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  if (isLoading || !data) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  const titlePrefix = data.level < 5 ? "NOVICE OF" : data.level < 10 ? "ADEPT OF" : "MASTER OF";

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
      >
        {/* Level Card */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(0).springify()}
          style={styles.levelCard}
        >
          {/* Abstract geometric decoration */}
          <View style={styles.levelDeco1} />
          <View style={styles.levelDeco2} />
          <View style={styles.levelDeco3} />

          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>LEVEL {data.level}</Text>
          </View>
          <Text style={styles.levelTitle}>{`${titlePrefix}\nFOCUS`}</Text>
          <View style={styles.xpRow}>
            <Text style={styles.xpLabel}>XP PROGRESS</Text>
            <Text style={styles.xpValue}>{data.xp} / {data.xpNeeded}</Text>
          </View>
          <View style={styles.xpBarBg}>
            <View style={[styles.xpBarFill, { width: `${(data.xp / data.xpNeeded) * 100}%` }]} />
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
            <Text style={styles.streakValue}>{data.currentStreak} {data.currentStreak === 1 ? "Day" : "Days"}</Text>
          </View>
          <View style={styles.streakCard}>
            <Text style={styles.streakEmoji}>{"\uD83C\uDFC6"}</Text>
            <Text style={styles.streakLabel}>BEST STREAK</Text>
            <Text style={styles.streakValue}>{data.bestStreak} {data.bestStreak === 1 ? "Day" : "Days"}</Text>
          </View>
        </Animated.View>

        {/* Badge Gallery */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(140).springify()}
          style={styles.section}
        >
          <Text style={styles.sectionLabel}>BADGE GALLERY</Text>
          <View style={styles.badgeGrid}>
            {data.badges.map((badge: any, i: number) => (
              <View key={i} style={styles.badgeItem}>
                <View style={[styles.badgeCircle, badge.earned ? styles.badgeEarned : styles.badgeLocked]}>
                  <MaterialIcons
                    name={badge.icon as any}
                    size={26}
                    color={badge.earned ? "#fff" : "#bbb"}
                  />
                </View>
                <Text style={[styles.badgeLabel, !badge.earned && styles.badgeLabelLocked]}>
                  {badge.label}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Milestones */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(200).springify()}
          style={styles.section}
        >
          <Text style={styles.sectionLabel}>MILESTONES</Text>
          <View style={styles.milestoneList}>
            {data.milestones.map((m: any, i: number) => (
              <View key={i} style={styles.milestoneCard}>
                <View style={styles.milestoneTop}>
                  <Text style={styles.milestoneLabel}>{m.label}</Text>
                  <Text style={styles.milestoneCount}>{m.current}/{m.total}</Text>
                </View>
                <View style={styles.milestoneBarBg}>
                  <View
                    style={[
                      styles.milestoneBarFill,
                      { width: `${(m.current / m.total) * 100}%` as any },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#f9f9f9" },
  scroll: { flex: 1 },
  content:{ paddingHorizontal: 20, gap: 20 },

  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: "#f3f3f3",
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  topBarTitle: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.5, color: "#000" },

  levelCard: {
    backgroundColor: "#0a0a0a",
    borderRadius: 24,
    padding: 24,
    gap: 10,
    overflow: "hidden",
    minHeight: 200,
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
  levelTitle: { fontSize: 34, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5, lineHeight: 40 },
  xpRow:  { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  xpLabel:{ fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.6)", letterSpacing: 1.5 },
  xpValue:{ fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.6)", letterSpacing: 1 },
  xpBarBg:{ height: 6, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 3, overflow: "hidden" },
  xpBarFill:{ height: 6, backgroundColor: "#fff", borderRadius: 3 },

  streakRow: { flexDirection: "row", gap: 14 },
  streakCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 22,
    padding: 22, alignItems: "center", gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  streakEmoji: { fontSize: 36 },
  streakLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 2, textAlign: "center" },
  streakValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#000" },

  section:      { gap: 14 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#555", letterSpacing: 2.5 },

  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  badgeItem: { alignItems: "center", gap: 8, width: 72 },
  badgeCircle:{
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
  },
  badgeEarned: { backgroundColor: "#000" },
  badgeLocked: {
    backgroundColor: "transparent",
    borderWidth: 2, borderStyle: "dashed", borderColor: "#ccc",
  },
  badgeLabel:      { fontSize: 9, fontFamily: "Inter_700Bold", color: "#000", textAlign: "center", letterSpacing: 0.5 },
  badgeLabelLocked:{ color: "#bbb" },

  milestoneList: { gap: 12 },
  milestoneCard: {
    backgroundColor: "#fff", borderRadius: 18,
    padding: 18, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1,
  },
  milestoneTop:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  milestoneLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#000", marginRight: 12 },
  milestoneCount: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#888" },
  milestoneBarBg: { height: 5, backgroundColor: "#f0f0f0", borderRadius: 3, overflow: "hidden" },
  milestoneBarFill:{ height: 5, backgroundColor: "#000", borderRadius: 3 },
});
