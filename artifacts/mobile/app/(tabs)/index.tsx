import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  PanResponder,
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
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;
// card padding 20×2=40, content horizontal padding 16×2=32 → inner width
const CARD_INNER_W = SCREEN_W - 72;
const DOT_ITEM_W = Math.floor(CARD_INNER_W / 5);

// ─── Data ───────────────────────────────────────────────────────────────────

const APPS = [
  { name: "Instagram", category: "SOCIAL",         time: "2h 15m", percent: 0.85, icon: "photo-camera"    as const },
  { name: "TikTok",    category: "ENTERTAINMENT",   time: "1h 45m", percent: 0.66, icon: "music-video"     as const },
  { name: "YouTube",   category: "VIDEO",           time: "45m",    percent: 0.28, icon: "play-circle-filled" as const },
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

// 9 days per goal (4 older + 5 recent) — used for swipeable history
const GOAL_MATCH_DATA = [
  {
    name: "Deep Work",
    time: "9:00 AM – 11:00 AM",
    days: [
      { day: "Mon", state: "partial"  as DayState },
      { day: "Tue", state: "complete" as DayState },
      { day: "Wed", state: "missed"   as DayState },
      { day: "Thu", state: "partial"  as DayState },
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
      { day: "Wed", state: "partial"  as DayState },
      { day: "Thu", state: "complete" as DayState },
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
      { day: "Tue", state: "partial"  as DayState },
      { day: "Wed", state: "complete" as DayState },
      { day: "Thu", state: "missed"   as DayState },
      { day: "Mon", state: "missed"   as DayState },
      { day: "Tue", state: "missed"   as DayState },
      { day: "Wed", state: "partial"  as DayState },
      { day: "Thu", state: "complete" as DayState },
      { day: "Fri", state: "partial"  as DayState },
    ],
  },
];

function getOverallProgress(): number {
  let score = 0;
  let total = 0;
  GOAL_MATCH_DATA.forEach(g =>
    g.days.forEach(d => {
      total++;
      if (d.state === "complete") score += 1;
      else if (d.state === "partial") score += 0.5;
    })
  );
  return total > 0 ? score / total : 0.5;
}

// Deterministic calendar states for May 2026
function getCalDay(d: number): DayState[] {
  const s = d * 13;
  return [
    (s + 1) % 4 === 0 ? "missed"   : (s + 1) % 7 === 0 ? "partial" : "complete",
    (s + 3) % 5 === 0 ? "missed"   : (s + 3) % 9 === 0 ? "partial" : "complete",
    (s + 7) % 3 === 0 ? "missed"   : (s + 7) % 6 === 0 ? "partial" : "complete",
  ];
}

// May 2026: 31 days, starts Friday (Mon-first index 4)
const MAY_START = 4;
const MAY_DAYS  = 31;
const TODAY_DAY = 31;

// ─── Character SVG ───────────────────────────────────────────────────────────

function CharacterSvg({ mood }: { mood: "happy" | "neutral" | "tired" }) {
  const body    = "#111111";
  const head    = "#ede5d8";
  const accent  = "#222222";
  const hilite  = "rgba(255,255,255,0.22)";

  // Arms rotate around shoulder pivots
  // left pivot (26, 90): +55 = raises arm up, -45 = droops down
  // right pivot (84, 90): -55 = raises arm up, +45 = droops down
  const leftRot  = mood === "happy" ? 55  : mood === "tired" ? -45 : 0;
  const rightRot = mood === "happy" ? -55 : mood === "tired" ? 45  : 0;

  return (
    <Svg width={110} height={160} viewBox="0 0 110 160">
      {/* Ground shadow */}
      <Ellipse cx={55} cy={157} rx={26} ry={4.5} fill="rgba(0,0,0,0.07)" />

      {/* Legs */}
      <Rect x={33} y={122} width={16} height={32} rx={6} fill={body} />
      <Rect x={61} y={122} width={16} height={32} rx={6} fill={body} />

      {/* Body */}
      <Rect x={26} y={66} width={58} height={60} rx={14} fill={body} />

      {/* Chest panel */}
      <Rect x={38} y={80} width={34} height={16} rx={7} fill={accent} />
      <Circle cx={48} cy={88} r={3} fill={hilite} />
      <Circle cx={62} cy={88} r={3} fill={hilite} />

      {/* Left arm — rotate(angle, pivotX, pivotY) using SVG transform string */}
      <G transform={`rotate(${leftRot}, 26, 90)`}>
        <Rect x={2} y={85} width={26} height={10} rx={5} fill={body} />
      </G>

      {/* Right arm */}
      <G transform={`rotate(${rightRot}, 84, 90)`}>
        <Rect x={82} y={85} width={26} height={10} rx={5} fill={body} />
      </G>

      {/* Neck */}
      <Rect x={49} y={57} width={12} height={12} rx={5} fill={body} />

      {/* Head */}
      <Circle cx={55} cy={38} r={26} fill={head} />

      {/* 3-D highlight on head */}
      <Ellipse cx={47} cy={29} rx={9} ry={7} fill="rgba(255,255,255,0.52)" />

      {/* Antenna */}
      <Rect x={52} y={5}  width={6}  height={14} rx={3} fill={body} />
      <Circle cx={55} cy={5} r={5} fill={body} />
      <Circle cx={55} cy={5} r={2} fill="#fff" opacity={0.45} />

      {/* Eyes */}
      <Circle cx={45} cy={37} r={5}   fill={body} />
      <Circle cx={65} cy={37} r={5}   fill={body} />
      <Circle cx={46.5} cy={35} r={1.8} fill="#fff" />
      <Circle cx={66.5} cy={35} r={1.8} fill="#fff" />

      {/* Eyebrows */}
      {mood === "happy" && (
        <>
          <Path d="M39 26 Q45 22 51 24" stroke={body} strokeWidth={2} fill="none" strokeLinecap="round" />
          <Path d="M59 24 Q65 22 71 26" stroke={body} strokeWidth={2} fill="none" strokeLinecap="round" />
        </>
      )}
      {mood === "neutral" && (
        <>
          <Path d="M40 25 L51 25" stroke={body} strokeWidth={2} fill="none" strokeLinecap="round" />
          <Path d="M59 25 L70 25" stroke={body} strokeWidth={2} fill="none" strokeLinecap="round" />
        </>
      )}
      {mood === "tired" && (
        <>
          <Path d="M39 24 Q45 27 51 26" stroke={body} strokeWidth={2} fill="none" strokeLinecap="round" />
          <Path d="M59 26 Q65 27 71 24" stroke={body} strokeWidth={2} fill="none" strokeLinecap="round" />
        </>
      )}

      {/* Mouth */}
      {mood === "happy"   && <Path d="M44 48 Q55 58 66 48" stroke={body} strokeWidth={2.5} fill="none" strokeLinecap="round" />}
      {mood === "neutral" && <Path d="M46 49 L64 49"       stroke={body} strokeWidth={2.5} fill="none" strokeLinecap="round" />}
      {mood === "tired"   && <Path d="M46 52 Q55 47 64 52" stroke={body} strokeWidth={2.5} fill="none" strokeLinecap="round" />}

      {/* Happy cheeks */}
      {mood === "happy" && (
        <>
          <Circle cx={39} cy={45} r={6}   fill="rgba(255,140,140,0.2)" />
          <Circle cx={71} cy={45} r={6}   fill="rgba(255,140,140,0.2)" />
        </>
      )}

      {/* Tired under-eye shadows */}
      {mood === "tired" && (
        <>
          <Ellipse cx={45} cy={43} rx={5} ry={2.5} fill="rgba(80,80,80,0.12)" />
          <Ellipse cx={65} cy={43} rx={5} ry={2.5} fill="rgba(80,80,80,0.12)" />
        </>
      )}
    </Svg>
  );
}

// ─── Progress Character section ──────────────────────────────────────────────

function ProgressCharacter({ progress }: { progress: number }) {
  const colors  = useColors();
  const rotateY = useSharedValue(0);

  const mood: "happy" | "neutral" | "tired" =
    progress > 0.65 ? "happy" : progress > 0.35 ? "neutral" : "tired";

  const charStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${rotateY.value}deg` },
    ],
  }));

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 6,
      onPanResponderGrant: () => { Haptics.selectionAsync(); },
      onPanResponderMove: (_, g) => {
        rotateY.value = g.dx * 0.5;
      },
      onPanResponderRelease: (_, g) => {
        rotateY.value = withSpring(0, { damping: 4, stiffness: 18, velocity: g.vx * 1000 });
      },
    })
  ).current;

  const pct       = Math.round(progress * 100);
  const moodColor = mood === "happy" ? "#16a34a" : mood === "neutral" ? "#737373" : "#dc2626";
  const moodLabel = mood === "happy" ? "Energetic"   : mood === "neutral" ? "Steady"      : "Needs Focus";

  return (
    <View style={styles.charSection} {...pan.panHandlers}>
      <Animated.View style={charStyle}>
        <CharacterSvg mood={mood} />
      </Animated.View>
      <View style={styles.charInfo}>
        <Text style={[styles.charPct, { color: colors.onSurface }]}>{pct}%</Text>
        <Text style={[styles.charSub, { color: colors.outline }]}>goal completion</Text>
        <View style={[styles.moodChip, { backgroundColor: moodColor + "18" }]}>
          <View style={[styles.moodDot, { backgroundColor: moodColor }]} />
          <Text style={[styles.moodTxt, { color: moodColor }]}>{moodLabel}</Text>
        </View>
        <Text style={[styles.charHint, { color: colors.outlineVariant }]}>{"← swipe to spin →"}</Text>
      </View>
    </View>
  );
}

// ─── Calendar Modal ───────────────────────────────────────────────────────────

function CalDot({ state }: { state: DayState }) {
  const bg = state === "complete" ? "#16a34a" : state === "missed" ? "#dc2626" : "#c0c0c0";
  return <View style={[styles.calDot, { backgroundColor: bg }]} />;
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

  // Build the May 2026 calendar grid (Mon-first, starts Friday = index 4)
  const cells: (number | null)[] = [];
  for (let i = 0; i < MAY_START; i++) cells.push(null);
  for (let d = 1; d <= MAY_DAYS; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const DAY_HDRS = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.calOuter}>
        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
        />
        <Animated.View
          style={[styles.calSheet, { backgroundColor: colors.card }, sheetStyle]}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={styles.calHeader}>
            <Text style={[styles.calTitle, { color: colors.onSurface }]}>May 2026</Text>
            <TouchableOpacity onPress={onClose} hitSlop={14}>
              <MaterialIcons name="close" size={20} color={colors.outline} />
            </TouchableOpacity>
          </View>

          {/* Legend */}
          <View style={styles.calLegend}>
            {GOAL_MATCH_DATA.map((g, i) => (
              <View key={i} style={styles.calLegendRow}>
                <View style={[styles.calDot, { backgroundColor: ["#16a34a", "#3b82f6", "#f59e0b"][i] || "#16a34a" }]} />
                <Text style={[styles.calLegendTxt, { color: colors.outline }]}>{g.name}</Text>
              </View>
            ))}
          </View>

          {/* Weekday headers */}
          <View style={styles.calDayHdrs}>
            {DAY_HDRS.map((l, i) => (
              <Text key={i} style={[styles.calDayHdr, { color: colors.outline }]}>{l}</Text>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.calGrid}>
              {cells.map((day, idx) => {
                if (!day) return <View key={idx} style={styles.calCell} />;
                const states    = day <= TODAY_DAY ? getCalDay(day) : null;
                const isToday   = day === TODAY_DAY;
                const isFuture  = day > TODAY_DAY;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.calCell,
                      isToday && { backgroundColor: colors.surfaceContainerHigh, borderRadius: 10 },
                    ]}
                  >
                    <Text style={[
                      styles.calDayNum,
                      { color: isFuture ? colors.outlineVariant : isToday ? colors.primary : colors.onSurface },
                    ]}>
                      {day}
                    </Text>
                    {states && (
                      <View style={styles.calDots}>
                        {states.map((s, si) => <CalDot key={si} state={s} />)}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
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

// ─── Day dot ─────────────────────────────────────────────────────────────────

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

// ─── Swipeable day row ────────────────────────────────────────────────────────

function SwipeableDayRow({
  days,
  goalIndex,
}: {
  days: typeof GOAL_MATCH_DATA[0]["days"];
  goalIndex: number;
}) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);

  // Scroll to the most-recent 5 days on mount (initial offset)
  const initX = useMemo(() => Math.max(0, (days.length - 5) * DOT_ITEM_W), [days.length]);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initX, animated: false });
    }, 80);
    return () => clearTimeout(t);
  }, [initX]);

  return (
    <View style={[styles.dayRowPill, { backgroundColor: colors.surfaceContainerHigh + "55" }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={DOT_ITEM_W}
        decelerationRate="fast"
        contentContainerStyle={{ flexDirection: "row" }}
      >
        {days.map((d, i) => (
          <View key={i} style={{ width: DOT_ITEM_W }}>
            <DayDot state={d.state} dayLabel={d.day} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Goal match tracker ───────────────────────────────────────────────────────

function GoalMatchTracker({
  goal,
  goalIndex,
  onOpenCalendar,
}: {
  goal: typeof GOAL_MATCH_DATA[0];
  goalIndex: number;
  onOpenCalendar: () => void;
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
      <TouchableOpacity
        onPress={onOpenCalendar}
        activeOpacity={0.7}
        style={styles.matchHeader}
      >
        <Text style={[styles.goalItemName, { color: colors.onSurface }]}>{goal.name}</Text>
        <View style={styles.matchHeaderRight}>
          <Text style={[styles.goalItemTime, { color: colors.outline }]}>{goal.time}</Text>
          <MaterialIcons name="event" size={13} color={colors.outlineVariant} />
        </View>
      </TouchableOpacity>
      <SwipeableDayRow days={goal.days} goalIndex={goalIndex} />
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

function PressableCard({ children, style, delay = 0 }: { children: React.ReactNode; style?: any; delay?: number }) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // Separate entering (layout animation) from transform to avoid Reanimated conflict
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
  const colors         = useColors();
  const insets         = useSafeAreaInsets();
  const topPad         = isWeb ? 67 : insets.top;
  const [showCal, setShowCal] = useState(false);
  const overallProgress = useMemo(() => getOverallProgress(), []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />

      <CalendarModal visible={showCal} onClose={() => setShowCal(false)} />

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
        {/* ── 3D Progress Character ── */}
        <PressableCard delay={0} style={[styles.characterCard, { backgroundColor: "#f4f4f6" }]}>
          <ProgressCharacter progress={overallProgress} />
        </PressableCard>

        {/* ── Stats grid ── */}
        <View style={styles.statsGrid}>
          <PressableCard delay={60} style={[styles.statCard, { backgroundColor: "#f7f9ff" }]}>
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

          <PressableCard delay={120} style={[styles.statCard, { backgroundColor: "#faf7ff" }]}>
            <Text style={[styles.statLabel, { color: colors.outline }]}>Doomscroll</Text>
            <CounterNumber target={68} delay={200} />
            <Text style={[styles.statSubLabel, { color: colors.secondary }]}>Better +4 pts</Text>
            <AnimatedProgressBar percent={0.68} delay={400} />
          </PressableCard>
        </View>

        {/* ── Goals Progress ── */}
        <PressableCard delay={180} style={[styles.card, { backgroundColor: "#f7fff9" }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.outline }]}>GOALS PROGRESS</Text>
            <TouchableOpacity onPress={() => setShowCal(true)} hitSlop={10}>
              <MaterialIcons name="event" size={18} color={colors.outline} />
            </TouchableOpacity>
          </View>
          <View style={styles.goalsList}>
            {GOAL_MATCH_DATA.map((goal, i) => (
              <GoalMatchTracker
                key={i}
                goal={goal}
                goalIndex={i}
                onOpenCalendar={() => setShowCal(true)}
              />
            ))}
          </View>
        </PressableCard>

        {/* ── Most Used Apps ── */}
        <PressableCard delay={240} style={[styles.card, { backgroundColor: "#fffcf5" }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.outline }]}>MOST USED APPS</Text>
            <MaterialIcons name="more-horiz" size={20} color={colors.outline} />
          </View>
          <View style={styles.appList}>
            {APPS.map((app, i) => <AppRow key={i} app={app} index={i} />)}
          </View>
        </PressableCard>

        {/* ── Weekly Focus ── */}
        <PressableCard delay={300} style={[styles.card, { backgroundColor: "#f8f8ff" }]}>
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

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    paddingHorizontal: 20, paddingBottom: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  headerLeft: { flex: 1 },
  headerGreeting: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  focusBadge: {
    alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, marginTop: 4,
  },
  focusBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center", marginLeft: 12,
  },

  // Scroll
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },

  // ── Character card ──
  characterCard: {
    borderRadius: 28, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 24, elevation: 2,
  },
  charSection: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", paddingVertical: 24, paddingHorizontal: 20, gap: 24,
  },
  charInfo: { flex: 1, gap: 6 },
  charPct:  { fontSize: 42, fontFamily: "Inter_700Bold", letterSpacing: -2 },
  charSub:  { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -4 },
  moodChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  moodDot:  { width: 7, height: 7, borderRadius: 3.5 },
  moodTxt:  { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  charHint: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 4 },

  // ── Stats grid ──
  statsGrid: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1, borderRadius: 28, padding: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 24, elevation: 2, gap: 6,
  },
  statLabel:      { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  statBigNumber:  { fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  statBadge: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, gap: 2,
  },
  statBadgeText:  { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statSubLabel:   { fontSize: 12, fontFamily: "Inter_500Medium" },
  miniBars:       { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 22, marginTop: 4 },
  miniBarVert:    { width: 10, borderRadius: 3 },
  progressTrack:  { height: 8, borderRadius: 4, overflow: "hidden", marginTop: 4 },
  progressFill:   { height: "100%", borderRadius: 4 },

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

  // ── Goals match tracker ──
  goalsList:       { gap: 0 },
  matchRow:        { paddingVertical: 14, gap: 10 },
  matchHeader:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  matchHeaderRight:{ flexDirection: "row", alignItems: "center", gap: 5 },
  goalItemName:    { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  goalItemTime:    { fontSize: 11, fontFamily: "Inter_400Regular" },

  // Swipeable day row
  dayRowPill: { borderRadius: 12, overflow: "hidden", paddingVertical: 6 },
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
    maxHeight: "80%",
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 14,
  },
  calHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  calTitle:     { fontSize: 18, fontFamily: "Inter_700Bold" },
  calLegend:    { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  calLegendRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  calLegendTxt: { fontSize: 10, fontFamily: "Inter_500Medium" },
  calDayHdrs:   { flexDirection: "row", marginBottom: 4 },
  calDayHdr:    { flex: 1, textAlign: "center", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  calGrid:      { flexDirection: "row", flexWrap: "wrap" },
  calCell:      { width: "14.285714%", alignItems: "center", paddingVertical: 6, gap: 3 },
  calDayNum:    { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  calDots:      { flexDirection: "row", gap: 2 },
  calDot:       { width: 5, height: 5, borderRadius: 2.5 },
});
