import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const APPS = [
  { name: "Instagram", category: "SOCIAL", time: "2h 15m", percent: 0.85, icon: "photo-camera" as const },
  { name: "TikTok", category: "ENTERTAINMENT", time: "1h 45m", percent: 0.66, icon: "music-video" as const },
  { name: "YouTube", category: "VIDEO", time: "45m", percent: 0.28, icon: "play-circle-filled" as const },
];

const WEEK_DATA = [
  { day: "Mon", value: 0.6, today: false },
  { day: "Tue", value: 0.8, today: false },
  { day: "Wed", value: 0.5, today: false },
  { day: "Thu", value: 0.9, today: false },
  { day: "Fri", value: 0.7, today: false },
  { day: "Sat", value: 1.0, today: true },
  { day: "Sun", value: 0.3, today: false },
];

const QUICK_ACTIONS = [
  { label: "Block Apps", icon: "block" as const },
  { label: "Set Limits", icon: "timelapse" as const },
  { label: "Downtime", icon: "nights-stay" as const },
  { label: "App Limits", icon: "hourglass-empty" as const },
];

function AppRow({ app }: { app: typeof APPS[0] }) {
  const colors = useColors();
  return (
    <View style={styles.appRow}>
      <View style={[styles.appIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
        <MaterialIcons name={app.icon} size={22} color={colors.onSurface} />
      </View>
      <View style={styles.appInfo}>
        <Text style={[styles.appName, { color: colors.onSurface }]}>{app.name}</Text>
        <Text style={[styles.appCategory, { color: colors.outline }]}>{app.category}</Text>
      </View>
      <View style={styles.appRight}>
        <Text style={[styles.appTime, { color: colors.onSurface }]}>{app.time}</Text>
        <View style={[styles.miniBarTrack, { backgroundColor: colors.surfaceContainerHighest }]}>
          <View style={[styles.miniBarFill, { width: `${app.percent * 100}%` as any, backgroundColor: colors.primary }]} />
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const handleFocusPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Fixed header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: "rgba(249,249,249,0.92)" }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerGreeting, { color: colors.onSurface }]}>Good Evening, Alex</Text>
          <View style={[styles.focusBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
            <Text style={[styles.focusBadgeText, { color: colors.outline }]}>FOCUS MODE: OFF</Text>
          </View>
        </View>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceContainerHighest }]}>
          <MaterialIcons name="person" size={22} color={colors.onSurfaceVariant} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 80, paddingBottom: isWeb ? 34 + 84 : 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {/* Screen time card */}
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.statLabel, { color: colors.outline }]}>Screen Time</Text>
            <Text style={[styles.statBigNumber, { color: colors.onSurface }]}>4h 32m</Text>
            <View style={[styles.statBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
              <MaterialIcons name="south-east" size={12} color={colors.onSurface} />
              <Text style={[styles.statBadgeText, { color: colors.onSurface }]}>23%</Text>
            </View>
            <View style={styles.miniBars}>
              {[0.7, 1.0].map((h, i) => (
                <View key={i} style={[styles.miniBarVert, { height: h * 20, backgroundColor: i === 1 ? colors.primary : colors.surfaceContainerHighest }]} />
              ))}
            </View>
          </View>

          {/* Doomscroll score card */}
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.statLabel, { color: colors.outline }]}>Doomscroll Score</Text>
            <Text style={[styles.statBigNumber, { color: colors.onSurface }]}>68</Text>
            <Text style={[styles.statSubLabel, { color: colors.secondary }]}>Better +4 pts</Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainerHighest }]}>
              <View style={[styles.progressFill, { width: "68%", backgroundColor: colors.primary }]} />
            </View>
          </View>
        </View>

        {/* Start Focus Session CTA */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <Pressable
            style={[styles.focusCta, { backgroundColor: colors.primary }]}
            onPress={handleFocusPress}
          >
            <View style={styles.focusCtaInner}>
              <View style={styles.focusPlayBtn}>
                <MaterialIcons name="play-arrow" size={26} color={colors.primary} />
              </View>
              <Text style={[styles.focusCtaText, { color: colors.primaryForeground }]}>Start Focus Session</Text>
            </View>
          </Pressable>
        </Animated.View>

        {/* Most Used Apps */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.outline }]}>MOST USED APPS</Text>
            <MaterialIcons name="more-horiz" size={20} color={colors.outline} />
          </View>
          <View style={styles.appList}>
            {APPS.map((app, i) => <AppRow key={i} app={app} />)}
          </View>
        </View>

        {/* Weekly Focus */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.outline }]}>WEEKLY FOCUS</Text>
            <Text style={[styles.weeklyTotal, { color: colors.onSurface }]}>8h 20m</Text>
          </View>
          <View style={styles.weekBars}>
            {WEEK_DATA.map((d, i) => (
              <View key={i} style={styles.weekBarItem}>
                <View style={styles.weekBarOuter}>
                  <View
                    style={[
                      styles.weekBarFill,
                      {
                        height: `${d.value * 100}%` as any,
                        backgroundColor: d.today ? colors.primary : colors.surfaceContainerHighest,
                        borderRadius: 4,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.weekDay, { color: d.today ? colors.onSurface : colors.outline }]}>{d.day}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Quick Actions */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll}>
          {QUICK_ACTIONS.map((action, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.quickChip, { backgroundColor: colors.surfaceContainer }]}
              activeOpacity={0.7}
              onPress={() => Haptics.selectionAsync()}
            >
              <MaterialIcons name={action.icon} size={18} color={colors.onSurface} />
              <Text style={[styles.quickChipText, { color: colors.onSurface }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flex: 1 },
  headerGreeting: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  focusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    marginTop: 4,
  },
  focusBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  statsGrid: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1,
    borderRadius: 28,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
    gap: 6,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  statBigNumber: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
  },
  statBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 2,
  },
  statBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  statSubLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  miniBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: 22,
    marginTop: 4,
  },
  miniBarVert: { width: 10, borderRadius: 3 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: { height: "100%", borderRadius: 4 },
  focusCta: {
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  focusCtaInner: { flexDirection: "row", alignItems: "center", gap: 14 },
  focusPlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  focusCtaText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  card: {
    borderRadius: 28,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  weeklyTotal: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  appList: { gap: 14 },
  appRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  appIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  appInfo: { flex: 1 },
  appName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  appCategory: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    marginTop: 1,
  },
  appRight: { alignItems: "flex-end", gap: 4, minWidth: 60 },
  appTime: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  miniBarTrack: { height: 4, width: 52, borderRadius: 2, overflow: "hidden" },
  miniBarFill: { height: "100%", borderRadius: 2 },
  weekBars: {
    flexDirection: "row",
    justifyContent: "space-between",
    height: 80,
    alignItems: "flex-end",
  },
  weekBarItem: { alignItems: "center", gap: 4, flex: 1 },
  weekBarOuter: { flex: 1, width: "60%", justifyContent: "flex-end" },
  weekBarFill: { width: "100%" },
  weekDay: { fontSize: 11, fontFamily: "Inter_500Medium" },
  quickScroll: { marginHorizontal: -16 },
  quickChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    marginLeft: 12,
  },
  quickChipText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
