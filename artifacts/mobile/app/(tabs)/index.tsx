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
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb    = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;
const CAL_W    = SCREEN_W * 0.92;
const CELL_W   = (CAL_W - 40) / 7;

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_HDRS = ["M","T","W","T","F","S","S"];

// ─── Data ─────────────────────────────────────────────────────────────────────

const APPS = [
  { name: "Instagram", category: "SOCIAL",       time: "2h 15m", percent: 0.85, icon: "photo-camera"      as const },
  { name: "TikTok",    category: "ENTERTAINMENT", time: "1h 45m", percent: 0.66, icon: "music-video"       as const },
  { name: "YouTube",   category: "VIDEO",         time: "45m",    percent: 0.28, icon: "play-circle-filled" as const },
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

const TODAY_YEAR  = 2026;
const TODAY_MONTH = 4;   // May
const TODAY_DAY   = 31;

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function getMonthStart(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
}
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function getDotState(year: number, mIdx: number, day: number): DayState | null {
  if (year !== 2026) return null;
  if (mIdx > TODAY_MONTH || (mIdx === TODAY_MONTH && day > TODAY_DAY)) return null;
  const s = ((mIdx + 1) * 100 + day) * 31;
  if (s % 13 === 0) return "missed";
  if (s % 7  === 0) return "partial";
  return "complete";
}

// ─── Interactive Calendar Modal ───────────────────────────────────────────────

function CalDot({ state }: { state: DayState }) {
  const c = state === "complete" ? "#16a34a" : state === "missed" ? "#dc2626" : "#a3a3a3";
  return <View style={[styles.calDot, { backgroundColor: c }]} />;
}

function CalendarModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors  = useColors();
  const scale   = useSharedValue(0.88);
  const opacity = useSharedValue(0);
  const slideX  = useSharedValue(0);

  const [viewMonth, setViewMonth] = useState(TODAY_MONTH);
  const [viewYear,  setViewYear]  = useState(TODAY_YEAR);

  useEffect(() => {
    if (visible) {
      scale.value   = withSpring(1, { damping: 18, stiffness: 120 });
      opacity.value = withTiming(1, { duration: 180 });
      setViewMonth(TODAY_MONTH);
      setViewYear(TODAY_YEAR);
      slideX.value = 0;
    } else {
      scale.value   = 0.88;
      opacity.value = 0;
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));
  const gridStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));

  const stepMonth = (dir: number) => {
    setViewMonth(prev => {
      const next = prev + dir;
      if (next < 0)  { setViewYear(y => y - 1); return 11; }
      if (next > 11) { setViewYear(y => y + 1); return 0;  }
      return next;
    });
  };

  const navigate = (dir: number) => {
    slideX.value = withTiming(dir > 0 ? -280 : 280, { duration: 170 }, () => {
      runOnJS(stepMonth)(dir);
      slideX.value = dir > 0 ? 280 : -280;
      slideX.value = withTiming(0, { duration: 170 });
    });
  };

  const startDay  = getMonthStart(viewYear, viewMonth);
  const dayCount  = getDaysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= dayCount; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.calOuter}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <Animated.View
          style={[styles.calSheet, { backgroundColor: colors.card }, sheetStyle]}
          onStartShouldSetResponder={() => true}
        >
          {/* Year + month navigation row */}
          <View style={styles.calNavRow}>
            {/* Year selector */}
            <View style={styles.yearSelector}>
              <TouchableOpacity onPress={() => setViewYear(y => y - 1)} hitSlop={12}>
                <MaterialIcons name="keyboard-arrow-up" size={18} color={colors.outline} />
              </TouchableOpacity>
              <Text style={[styles.calYearTxt, { color: colors.onSurface }]}>{viewYear}</Text>
              <TouchableOpacity onPress={() => setViewYear(y => y + 1)} hitSlop={12}>
                <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.outline} />
              </TouchableOpacity>
            </View>

            {/* Month navigation */}
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={() => navigate(-1)} hitSlop={12}>
                <MaterialIcons name="chevron-left" size={26} color={colors.onSurface} />
              </TouchableOpacity>
              <Text style={[styles.calMonthTxt, { color: colors.onSurface }]}>
                {MONTH_NAMES[viewMonth]}
              </Text>
              <TouchableOpacity onPress={() => navigate(1)} hitSlop={12}>
                <MaterialIcons name="chevron-right" size={26} color={colors.onSurface} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={onClose} hitSlop={14}>
              <MaterialIcons name="close" size={20} color={colors.outline} />
            </TouchableOpacity>
          </View>

          {/* Legend */}
          <View style={styles.calLegend}>
            {(["complete","missed","partial"] as DayState[]).map((s) => (
              <View key={s} style={styles.calLegendItem}>
                <CalDot state={s} />
                <Text style={[styles.calLegendTxt, { color: colors.outline }]}>
                  {s === "complete" ? "Done" : s === "missed" ? "Missed" : "Partial"}
                </Text>
              </View>
            ))}
          </View>

          {/* Weekday headers */}
          <View style={styles.calDayHdrs}>
            {DAY_HDRS.map((l, i) => (
              <Text key={i} style={[styles.calDayHdr, { color: colors.outline, width: CELL_W }]}>{l}</Text>
            ))}
          </View>

          {/* Sliding grid */}
          <View style={{ overflow: "hidden" }}>
            <Animated.View style={[styles.calGrid, gridStyle]}>
              {cells.map((day, idx) => {
                if (!day) return <View key={idx} style={[styles.calCell, { width: CELL_W }]} />;
                const dot     = getDotState(viewYear, viewMonth, day);
                const isToday = viewYear === TODAY_YEAR && viewMonth === TODAY_MONTH && day === TODAY_DAY;
                const isFuture = (viewYear > TODAY_YEAR)
                  || (viewYear === TODAY_YEAR && viewMonth > TODAY_MONTH)
                  || (viewYear === TODAY_YEAR && viewMonth === TODAY_MONTH && day > TODAY_DAY);
                return (
                  <View key={idx} style={[
                    styles.calCell, { width: CELL_W },
                    isToday && { backgroundColor: "#e8e8e8", borderRadius: 8 },
                  ]}>
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
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Animated helpers ─────────────────────────────────────────────────────────

function AnimatedProgressBar({ percent, delay = 0, trackColor, fillColor }: {
  percent: number; delay?: number; trackColor?: string; fillColor?: string;
}) {
  const colors   = useColors();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withSpring(percent, { damping: 20, stiffness: 90 }));
  }, []);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as any }));
  return (
    <View style={[styles.progressTrack, { backgroundColor: trackColor ?? colors.surfaceContainerHighest }]}>
      <Animated.View style={[styles.progressFill, { backgroundColor: fillColor ?? colors.primary }, barStyle]} />
    </View>
  );
}

function CounterNumber({ target, delay = 0, color }: { target: number; delay?: number; color?: string }) {
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
  return <Text style={[styles.heroNumber, { color: color ?? colors.onSurface }]}>{display}</Text>;
}

// ─── Day dot ─────────────────────────────────────────────────────────────────

function DayDot({ state, dayLabel }: { state: DayState; dayLabel: string }) {
  const colors    = useColors();
  const bgColor   = state === "complete" ? "#16a34a" : state === "missed" ? "#dc2626" : colors.surfaceContainerHighest;
  const iconName  = state === "complete" ? "check"   : state === "missed" ? "close"   : "remove";
  const iconColor = state === "partial"  ? colors.outline : "#fff";
  return (
    <View style={styles.dayDotWrap}>
      <View style={[styles.dayDot, { backgroundColor: bgColor }]}>
        <MaterialIcons name={iconName as any} size={13} color={iconColor} />
      </View>
      <Text style={[styles.dayLabel, { color: colors.outline }]}>{dayLabel}</Text>
    </View>
  );
}

function DayRow({ days }: { days: typeof GOAL_MATCH_DATA[0]["days"] }) {
  const colors = useColors();
  return (
    <View style={[styles.dayRowPill, { backgroundColor: colors.surfaceContainerHigh + "55" }]}>
      <View style={styles.dayDots}>
        {days.map((d, i) => <DayDot key={i} state={d.state} dayLabel={d.day} />)}
      </View>
    </View>
  );
}

function GoalMatchTracker({ goal, goalIndex }: { goal: typeof GOAL_MATCH_DATA[0]; goalIndex: number }) {
  const colors = useColors();
  return (
    <View style={[
      styles.matchRow,
      goalIndex < GOAL_MATCH_DATA.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerHigh },
    ]}>
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
          <MaterialIcons name={app.icon} size={20} color={colors.onSurface} />
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

function PressableCard({ children, style, delay = 0 }: { children: React.ReactNode; style?: any; delay?: number }) {
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

// ─── Home screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 24 : insets.top;
  const [showCal, setShowCal] = useState(false);
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
        {/* ── Hero stat cards — solid black, largest cards ── */}
        <View style={styles.statsGrid}>
          <PressableCard delay={40} style={styles.heroCard}>
            <Text style={styles.heroLabel}>Screen Time</Text>
            <Text style={styles.heroNumber}>4h 32m</Text>
            <View style={styles.heroBadge}>
              <MaterialIcons name="south-east" size={12} color="rgba(255,255,255,0.8)" />
              <Text style={styles.heroBadgeText}>23%</Text>
            </View>
            <View style={styles.miniBars}>
              {[0.7, 1.0].map((h, i) => (
                <View key={i} style={[styles.miniBarVert, {
                  height: h * 28,
                  backgroundColor: i === 1 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.22)",
                }]} />
              ))}
            </View>
          </PressableCard>

          <PressableCard delay={100} style={styles.heroCard}>
            <Text style={styles.heroLabel}>Doomscroll</Text>
            <CounterNumber target={68} delay={200} color="#fff" />
            <Text style={styles.heroSubLabel}>Better +4 pts</Text>
            <AnimatedProgressBar
              percent={0.68} delay={400}
              trackColor="rgba(255,255,255,0.15)"
              fillColor="rgba(255,255,255,0.75)"
            />
          </PressableCard>
        </View>

        {/* ── Goals Progress — tap to open interactive calendar ── */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(160).springify()}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setShowCal(true)}
            style={[styles.card, { backgroundColor: cardBg }]}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.outline }]}>GOALS PROGRESS</Text>
              <MaterialIcons name="flag" size={15} color={colors.outline} />
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
            <MaterialIcons name="more-horiz" size={16} color={colors.outline} />
          </View>
          <View style={styles.appList}>
            {APPS.map((app, i) => <AppRow key={i} app={app} index={i} />)}
          </View>
        </PressableCard>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },

  // Hero stat grid
  statsGrid: { flexDirection: "row", gap: 12 },
  heroCard: {
    flex: 1, borderRadius: 28, padding: 22, minHeight: 176,
    backgroundColor: "#000",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.30, shadowRadius: 24, elevation: 8,
    gap: 8, justifyContent: "flex-end",
  },
  heroLabel:     { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1, color: "rgba(255,255,255,0.5)" },
  heroNumber:    { fontSize: 36, fontFamily: "Inter_700Bold", letterSpacing: -1.5, color: "#fff" },
  heroBadge:     { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  heroBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.8)" },
  heroSubLabel:  { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.55)" },
  miniBars:      { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 28, marginTop: 4 },
  miniBarVert:   { width: 10, borderRadius: 3 },
  progressTrack: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: 2 },
  progressFill:  { height: "100%", borderRadius: 3 },

  // Secondary card
  card: {
    borderRadius: 22, padding: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 20, elevation: 2,
  },
  cardHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 10,
  },
  cardTitle: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },

  // Goals tracker
  goalsList:    { gap: 0 },
  matchRow:     { paddingVertical: 9, gap: 7 },
  matchHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalItemName: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  goalItemTime: { fontSize: 10, fontFamily: "Inter_400Regular" },
  dayRowPill:   { borderRadius: 10, overflow: "hidden", paddingVertical: 4 },
  dayDots:      { flexDirection: "row" },
  dayDotWrap:   { alignItems: "center", gap: 4, flex: 1 },
  dayDot:       { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  dayLabel:     { fontSize: 9, fontFamily: "Inter_500Medium" },

  // Apps
  appList:      { gap: 11 },
  appRow:       { flexDirection: "row", alignItems: "center", gap: 11 },
  appIcon:      { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  appInfo:      { flex: 1 },
  appName:      { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  appCategory:  { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 0.5, marginTop: 1 },
  appRight:     { alignItems: "flex-end", gap: 4, minWidth: 58 },
  appTime:      { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  miniBarTrack: { height: 4, width: 48, borderRadius: 2, overflow: "hidden" },
  miniBarFill:  { height: "100%", borderRadius: 2 },

  // Calendar modal
  calOuter:   { flex: 1, alignItems: "center", justifyContent: "center" },
  calSheet:   {
    width: CAL_W, borderRadius: 24, padding: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2, shadowRadius: 32, elevation: 16,
  },
  calNavRow:    { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 6 },
  yearSelector: { flexDirection: "column", alignItems: "center", gap: 0 },
  calYearTxt:   { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center", minWidth: 38 },
  monthNav:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  calMonthTxt:  { fontSize: 16, fontFamily: "Inter_700Bold", minWidth: 100, textAlign: "center" },
  calLegend:    { flexDirection: "row", gap: 10, marginBottom: 10 },
  calLegendItem:{ flexDirection: "row", alignItems: "center", gap: 4 },
  calLegendTxt: { fontSize: 10, fontFamily: "Inter_500Medium" },
  calDayHdrs:   { flexDirection: "row", marginBottom: 2 },
  calDayHdr:    { textAlign: "center", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  calGrid:      { flexDirection: "row", flexWrap: "wrap" },
  calCell:      { alignItems: "center", paddingVertical: 5, gap: 2 },
  calDayNum:    { fontSize: 12, fontFamily: "Inter_500Medium" },
  calDot:       { width: 5, height: 5, borderRadius: 2.5 },
});
