import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
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

const isWeb   = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;

// ─── Data ────────────────────────────────────────────────────────────────────

const APPS = [
  { name: "Instagram", category: "SOCIAL",       time: "2h 15m", percent: 0.85, icon: "photo-camera"     as const },
  { name: "TikTok",    category: "ENTERTAINMENT", time: "1h 45m", percent: 0.66, icon: "music-video"      as const },
  { name: "YouTube",   category: "VIDEO",         time: "45m",    percent: 0.28, icon: "play-circle-filled" as const },
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

// 5-day fixed window for the Goals Progress rows
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

// Full 2026 year — month name, day count, Mon-first start index (Mon=0)
const MONTHS_2026 = [
  { name: "January",   days: 31, start: 3 },
  { name: "February",  days: 28, start: 6 },
  { name: "March",     days: 31, start: 6 },
  { name: "April",     days: 30, start: 2 },
  { name: "May",       days: 31, start: 4 },
  { name: "June",      days: 30, start: 0 },
  { name: "July",      days: 31, start: 2 },
  { name: "August",    days: 31, start: 5 },
  { name: "September", days: 30, start: 1 },
  { name: "October",   days: 31, start: 3 },
  { name: "November",  days: 30, start: 6 },
  { name: "December",  days: 31, start: 1 },
];

const TODAY_MONTH = 4;  // May = index 4
const TODAY_DAY   = 31;

// Returns a single dot state for a calendar day, or null (no activity)
function getDotState(mIdx: number, day: number): DayState | null {
  if (mIdx > TODAY_MONTH || (mIdx === TODAY_MONTH && day > TODAY_DAY)) return null;
  const seed = (mIdx + 1) * 100 + day;
  const s    = seed * 31;
  if (s % 13 === 0) return "missed";
  if (s % 7  === 0) return "partial";
  return "complete";
}

// ─── Calendar Modal ───────────────────────────────────────────────────────────

function CalDot({ state }: { state: DayState }) {
  const color = state === "complete" ? "#16a34a" : state === "missed" ? "#dc2626" : "#a3a3a3";
  return <View style={[styles.calSingleDot, { backgroundColor: color }]} />;
}

function MonthBlock({ month, mIdx }: { month: typeof MONTHS_2026[0]; mIdx: number }) {
  const colors = useColors();

  const cells: (number | null)[] = [];
  for (let i = 0; i < month.start; i++) cells.push(null);
  for (let d = 1; d <= month.days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={styles.monthBlock}>
      <Text style={[styles.monthName, { color: colors.onSurface }]}>{month.name}</Text>
      <View style={styles.calGrid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={idx} style={styles.calCell} />;
          const dot     = getDotState(mIdx, day);
          const isToday = mIdx === TODAY_MONTH && day === TODAY_DAY;
          const isFuture = mIdx > TODAY_MONTH || (mIdx === TODAY_MONTH && day > TODAY_DAY);
          return (
            <View key={idx} style={[styles.calCell, isToday && styles.calCellToday]}>
              <Text style={[
                styles.calDayNum,
                { color: isFuture ? colors.outlineVariant : colors.onSurface },
                isToday && { color: colors.primary, fontFamily: "Inter_700Bold" },
              ]}>
                {day}
              </Text>
              {dot && <CalDot state={dot} />}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CalendarModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors  = useColors();
  const scale   = useSharedValue(0.88);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value   = withSpring(1, { damping: 18, stiffness: 120 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      scale.value   = 0.88;
      opacity.value = 0;
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  const DAY_HDRS = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.calOuter}>
        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <Animated.View
          style={[styles.calSheet, { backgroundColor: colors.card }, sheetStyle]}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={styles.calHeader}>
            <Text style={[styles.calTitle, { color: colors.onSurface }]}>2026</Text>
            <View style={styles.calLegendRow}>
              <View style={[styles.calSingleDot, { backgroundColor: "#16a34a" }]} />
              <View style={[styles.calSingleDot, { backgroundColor: "#dc2626" }]} />
              <View style={[styles.calSingleDot, { backgroundColor: "#a3a3a3" }]} />
              <TouchableOpacity onPress={onClose} hitSlop={14} style={{ marginLeft: 8 }}>
                <MaterialIcons name="close" size={20} color={colors.outline} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Day-of-week header row (shared across all months) */}
          <View style={styles.calDayHdrs}>
            {DAY_HDRS.map((l, i) => (
              <Text key={i} style={[styles.calDayHdr, { color: colors.outline }]}>{l}</Text>
            ))}
          </View>

          {/* Scrollable full-year grid */}
          <ScrollView showsVerticalScrollIndicator={false}>
            {MONTHS_2026.map((month, mIdx) => (
              <MonthBlock key={mIdx} month={month} mIdx={mIdx} />
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Animated helpers ─────────────────────────────────────────────────────────

function AnimatedProgressBar({ percent, delay = 0 }: { percent: number; delay?: number }) {
  const colors   = useColors();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withSpring(percent, { damping: 20, stiffness: 90 }));
  }, []);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as any }));
  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainerHighest }]}>
      <Animated.View style={[styles.progressFill, { backgroundColor: colors.primary }, barStyle]} />
    </View>
  );
}

function CounterNumber({ target, delay = 0, suffix = "" }: { target: number; delay?: number; suffix?: string }) {
  const colors  = useColors();
  const count   = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useAnimatedReaction(
    () => Math.round(count.value),
    (cur, prev) => { if (cur !== prev) runOnJS(setDisplay)(cur); }
  );

  useEffect(() => {
    count.value = withDelay(delay, withTiming(target, { duration: 1000 }));
  }, []);

  return (
    <Text style={[styles.statBigNumber, { color: colors.onSurface }]}>{display}{suffix}</Text>
  );
}

// ─── Day dot (circle indicator inside goal rows) ──────────────────────────────

function DayDot({ state, dayLabel }: { state: DayState; dayLabel: string }) {
  const colors    = useColors();
  const bgColor   = state === "complete" ? "#16a34a" : state === "missed" ? "#dc2626" : colors.surfaceContainerHighest;
  const iconName  = state === "complete" ? "check"   : state === "missed" ? "close"   : "remove";
  const iconColor = state === "partial"  ? colors.outline : "#fff";

  return (
    <View style={styles.dayDotWrap}>
      <View style={[styles.dayDot, { backgroundColor: bgColor }]}>
        <MaterialIcons name={iconName as any} size={14} color={iconColor} />
      </View>
      <Text style={[styles.dayLabel, { color: colors.outline }]}>{dayLabel}</Text>
    </View>
  );
}

// ─── Static day row (5 circles with pill highlight) ───────────────────────────

function DayRow({ days }: { days: typeof GOAL_MATCH_DATA[0]["days"] }) {
  const colors = useColors();
  return (
    <View style={[styles.dayRowPill, { backgroundColor: colors.surfaceContainerHigh + "55" }]}>
      <View style={styles.dayDots}>
        {days.map((d, i) => (
          <DayDot key={i} state={d.state} dayLabel={d.day} />
        ))}
      </View>
    </View>
  );
}

// ─── Goal match tracker ───────────────────────────────────────────────────────

function GoalMatchTracker({ goal, goalIndex }: {
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
      <DayRow days={goal.days} />
    </View>
  );
}

// ─── App row ──────────────────────────────────────────────────────────────────

function AppRow({ app, index }: { app: typeof APPS[0]; index: number }) {
  const colors   = useColors();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(400 + index * 120, withSpring(app.percent, { damping: 20 }));
  }, []);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as any }));
  return (
    <Animated.View entering={isWeb ? undefined : FadeInDown.delay(300 + index * 80).springify()}>
      <View style={styles.appRow}>
        <View style={[styles.appIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
          <MaterialIcons name={app.icon} size={22} color={colors.onSurface} />
        </View>
        <View style={styles.appInfo}>
          <Text style={[styles.appName,     { color: colors.onSurface }]}>{app.name}</Text>
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

// ─── Pressable card ───────────────────────────────────────────────────────────

function PressableCard({ children, style, delay = 0 }: {
  children: React.ReactNode;
  style?: any;
  delay?: number;
}) {
  const scale      = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View entering={isWeb ? undefined : FadeInDown.delay(delay).springify()}>
      <Animated.View
        style={[pressStyle, style]}
        onTouchStart={()  => { scale.value = withSpring(0.97, { damping: 12 }); }}
        onTouchEnd={()    => { scale.value = withSpring(1,    { damping: 12 }); }}
        onTouchCancel={() => { scale.value = withSpring(1,    { damping: 12 }); }}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

// ─── Week bar ─────────────────────────────────────────────────────────────────

function WeekBar({ data, index }: { data: typeof WEEK_DATA[0]; index: number }) {
  const colors = useColors();
  const height = useSharedValue(0);
  useEffect(() => {
    height.value = withDelay(350 + index * 60, withSpring(data.value * 100, { damping: 18 }));
  }, []);
  const barStyle = useAnimatedStyle(() => ({ height: `${height.value}%` as any }));
  return (
    <View style={styles.weekBarItem}>
      <View style={styles.weekBarOuter}>
        <Animated.View
          style={[
            styles.weekBarFill,
            { backgroundColor: data.today ? colors.primary : colors.surfaceContainerHighest, borderRadius: 4 },
            barStyle,
          ]}
        />
      </View>
      <Text style={[styles.weekDay, { color: data.today ? colors.onSurface : colors.outline }]}>{data.day}</Text>
    </View>
  );
}

// ─── Home screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 24 : insets.top;
  const [showCal, setShowCal] = useState(false);

  // Uniform soft grey for all cards
  const cardBg = colors.surfaceContainerLow;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />
      <CalendarModal visible={showCal} onClose={() => setShowCal(false)} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 16, paddingBottom: isWeb ? 34 + 84 : 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Stats grid ── */}
        <View style={styles.statsGrid}>
          <PressableCard delay={40} style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statLabel, { color: colors.outline }]}>Screen Time</Text>
            <Text style={[styles.statBigNumber, { color: colors.onSurface }]}>4h 32m</Text>
            <View style={[styles.statBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
              <MaterialIcons name="south-east" size={12} color={colors.onSurface} />
              <Text style={[styles.statBadgeText, { color: colors.onSurface }]}>23%</Text>
            </View>
            <View style={styles.miniBars}>
              {[0.7, 1.0].map((h, i) => (
                <View key={i} style={[styles.miniBarVert, {
                  height: h * 20,
                  backgroundColor: i === 1 ? colors.primary : colors.surfaceContainerHighest,
                }]} />
              ))}
            </View>
          </PressableCard>

          <PressableCard delay={100} style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statLabel, { color: colors.outline }]}>Doomscroll</Text>
            <CounterNumber target={68} delay={200} />
            <Text style={[styles.statSubLabel, { color: colors.secondary }]}>Better +4 pts</Text>
            <AnimatedProgressBar percent={0.68} delay={400} />
          </PressableCard>
        </View>

        {/* ── Goals Progress — tap anywhere to open calendar ── */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(160).springify()}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setShowCal(true)}
            style={[styles.card, { backgroundColor: cardBg }]}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.outline }]}>GOALS PROGRESS</Text>
              <MaterialIcons name="flag" size={18} color={colors.outline} />
            </View>
            <View style={styles.goalsList}>
              {GOAL_MATCH_DATA.map((goal, i) => (
                <GoalMatchTracker key={i} goal={goal} goalIndex={i} />
              ))}
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Most Used Apps ── */}
        <PressableCard delay={220} style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.outline }]}>MOST USED APPS</Text>
            <MaterialIcons name="more-horiz" size={20} color={colors.outline} />
          </View>
          <View style={styles.appList}>
            {APPS.map((app, i) => <AppRow key={i} app={app} index={i} />)}
          </View>
        </PressableCard>

        {/* ── Weekly Focus ── */}
        <PressableCard delay={280} style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.outline }]}>WEEKLY FOCUS</Text>
            <Text style={[styles.weeklyTotal, { color: colors.onSurface }]}>8h 20m</Text>
          </View>
          <View style={styles.weekBars}>
            {WEEK_DATA.map((d, i) => <WeekBar key={i} data={d} index={i} />)}
          </View>
        </PressableCard>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CAL_CELL_W = (SCREEN_W * 0.9 - 40) / 7; // modal width − padding, divided by 7 columns

const styles = StyleSheet.create({
  root:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },

  // ── Stats grid ──
  statsGrid: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1, borderRadius: 28, padding: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 24, elevation: 2, gap: 6,
  },
  statLabel:     { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  statBigNumber: { fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  statBadge: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, gap: 2,
  },
  statBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statSubLabel:  { fontSize: 12, fontFamily: "Inter_500Medium" },
  miniBars:      { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 22, marginTop: 4 },
  miniBarVert:   { width: 10, borderRadius: 3 },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden", marginTop: 4 },
  progressFill:  { height: "100%", borderRadius: 4 },

  // ── Shared card ──
  card: {
    borderRadius: 28, padding: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 24, elevation: 2,
  },
  cardHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 16,
  },
  cardTitle:   { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  weeklyTotal: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  // ── Goals tracker ──
  goalsList:    { gap: 0 },
  matchRow:     { paddingVertical: 14, gap: 10 },
  matchHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalItemName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  goalItemTime: { fontSize: 11, fontFamily: "Inter_400Regular" },

  // Day row pill + dots
  dayRowPill: { borderRadius: 12, overflow: "hidden", paddingVertical: 6 },
  dayDots:    { flexDirection: "row" },
  dayDotWrap: { alignItems: "center", gap: 5, flex: 1 },
  dayDot:     { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  dayLabel:   { fontSize: 10, fontFamily: "Inter_500Medium" },

  // ── Apps ──
  appList:    { gap: 14 },
  appRow:     { flexDirection: "row", alignItems: "center", gap: 12 },
  appIcon:    { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  appInfo:    { flex: 1 },
  appName:    { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  appCategory:{ fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.5, marginTop: 1 },
  appRight:   { alignItems: "flex-end", gap: 4, minWidth: 60 },
  appTime:    { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  miniBarTrack: { height: 4, width: 52, borderRadius: 2, overflow: "hidden" },
  miniBarFill:  { height: "100%", borderRadius: 2 },

  // ── Week bars ──
  weekBars:    { flexDirection: "row", justifyContent: "space-between", height: 80, alignItems: "flex-end" },
  weekBarItem: { alignItems: "center", gap: 4, flex: 1 },
  weekBarOuter:{ flex: 1, width: "60%", justifyContent: "flex-end" },
  weekBarFill: { width: "100%" },
  weekDay:     { fontSize: 11, fontFamily: "Inter_500Medium" },

  // ── Calendar modal ──
  calOuter: { flex: 1, alignItems: "center", justifyContent: "center" },
  calSheet: {
    width: SCREEN_W * 0.9,
    maxHeight: "82%",
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 14,
  },
  calHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  calTitle:     { fontSize: 20, fontFamily: "Inter_700Bold" },
  calLegendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  calDayHdrs:   { flexDirection: "row", marginBottom: 4 },
  calDayHdr:    { width: CAL_CELL_W, textAlign: "center", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  // Month block
  monthBlock: { marginBottom: 20 },
  monthName:  { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6, letterSpacing: 0.2 },
  calGrid:    { flexDirection: "row", flexWrap: "wrap" },
  calCell:    { width: CAL_CELL_W, alignItems: "center", paddingVertical: 4, gap: 2 },
  calCellToday: { backgroundColor: "#e8e8e8", borderRadius: 8 },
  calDayNum:  { fontSize: 11, fontFamily: "Inter_500Medium" },
  calSingleDot: { width: 5, height: 5, borderRadius: 2.5 },
});
