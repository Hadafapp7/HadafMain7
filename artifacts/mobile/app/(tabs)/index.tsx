import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb = Platform.OS === "web";

const APPS = [
  { name: "Instagram", category: "SOCIAL", time: "2h 15m", percent: 0.85, icon: "photo-camera" as const },
  { name: "TikTok", category: "ENTERTAINMENT", time: "1h 45m", percent: 0.66, icon: "music-video" as const },
  { name: "YouTube", category: "VIDEO", time: "45m", percent: 0.28, icon: "play-circle-filled" as const },
];

const WEEK_DATA = [
  { day: "Mon", value: 0.6 },
  { day: "Tue", value: 0.8 },
  { day: "Wed", value: 0.5 },
  { day: "Thu", value: 0.9 },
  { day: "Fri", value: 0.7 },
  { day: "Sat", value: 1.0, today: true },
  { day: "Sun", value: 0.3 },
];

type DayState = "complete" | "missed" | "partial";

const GOAL_MATCH_DATA = [
  {
    name: "Deep Work",
    time: "9:00 AM – 11:00 AM",
    days: [
      { day: "Mon", state: "complete" as DayState },
      { day: "Tue", state: "complete" as DayState },
      { day: "Wed", state: "partial"  as DayState },
      { day: "Thu", state: "missed"   as DayState },
      { day: "Fri", state: "complete" as DayState },
    ],
  },
  {
    name: "Morning Reading",
    time: "7:00 AM – 8:00 AM",
    days: [
      { day: "Mon", state: "complete" as DayState },
      { day: "Tue", state: "complete" as DayState },
      { day: "Wed", state: "complete" as DayState },
      { day: "Thu", state: "complete" as DayState },
      { day: "Fri", state: "complete" as DayState },
    ],
  },
  {
    name: "Evening Journal",
    time: "9:00 PM – 9:30 PM",
    days: [
      { day: "Mon", state: "missed"   as DayState },
      { day: "Tue", state: "missed"   as DayState },
      { day: "Wed", state: "partial"  as DayState },
      { day: "Thu", state: "complete" as DayState },
      { day: "Fri", state: "partial"  as DayState },
    ],
  },
];

const QUICK_ACTIONS = [
  { label: "Block Apps", icon: "block" as const },
  { label: "Set Limits", icon: "timelapse" as const },
  { label: "Downtime", icon: "nights-stay" as const },
  { label: "App Limits", icon: "hourglass-empty" as const },
];

function AnimatedProgressBar({ percent, delay = 0 }: { percent: number; delay?: number }) {
  const colors = useColors();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(percent, { damping: 20, stiffness: 90 }));
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as any,
  }));

  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainerHighest }]}>
      <Animated.View style={[styles.progressFill, { backgroundColor: colors.primary }, barStyle]} />
    </View>
  );
}

function CounterNumber({ target, delay = 0, suffix = "" }: { target: number; delay?: number; suffix?: string }) {
  const colors = useColors();
  const count = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useAnimatedReaction(
    () => Math.round(count.value),
    (current, prev) => {
      if (current !== prev) runOnJS(setDisplay)(current);
    }
  );

  useEffect(() => {
    count.value = withDelay(delay, withTiming(target, { duration: 1000 }));
  }, []);

  return (
    <Text style={[styles.statBigNumber, { color: colors.onSurface }]}>
      {display}{suffix}
    </Text>
  );
}

function DayDot({
  state,
  dayLabel,
  delay,
}: {
  state: DayState;
  dayLabel: string;
  delay: number;
}) {
  const colors = useColors();
  const bgColor   = state === "complete" ? "#16a34a" : state === "missed" ? "#dc2626" : colors.surfaceContainerHighest;
  const iconName  = state === "complete" ? "check" : state === "missed" ? "close" : "remove";
  const iconColor = state === "partial"  ? colors.outline : "#fff";

  return (
    <Animated.View
      entering={isWeb ? undefined : FadeIn.delay(delay)}
      style={styles.dayDotWrap}
    >
      <View style={[styles.dayDot, { backgroundColor: bgColor }]}>
        <MaterialIcons name={iconName as any} size={14} color={iconColor} />
      </View>
      <Text style={[styles.dayLabel, { color: colors.outline }]}>{dayLabel}</Text>
    </Animated.View>
  );
}

function GoalMatchTracker({
  goal,
  goalIndex,
}: {
  goal: typeof GOAL_MATCH_DATA[0];
  goalIndex: number;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.matchRow,
        goalIndex < GOAL_MATCH_DATA.length - 1 && {
          borderBottomWidth: 1,
          borderBottomColor: colors.surfaceContainerHigh,
        },
      ]}
    >
      <View style={styles.matchHeader}>
        <Text style={[styles.goalItemName, { color: colors.onSurface }]}>{goal.name}</Text>
        <Text style={[styles.goalItemTime, { color: colors.outline }]}>{goal.time}</Text>
      </View>
      <View style={styles.dayDots}>
        {goal.days.map((d, i) => (
          <DayDot
            key={d.day}
            state={d.state}
            dayLabel={d.day}
            delay={goalIndex * 80 + i * 55}
          />
        ))}
      </View>
    </View>
  );
}

function AppRow({ app, index }: { app: typeof APPS[0]; index: number }) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(400 + index * 120, withSpring(app.percent, { damping: 20 }));
  }, []);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as any }));

  return (
    <Animated.View
      style={pressStyle}
      entering={isWeb ? undefined : FadeInDown.delay(300 + index * 80).springify()}
    >
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
            <Animated.View style={[styles.miniBarFill, { backgroundColor: colors.primary }, barStyle]} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function PressableCard({ children, style, delay = 0 }: { children: React.ReactNode; style?: any; delay?: number }) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[pressStyle, style]}
      entering={isWeb ? undefined : FadeInDown.delay(delay).springify()}
      onTouchStart={() => { scale.value = withSpring(0.97, { damping: 12 }); }}
      onTouchEnd={() => { scale.value = withSpring(1, { damping: 12 }); }}
      onTouchCancel={() => { scale.value = withSpring(1, { damping: 12 }); }}
    >
      {children}
    </Animated.View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 67 : insets.top;
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />

      {/* Fixed header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: "rgba(249,249,249,0.88)" }]}>
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
          <PressableCard delay={60} style={[styles.statCard, { backgroundColor: colors.card }]}>
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
          </PressableCard>

          <PressableCard delay={120} style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.statLabel, { color: colors.outline }]}>Doomscroll</Text>
            <CounterNumber target={68} delay={200} />
            <Text style={[styles.statSubLabel, { color: colors.secondary }]}>Better +4 pts</Text>
            <AnimatedProgressBar percent={0.68} delay={400} />
          </PressableCard>
        </View>

        {/* Goals Progress */}
        <PressableCard delay={180} style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.outline }]}>GOALS PROGRESS</Text>
            <MaterialIcons name="flag" size={18} color={colors.outline} />
          </View>
          <View style={styles.goalsList}>
            {GOAL_MATCH_DATA.map((goal, i) => (
              <GoalMatchTracker key={i} goal={goal} goalIndex={i} />
            ))}
          </View>
        </PressableCard>

        {/* Most Used Apps */}
        <PressableCard delay={240} style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.outline }]}>MOST USED APPS</Text>
            <MaterialIcons name="more-horiz" size={20} color={colors.outline} />
          </View>
          <View style={styles.appList}>
            {APPS.map((app, i) => <AppRow key={i} app={app} index={i} />)}
          </View>
        </PressableCard>

        {/* Weekly Focus */}
        <PressableCard delay={300} style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.outline }]}>WEEKLY FOCUS</Text>
            <Text style={[styles.weeklyTotal, { color: colors.onSurface }]}>8h 20m</Text>
          </View>
          <View style={styles.weekBars}>
            {WEEK_DATA.map((d, i) => (
              <WeekBar key={i} data={d} index={i} />
            ))}
          </View>
        </PressableCard>

        {/* Quick Actions */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(360).springify()}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll}>
            {QUICK_ACTIONS.map((action, i) => (
              <QuickChip key={i} action={action} index={i} />
            ))}
          </ScrollView>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function WeekBar({ data, index }: { data: typeof WEEK_DATA[0]; index: number }) {
  const colors = useColors();
  const height = useSharedValue(0);

  useEffect(() => {
    height.value = withDelay(350 + index * 60, withSpring(data.value * 100, { damping: 18 }));
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    height: `${height.value}%` as any,
  }));

  return (
    <View style={styles.weekBarItem}>
      <View style={styles.weekBarOuter}>
        <Animated.View
          style={[
            styles.weekBarFill,
            {
              backgroundColor: data.today ? colors.primary : colors.surfaceContainerHighest,
              borderRadius: 4,
            },
            barStyle,
          ]}
        />
      </View>
      <Text style={[styles.weekDay, { color: data.today ? colors.onSurface : colors.outline }]}>{data.day}</Text>
    </View>
  );
}

function QuickChip({ action, index }: { action: typeof QUICK_ACTIONS[0]; index: number }) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const chipStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={chipStyle}>
      <TouchableOpacity
        style={[styles.quickChip, { backgroundColor: colors.surfaceContainer }]}
        activeOpacity={0.7}
        onPressIn={() => { scale.value = withSpring(0.94, { damping: 12 }); }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12 });
          Haptics.selectionAsync();
        }}
      >
        <MaterialIcons name={action.icon} size={18} color={colors.onSurface} />
        <Text style={[styles.quickChipText, { color: colors.onSurface }]}>{action.label}</Text>
      </TouchableOpacity>
    </Animated.View>
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
  headerGreeting: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  focusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    marginTop: 4,
  },
  focusBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  onSurfaceVariant: { color: "#474747" },
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
  statLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  statBigNumber: { fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  statBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 2,
  },
  statBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statSubLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  miniBars: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 22, marginTop: 4 },
  miniBarVert: { width: 10, borderRadius: 3 },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden", marginTop: 4 },
  progressFill: { height: "100%", borderRadius: 4 },
  // Goals match tracker
  goalsList:   { gap: 0 },
  matchRow:    { paddingVertical: 14, gap: 10 },
  matchHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalItemName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  goalItemTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  dayDots:     { flexDirection: "row", justifyContent: "space-between" },
  dayDotWrap:  { alignItems: "center", gap: 5, flex: 1 },
  dayDot:      { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  dayLabel:    { fontSize: 10, fontFamily: "Inter_500Medium" },

  card: {
    borderRadius: 28,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  cardTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  weeklyTotal: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  appList: { gap: 14 },
  appRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  appIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  appInfo: { flex: 1 },
  appName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  appCategory: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.5, marginTop: 1 },
  appRight: { alignItems: "flex-end", gap: 4, minWidth: 60 },
  appTime: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  miniBarTrack: { height: 4, width: 52, borderRadius: 2, overflow: "hidden" },
  miniBarFill: { height: "100%", borderRadius: 2 },
  weekBars: { flexDirection: "row", justifyContent: "space-between", height: 80, alignItems: "flex-end" },
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
  quickChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
