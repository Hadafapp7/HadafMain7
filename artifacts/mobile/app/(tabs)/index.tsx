import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import {
  type AppUsageSummaryItem,
  type Goal,
  useCreateAppUsageEntry,
  useGetAppUsageSummary,
  useGetMe,
  useGetUserSettings,
  useListGoals,
  useUpdateUserSettings,
} from "@workspace/api-client-react";

const isWeb    = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;
const CAL_W    = SCREEN_W * 0.92;
const CELL_W   = (CAL_W - 40) / 7;

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_HDRS = ["M","T","W","T","F","S","S"];

const TODAY_YEAR  = 2026;
const TODAY_MONTH = 4;
const TODAY_DAY   = 31;

type DayState = "complete" | "missed" | "partial";

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function getMonthStart(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}
function getDaysInMonth(year: number, month: number) {
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

// ─── Calendar Modal (kept from previous — accessible via Goals Progress) ──────

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
    setViewMonth((prev) => {
      const next = prev + dir;
      if (next < 0)  { setViewYear((y) => y - 1); return 11; }
      if (next > 11) { setViewYear((y) => y + 1); return 0;  }
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

  const startDay = getMonthStart(viewYear, viewMonth);
  const dayCount = getDaysInMonth(viewYear, viewMonth);
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
          <View style={styles.calNavRow}>
            <View style={styles.yearSelector}>
              <TouchableOpacity onPress={() => setViewYear((y) => y - 1)} hitSlop={12}>
                <MaterialIcons name="keyboard-arrow-up"   size={18} color={colors.outline} />
              </TouchableOpacity>
              <Text style={[styles.calYearTxt, { color: colors.onSurface }]}>{viewYear}</Text>
              <TouchableOpacity onPress={() => setViewYear((y) => y + 1)} hitSlop={12}>
                <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.outline} />
              </TouchableOpacity>
            </View>
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={() => navigate(-1)} hitSlop={12}>
                <MaterialIcons name="chevron-left"  size={26} color={colors.onSurface} />
              </TouchableOpacity>
              <Text style={[styles.calMonthTxt, { color: colors.onSurface }]}>{MONTH_NAMES[viewMonth]}</Text>
              <TouchableOpacity onPress={() => navigate(1)} hitSlop={12}>
                <MaterialIcons name="chevron-right" size={26} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={14}>
              <MaterialIcons name="close" size={20} color={colors.outline} />
            </TouchableOpacity>
          </View>

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

          <View style={styles.calDayHdrs}>
            {DAY_HDRS.map((l, i) => (
              <Text key={i} style={[styles.calDayHdr, { color: colors.outline, width: CELL_W }]}>{l}</Text>
            ))}
          </View>

          <View style={{ overflow: "hidden" }}>
            <Animated.View style={[styles.calGrid, gridStyle]}>
              {cells.map((day, idx) => {
                if (!day) return <View key={idx} style={[styles.calCell, { width: CELL_W }]} />;
                const dot      = getDotState(viewYear, viewMonth, day);
                const isToday  = viewYear === TODAY_YEAR && viewMonth === TODAY_MONTH && day === TODAY_DAY;
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
                      { color: isFuture ? "#ccc" : colors.onSurface },
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

// ─── Animated progress bar ────────────────────────────────────────────────────

function AnimatedProgressBar({ percent, delay = 0, trackColor, fillColor, height = 5, radius = 3 }: {
  percent: number; delay?: number; trackColor?: string; fillColor?: string; height?: number; radius?: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withSpring(percent, { damping: 20, stiffness: 90 }));
  }, []);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as any }));
  return (
    <View style={[styles.progressTrack, { backgroundColor: trackColor ?? "#e8e8e8", height, borderRadius: radius }]}>
      <Animated.View style={[{ height: "100%", borderRadius: radius, backgroundColor: fillColor ?? "#222" }, barStyle]} />
    </View>
  );
}

// ─── Counter number ───────────────────────────────────────────────────────────

function CounterNumber({ target, delay = 0, style: textStyle }: { target: number; delay?: number; style?: any }) {
  const count = useSharedValue(isWeb ? target : 0);
  const [display, setDisplay] = useState(isWeb ? target : 0);
  useAnimatedReaction(
    () => Math.round(count.value),
    (cur, prev) => { if (cur !== prev) runOnJS(setDisplay)(cur); }
  );
  useEffect(() => {
    if (!isWeb) count.value = withDelay(delay, withTiming(target, { duration: 1000 }));
  }, []);
  return <Text style={textStyle}>{display}</Text>;
}

// ─── App row ──────────────────────────────────────────────────────────────────

function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const APP_ICONS: Record<string, React.ComponentProps<typeof MaterialIcons>["name"]> = {
  social: "photo-camera",
  entertainment: "music-video",
};

function AppRow({ app, index, last, maxMinutes }: {
  app: AppUsageSummaryItem; index: number; last: boolean; maxMinutes: number;
}) {
  const percent  = maxMinutes > 0 ? Math.min(1, app.totalMinutes / maxMinutes) : 0;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(400 + index * 120, withSpring(percent, { damping: 20 }));
  }, [percent]);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as any }));
  const icon = APP_ICONS[(app.category ?? "").toLowerCase()] ?? "apps";
  return (
    <View>
      <View style={styles.appRow}>
        <View style={styles.appIconWrap}>
          <MaterialIcons name={icon} size={20} color="#fff" />
        </View>
        <View style={styles.appInfo}>
          <Text style={styles.appName}>{app.appName}</Text>
          <Text style={styles.appCategory}>{(app.category ?? "OTHER").toUpperCase()}</Text>
        </View>
        <View style={styles.appRight}>
          <Text style={styles.appTime}>{formatDuration(app.totalMinutes)}</Text>
          <View style={styles.appBarTrack}>
            <Animated.View style={[styles.appBarFill, barStyle]} />
          </View>
        </View>
      </View>
      {!last && <View style={styles.appDivider} />}
    </View>
  );
}

// ─── Log Usage Modal ──────────────────────────────────────────────────────────

function LogUsageModal({ visible, onClose, onSubmit, submitting }: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (appName: string, category: string, minutes: number) => void;
  submitting: boolean;
}) {
  const [appName, setAppName]   = useState("");
  const [category, setCategory] = useState("");
  const [minutes, setMinutes]   = useState("");

  const scale   = useSharedValue(0.88);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      scale.value   = withSpring(1,    { damping: 18, stiffness: 160 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      scale.value   = withSpring(0.88, { damping: 18, stiffness: 160 });
      opacity.value = withTiming(0,  { duration: 140 });
      setAppName(""); setCategory(""); setMinutes("");
    }
  }, [visible]);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  if (!visible) return null;

  const parsedMinutes = parseInt(minutes, 10);
  const canSubmit = appName.trim().length > 0 && Number.isFinite(parsedMinutes) && parsedMinutes > 0;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.calOuter} activeOpacity={1} onPress={onClose}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <Animated.View
          style={[styles.goalsSheet, cardStyle]}
          onStartShouldSetResponder={() => true}
          onTouchEnd={e => e.stopPropagation()}
        >
          <View style={styles.goalsSheetHeader}>
            <Text style={styles.goalsSheetTitle}>LOG APP USAGE</Text>
            <TouchableOpacity onPress={onClose} hitSlop={14}>
              <MaterialIcons name="close" size={20} color="#777" />
            </TouchableOpacity>
          </View>
          <Text style={styles.goalsSheetSub}>
            Manually add screen time for an app since we can't read device usage automatically yet.
          </Text>

          <View style={{ gap: 12, marginTop: 14 }}>
            <TextInput
              style={styles.logInput}
              placeholder="App name (e.g. Instagram)"
              placeholderTextColor="#b0b0b0"
              value={appName}
              onChangeText={setAppName}
              returnKeyType="next"
            />
            <TextInput
              style={styles.logInput}
              placeholder="Category (optional, e.g. social)"
              placeholderTextColor="#b0b0b0"
              value={category}
              onChangeText={setCategory}
              returnKeyType="next"
            />
            <TextInput
              style={styles.logInput}
              placeholder="Minutes used"
              placeholderTextColor="#b0b0b0"
              value={minutes}
              onChangeText={(t) => setMinutes(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              returnKeyType="done"
            />
          </View>

          <TouchableOpacity
            style={[styles.logSubmitBtn, !canSubmit && { opacity: 0.4 }]}
            disabled={!canSubmit || submitting}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onSubmit(appName.trim(), category.trim(), parsedMinutes);
            }}
          >
            <Text style={styles.logSubmitBtnText}>{submitting ? "SAVING…" : "SAVE"}</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Usage Tracking Opt-In Modal ──────────────────────────────────────────────

function UsageOptInModal({ visible, onClose, onEnable, enabling }: {
  visible: boolean; onClose: () => void; onEnable: () => void; enabling: boolean;
}) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.calOuter} activeOpacity={1} onPress={onClose}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.optInCard} onStartShouldSetResponder={() => true} onTouchEnd={e => e.stopPropagation()}>
          <View style={styles.optInIcon}>
            <MaterialIcons name="privacy-tip" size={26} color="#222" />
          </View>
          <Text style={styles.optInTitle}>Enable Usage Tracking</Text>
          <Text style={styles.optInSub}>
            To log app usage, turn on usage tracking. You can disable it anytime in Privacy & Security settings.
          </Text>
          <TouchableOpacity style={styles.logSubmitBtn} activeOpacity={0.85} onPress={onEnable} disabled={enabling}>
            <Text style={styles.logSubmitBtnText}>{enabling ? "ENABLING…" : "ENABLE & CONTINUE"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 12 }}>
            <Text style={styles.optInCancel}>Not now</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Goals Status Modal ───────────────────────────────────────────────────────

function GoalsStatusModal({ visible, onClose, goals }: {
  visible: boolean; onClose: () => void; goals: Goal[];
}) {
  const scale   = useSharedValue(0.88);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      scale.value   = withSpring(1,    { damping: 18, stiffness: 160 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      scale.value   = withSpring(0.88, { damping: 18, stiffness: 160 });
      opacity.value = withTiming(0,  { duration: 140 });
    }
  }, [visible]);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  if (!visible) return null;

  const done    = goals.filter(g => g.status === "done").length;
  const total   = goals.length;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.calOuter} activeOpacity={1} onPress={onClose}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <Animated.View
          style={[styles.goalsSheet, cardStyle]}
          onStartShouldSetResponder={() => true}
          onTouchEnd={e => e.stopPropagation()}
        >
          <View style={styles.goalsSheetHeader}>
            <Text style={styles.goalsSheetTitle}>DAILY GOALS</Text>
            <TouchableOpacity onPress={onClose} hitSlop={14}>
              <MaterialIcons name="close" size={20} color="#777" />
            </TouchableOpacity>
          </View>
          <Text style={styles.goalsSheetSub}>
            {done} of {total} completed today
          </Text>
          <View style={styles.goalsList}>
            {total === 0 && (
              <Text style={[styles.goalsListName, { color: "#999", paddingVertical: 12 }]}>
                No goals yet — add one from the Goals tab.
              </Text>
            )}
            {goals.map((g, i) => (
              <View key={g.id} style={[styles.goalsListRow, i < goals.length - 1 && styles.goalsListDivider]}>
                <View style={[styles.goalsListDot, { backgroundColor: g.status === "done" ? "#16a34a" : "#e5e7eb" }]}>
                  {g.status === "done" && <MaterialIcons name="check" size={12} color="#fff" />}
                </View>
                <Text style={[styles.goalsListName, { color: g.status === "done" ? "#111" : "#555" }]}>{g.title}</Text>
                <Text style={[styles.goalsListStatus, { color: g.status === "done" ? "#16a34a" : "#aaa" }]}>
                  {g.status === "done" ? "Done" : "Pending"}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Oval accent card (Daily Tasks / Mood Check / Streaks) ────────────────────

function OvalCard({ bg, iconColor, icon, label1, label2, badgeText, badgeBg, onPress }: {
  bg: string; iconColor: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label1: string; label2?: string;
  badgeText?: string; badgeBg?: string;
  onPress?: () => void;
}) {
  const scale      = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View
      style={[styles.ovalCard, { backgroundColor: bg }, pressStyle]}
      onTouchStart={() => { scale.value = withSpring(0.94, { damping: 12 }); }}
      onTouchEnd={() => {
        scale.value = withSpring(1, { damping: 12 });
        onPress?.();
      }}
      onTouchCancel={() => { scale.value = withSpring(1, { damping: 12 }); }}
    >
      <MaterialIcons name={icon} size={30} color={iconColor} />
      <Text style={[styles.ovalLabel, { color: iconColor }]}>{label1}</Text>
      {label2 ? <Text style={[styles.ovalLabel, { color: iconColor }]}>{label2}</Text> : null}
      {badgeText ? (
        <View style={[styles.ovalBadge, { backgroundColor: badgeBg ?? iconColor }]}>
          <Text style={styles.ovalBadgeText}>{badgeText}</Text>
        </View>
      ) : (
        <Text style={[styles.ovalEmpty, { color: iconColor }]}>EMPTY</Text>
      )}
    </Animated.View>
  );
}

// ─── Home screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 24 : insets.top;
  const [showCal,   setShowCal]   = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [showLogUsage, setShowLogUsage] = useState(false);
  const [showOptIn, setShowOptIn] = useState(false);

  const { data: me } = useGetMe();
  const { data: goals = [] } = useListGoals();
  const { data: appUsage = [], refetch: refetchAppUsage } = useGetAppUsageSummary();
  const { data: settings } = useGetUserSettings();
  const updateSettings = useUpdateUserSettings();
  const createUsageEntry = useCreateAppUsageEntry();

  const handleOpenLogUsage = () => {
    Haptics.selectionAsync();
    if (settings && !settings.usageTrackingOptIn) {
      setShowOptIn(true);
    } else {
      setShowLogUsage(true);
    }
  };

  const handleEnableTracking = () => {
    updateSettings.mutate(
      { data: { usageTrackingOptIn: true } },
      { onSuccess: () => { setShowOptIn(false); setShowLogUsage(true); } }
    );
  };

  const handleLogUsage = (appName: string, category: string, minutes: number) => {
    createUsageEntry.mutate(
      { data: { appName, category: category || undefined, durationMinutes: minutes } },
      { onSuccess: () => { refetchAppUsage(); setShowLogUsage(false); } }
    );
  };

  const firstName = (me?.name ?? me?.email ?? "there").split(" ")[0].split("@")[0];
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  const pendingGoals = goals.filter(g => g.status === "pending").length;
  const totalScreenMinutes = appUsage.reduce((sum, a) => sum + a.totalMinutes, 0);
  const maxAppMinutes = Math.max(1, ...appUsage.map(a => a.totalMinutes));
  const topApps = [...appUsage].sort((a, b) => b.totalMinutes - a.totalMinutes).slice(0, 4);

  return (
    <View style={[styles.root, { backgroundColor: "#f5f5f5" }]}>
      <AnimatedBackground />
      <CalendarModal visible={showCal} onClose={() => setShowCal(false)} />
      <GoalsStatusModal visible={showGoals} onClose={() => setShowGoals(false)} goals={goals} />
      <LogUsageModal
        visible={showLogUsage}
        onClose={() => setShowLogUsage(false)}
        onSubmit={handleLogUsage}
        submitting={createUsageEntry.isPending}
      />
      <UsageOptInModal
        visible={showOptIn}
        onClose={() => setShowOptIn(false)}
        onEnable={handleEnableTracking}
        enabling={updateSettings.isPending}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 20, paddingBottom: isWeb ? 34 + 84 : 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Header ── */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(0).springify()}
          style={styles.headerRow}
        >
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>Good {timeOfDay}, {firstName} 👋</Text>
            <Text style={styles.focusStatus}>FOCUS MODE: OFF</Text>
          </View>
          <TouchableOpacity style={styles.avatar} activeOpacity={0.8}>
            <MaterialIcons name="person" size={28} color="#fff" />
          </TouchableOpacity>
        </Animated.View>

        {/* ── Two stat cards ── */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(60).springify()}
          style={styles.statRow}
        >
          {/* Screen Time */}
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>SCREEN TIME</Text>
            <Text style={styles.statNumber}>{formatDuration(totalScreenMinutes)}</Text>
            <View style={styles.statCardBottom}>
              <View style={styles.statBadge}>
                <MaterialIcons name="apps" size={11} color="rgba(255,255,255,0.7)" />
                <Text style={styles.statBadgeText}> {appUsage.length} apps</Text>
              </View>
              <View style={styles.sparkBars}>
                <View style={[styles.sparkBar, { height: 14, backgroundColor: "rgba(255,255,255,0.3)" }]} />
                <View style={[styles.sparkBar, { height: 24, backgroundColor: "#fff" }]} />
              </View>
            </View>
          </View>

          {/* DoomScore */}
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>DOOMSCORE</Text>
            <CounterNumber
              target={68}
              delay={200}
              style={styles.statNumber}
            />
            <View style={styles.doomRow}>
              <Text style={styles.doomBetter}>BETTER</Text>
              <Text style={styles.doomPts}>+4 PTS</Text>
            </View>
            <AnimatedProgressBar
              percent={0.68}
              delay={350}
              height={5}
              radius={3}
              trackColor="rgba(255,255,255,0.2)"
              fillColor="#fff"
            />
          </View>
        </Animated.View>

        {/* ── Most Used Apps ── */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(120).springify()}
          style={styles.appsCard}
        >
          <View style={styles.appsHeader}>
            <Text style={styles.appsHeaderLabel}>MOST USED APPS</Text>
            <TouchableOpacity onPress={handleOpenLogUsage} hitSlop={10} style={styles.appsHeaderAddBtn}>
              <MaterialIcons name="add" size={16} color="#333" />
            </TouchableOpacity>
          </View>
          {topApps.length === 0 && (
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#999", paddingVertical: 8 }}>
              No usage logged yet.
            </Text>
          )}
          {topApps.map((app, i) => (
            <AppRow key={app.appName} app={app} index={i} last={i === topApps.length - 1} maxMinutes={maxAppMinutes} />
          ))}
        </Animated.View>

        {/* ── Three oval accent cards ── */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(180).springify()}
          style={styles.ovalRow}
        >
          <OvalCard
            bg="#e8f5e9"
            iconColor="#2e7d32"
            icon="checklist"
            label1="DAILY"
            label2="GOALS"
            badgeText={goals.length === 0 ? undefined : `${pendingGoals} LEFT`}
            badgeBg="#2e7d32"
            onPress={() => setShowGoals(true)}
          />
          <OvalCard
            bg="#fff3e0"
            iconColor="#d84315"
            icon="self-improvement"
            label1="MOOD"
            label2="CHECK"
          />
          <OvalCard
            bg="#fff3e0"
            iconColor="#d84315"
            icon="local-fire-department"
            label1="STREAKS"
            badgeText="7 DAYS"
            badgeBg="#d84315"
          />
        </Animated.View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 16 },

  // Header
  headerRow:   { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  headerLeft:  { flex: 1, gap: 4 },
  greeting:    { fontSize: 26, fontFamily: "Inter_700Bold", color: "#111", letterSpacing: -0.3 },
  focusStatus: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#888", letterSpacing: 1.5 },
  avatar:      { width: 50, height: 50, borderRadius: 25, backgroundColor: "#333", alignItems: "center", justifyContent: "center" },

  // Stat cards (side by side)
  statRow: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: "#000",
    borderRadius: 22,
    padding: 20,
    paddingBottom: 22,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6,
  },
  statLabel:  { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.55)", letterSpacing: 1.4 },
  statNumber: { fontSize: 34, fontFamily: "Inter_700Bold",    color: "#fff", letterSpacing: -1 },

  // Screen Time card bottom row
  statCardBottom: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  statBadge:      { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.14)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statBadgeText:  { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
  sparkBars:      { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  sparkBar:       { width: 5, borderRadius: 3 },

  // DoomScore card
  doomRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  doomBetter: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.6)", letterSpacing: 1 },
  doomPts:    { fontSize: 10, fontFamily: "Inter_700Bold",    color: "#fff", letterSpacing: 0.5 },
  progressTrack: { overflow: "hidden" },

  // Most Used Apps card
  appsCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
    gap: 0,
  },
  appsHeader:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  appsHeaderLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 1.4 },
  appsHeaderDots:  { fontSize: 18, color: "#aaa", letterSpacing: 2, lineHeight: 20 },
  appsHeaderAddBtn:{ width: 26, height: 26, borderRadius: 13, backgroundColor: "#f0f0f0", alignItems: "center", justifyContent: "center" },

  appRow:      { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  appIconWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#2a2a2a", alignItems: "center", justifyContent: "center" },
  appInfo:     { flex: 1, gap: 2 },
  appName:     { fontSize: 14, fontFamily: "Inter_700Bold", color: "#111" },
  appCategory: { fontSize: 10, fontFamily: "Inter_500Medium", color: "#888", letterSpacing: 0.8 },
  appRight:    { alignItems: "flex-end", gap: 5 },
  appTime:     { fontSize: 14, fontFamily: "Inter_700Bold", color: "#111" },
  appBarTrack: { width: 64, height: 4, borderRadius: 2, backgroundColor: "#ececec", overflow: "hidden" },
  appBarFill:  { height: "100%", borderRadius: 2, backgroundColor: "#222" },
  appDivider:  { height: 1, backgroundColor: "#f0f0f0" },

  // Oval accent cards
  ovalRow: { flexDirection: "row", gap: 10 },
  ovalCard: {
    flex: 1,
    borderRadius: 60,
    paddingVertical: 28,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 8,
  },
  ovalLabel:     { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2, textAlign: "center" },
  ovalEmpty:     { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  ovalBadge:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  ovalBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },

  // Goals Status Modal
  goalsSheet: {
    width: SCREEN_W * 0.9,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 16,
  },
  goalsSheetHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  goalsSheetTitle:   { fontSize: 18, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 1 },
  goalsSheetSub:     { fontSize: 13, fontFamily: "Inter_400Regular", color: "#888", marginBottom: 18 },
  goalsList:         { gap: 0 },
  goalsListRow:      { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  goalsListDivider:  { borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  goalsListDot:      { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  goalsListName:     { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  goalsListStatus:   { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Log usage modal
  logInput: {
    backgroundColor: "#f0f0f0",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#000",
  },
  logSubmitBtn: {
    marginTop: 18,
    backgroundColor: "#000",
    borderRadius: 999,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  logSubmitBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1.5 },

  // Usage opt-in modal
  optInCard: {
    width: SCREEN_W * 0.86,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 26,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 16,
  },
  optInIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#f0f0f0", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  optInTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#000", textAlign: "center", marginBottom: 8 },
  optInSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#888", textAlign: "center", lineHeight: 19 },
  optInCancel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#999" },

  // Calendar modal
  calOuter: { flex: 1, alignItems: "center", justifyContent: "center" },
  calSheet: {
    width: CAL_W, borderRadius: 24, padding: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2, shadowRadius: 32, elevation: 16,
  },
  calNavRow:   { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 6 },
  yearSelector:{ flexDirection: "column", alignItems: "center", gap: 1, marginRight: 4 },
  calYearTxt:  { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  monthNav:    { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  calMonthTxt: { fontSize: 17, fontFamily: "Inter_700Bold", minWidth: 110, textAlign: "center" },
  calLegend:   { flexDirection: "row", gap: 16, marginBottom: 10 },
  calLegendItem:{ flexDirection: "row", alignItems: "center", gap: 5 },
  calLegendTxt: { fontSize: 11 },
  calDot:      { width: 8, height: 8, borderRadius: 4 },
  calDayHdrs:  { flexDirection: "row", marginBottom: 6 },
  calDayHdr:   { textAlign: "center", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  calGrid:     { flexDirection: "row", flexWrap: "wrap" },
  calCell:     { alignItems: "center", paddingVertical: 6, gap: 3 },
  calDayNum:   { fontSize: 13, fontFamily: "Inter_400Regular" },
});
