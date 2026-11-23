import AsyncStorage from "@react-native-async-storage/async-storage";
import AiCoachWidget from "@/components/AiCoachWidget";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  AppState,
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle as SvgCircle, Path as SvgPath, Rect as SvgRect } from "react-native-svg";
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
import { HadafInlineLoader } from "@/components/AppLoadingScreen";
import { useColors } from "@/hooks/useColors";
import { isSocialOrGameApp, localDayKey } from "@/lib/usageStats";
import {
  type AppUsageSummaryItem,
  type FocusSession,
  type Goal,
  useCreateAppUsageEntry,
  useGetAppUsageSummary,
  useGetMe,
  useGetUserSettings,
  useListAppUsageEntries,
  useListFocusSessions,
  useListGoals,
  useUpdateUserSettings,
} from "@workspace/api-client-react";
import {
  type AppUsageStat,
  getDeviceUsageStats,
  hasUsagePermission,
  requestUsagePermission,
} from "../../modules/hadaf-native/src";

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

// ─── Streak helper ────────────────────────────────────────────────────────────

function computeStreak(sessions: FocusSession[]): number {
  const completedDays = new Set<string>();
  for (const s of sessions) {
    if (s.status === "completed") completedDays.add(s.startedAt.slice(0, 10));
  }
  let streak = 0;
  const checkDate = new Date();
  for (let i = 0; i < 366; i++) {
    const dateStr = checkDate.toISOString().slice(0, 10);
    if (completedDays.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (i === 0) {
      // today has no session yet — don't break streak, check yesterday
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

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

function AnimatedProgressBar({ percent, delay = 0, trackColor, fillColor, height = 5, radius = 3, animKey = 0 }: {
  percent: number; delay?: number; trackColor?: string; fillColor?: string; height?: number; radius?: number; animKey?: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(delay, withSpring(percent, { damping: 20, stiffness: 90 }));
  }, [percent, delay, animKey]);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as any }));
  return (
    <View style={[styles.progressTrack, { backgroundColor: trackColor ?? "#e8e8e8", height, borderRadius: radius }]}>
      <Animated.View style={[{ height: "100%", borderRadius: radius, backgroundColor: fillColor ?? "#222" }, barStyle]} />
    </View>
  );
}

// ─── Counter number & ScreenTime counter ──────────────────────────────────────

function CounterNumber({ target, delay = 0, style: textStyle, animKey = 0 }: { target: number; delay?: number; style?: any; animKey?: number }) {
  const count = useSharedValue(isWeb ? target : 0);
  const [display, setDisplay] = useState(isWeb ? target : 0);
  useAnimatedReaction(
    () => Math.round(count.value),
    (cur, prev) => { if (cur !== prev) runOnJS(setDisplay)(cur); }
  );
  useEffect(() => {
    if (!isWeb) {
      count.value = 0;
      setDisplay(0);
      count.value = withDelay(delay, withTiming(target, { duration: 950 }));
    } else {
      setDisplay(target);
    }
  }, [target, delay, animKey]);
  return <Text style={textStyle}>{display}</Text>;
}

function ScreenTimeCounter({ targetMinutes, delay = 0, style: textStyle, animKey = 0 }: { targetMinutes: number; delay?: number; style?: any; animKey?: number }) {
  const count = useSharedValue(isWeb ? targetMinutes : 0);
  const [displayMins, setDisplayMins] = useState(isWeb ? targetMinutes : 0);
  useAnimatedReaction(
    () => Math.round(count.value),
    (cur, prev) => { if (cur !== prev) runOnJS(setDisplayMins)(cur); }
  );
  useEffect(() => {
    if (!isWeb) {
      count.value = 0;
      setDisplayMins(0);
      count.value = withDelay(delay, withTiming(targetMinutes, { duration: 950 }));
    } else {
      setDisplayMins(targetMinutes);
    }
  }, [targetMinutes, delay, animKey]);
  return <Text style={textStyle}>{formatDuration(displayMins)}</Text>;
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
  entertainment: "play-circle-filled",
  games: "sports-esports",
  gaming: "sports-esports",
  browser: "public",
  productivity: "work",
  other: "apps",
};

function normalizeAppCategory(appName?: string | null, category?: string | null, pkg?: string | null): string {
  const n = (appName || "").trim().toLowerCase();
  const p = (pkg || "").trim().toLowerCase();
  if (
    n === "chrome" ||
    n === "brave" ||
    n === "firefox" ||
    n === "opera" ||
    n === "edge" ||
    n.includes("browser") ||
    p.includes("chrome") ||
    p.includes("brave") ||
    p.includes("firefox") ||
    p.includes("sbrowser") ||
    p.includes("browser")
  ) {
    return "Browser";
  }
  return category || "Other";
}

function isCallOrSystemNoise(appName?: string | null, pkg?: string | null): boolean {
  const n = (appName || "").trim().toLowerCase();
  const p = (pkg || "").trim().toLowerCase();
  return (
    n === "call" ||
    n === "phone" ||
    n === "incallui" ||
    n === "dialer" ||
    p.includes("incallui") ||
    p.includes("telephonyui") ||
    p.endsWith(".dialer") ||
    p.endsWith(".phone")
  );
}

const POPULAR_APPS: { name: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; category: string }[] = [
  { name: "Instagram", icon: "photo-camera",       category: "social"         },
  { name: "TikTok",    icon: "music-video",         category: "entertainment"  },
  { name: "YouTube",   icon: "play-circle-filled",  category: "entertainment"  },
  { name: "Twitter",   icon: "alternate-email",     category: "social"         },
  { name: "Reddit",    icon: "forum",               category: "social"         },
  { name: "Facebook",  icon: "people",              category: "social"         },
  { name: "Snapchat",  icon: "camera-alt",          category: "social"         },
  { name: "Netflix",   icon: "tv",                  category: "entertainment"  },
  { name: "Discord",   icon: "headset",             category: "social"         },
  { name: "Twitch",    icon: "videogame-asset",     category: "entertainment"  },
  { name: "WhatsApp",  icon: "chat",                category: "social"         },
  { name: "Spotify",   icon: "library-music",       category: "entertainment"  },
];

const QUICK_TIMES = [
  { label: "30m", mins: 30  },
  { label: "1h",  mins: 60  },
  { label: "2h",  mins: 120 },
  { label: "3h",  mins: 180 },
];

function AppRow({ app, index, last, maxMinutes, animKey = 0 }: {
  app: any; index: number; last: boolean; maxMinutes: number; animKey?: number;
}) {
  const percent  = maxMinutes > 0 ? Math.min(1, app.dailyMinutes / maxMinutes) : 0;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(280 + index * 110, withSpring(percent, { damping: 20 }));
  }, [percent, animKey]);
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
          <Text style={styles.appTime}>{formatDuration(app.dailyMinutes)}</Text>
          <Text style={{ fontSize: 10, color: "#888", marginTop: 1, fontFamily: "Inter_500Medium" }}>
            weekly avg: {formatDuration(app.weeklyAvgMinutes ?? Math.max(1, Math.round((app.totalMinutes || app.dailyMinutes) / 7)))}/d
          </Text>
          <View style={[styles.appBarTrack, { marginTop: 4 }]}>
            <Animated.View style={[styles.appBarFill, barStyle]} />
          </View>
        </View>
      </View>
      {!last && <View style={styles.appDivider} />}
    </View>
  );
}

// ─── Select Apps Modal ────────────────────────────────────────────────────────

function SelectAppsModal({ visible, onClose, onSubmit, submitting }: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (apps: { name: string; category: string; minutes: number }[]) => void;
  submitting: boolean;
}) {
  const [selected,   setSelected]   = useState<string[]>([]);
  const [minsPerApp, setMinsPerApp] = useState(60);

  useEffect(() => {
    if (!visible) { setSelected([]); setMinsPerApp(60); }
  }, [visible]);

  const toggle = (name: string) => {
    Haptics.selectionAsync();
    setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const handleSubmit = () => {
    if (selected.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSubmit(selected.map(name => {
      const app = POPULAR_APPS.find(a => a.name === name)!;
      return { name: app.name, category: app.category, minutes: minsPerApp };
    }));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.selectModalOuter}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.selectModalSheet}>
          <View style={styles.selectModalHandle} />

          <View style={styles.selectModalHeader}>
            <Text style={styles.selectModalTitle}>MOST USED APPS</Text>
            <TouchableOpacity onPress={onClose} hitSlop={14}>
              <MaterialIcons name="close" size={20} color="#777" />
            </TouchableOpacity>
          </View>
          <Text style={styles.selectModalSub}>
            Pick the apps you spend the most time on
          </Text>

          <View style={styles.timeRow}>
            <Text style={styles.timeRowLabel}>TIME PER APP</Text>
            <View style={styles.timeBtns}>
              {QUICK_TIMES.map(qt => (
                <TouchableOpacity
                  key={qt.mins}
                  style={[styles.timeBtn, minsPerApp === qt.mins && styles.timeBtnActive]}
                  onPress={() => { Haptics.selectionAsync(); setMinsPerApp(qt.mins); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.timeBtnText, minsPerApp === qt.mins && styles.timeBtnTextActive]}>
                    {qt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <ScrollView scrollEventThrottle={16} decelerationRate="normal"  style={styles.selectAppsList} showsVerticalScrollIndicator={false}>
            {POPULAR_APPS.map((app, i) => {
              const isSel = selected.includes(app.name);
              return (
                <TouchableOpacity
                  key={app.name}
                  style={[
                    styles.selectAppRow,
                    i < POPULAR_APPS.length - 1 && { borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
                  ]}
                  onPress={() => toggle(app.name)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.selectAppIcon, isSel && { backgroundColor: "#111" }]}>
                    <MaterialIcons name={app.icon} size={20} color={isSel ? "#fff" : "#555"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectAppName}>{app.name}</Text>
                    <Text style={styles.selectAppCat}>{app.category.toUpperCase()}</Text>
                  </View>
                  <View style={[styles.selectCheckbox, isSel && { backgroundColor: "#111", borderColor: "#111" }]}>
                    {isSel && <MaterialIcons name="check" size={14} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[styles.logSubmitBtn, selected.length === 0 && { opacity: 0.4 }]}
            disabled={selected.length === 0 || submitting}
            onPress={handleSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.logSubmitBtnText}>
              {submitting
                ? "SAVING…"
                : selected.length === 0
                  ? "SELECT APPS"
                  : `LOG ${selected.length} APP${selected.length > 1 ? "S" : ""}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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

// ─── Target DoomScore Modal (Point 9) ─────────────────────────────────────────

const DOOM_TARGET_STORAGE_KEY = "@hadaf/target_doom_score_v1";
const DOOM_PRESETS = [20, 30, 40, 50, 65];

function TargetDoomScoreModal({
  visible,
  currentTarget,
  currentDoomScore,
  onSave,
  onClose,
}: {
  visible: boolean;
  currentTarget: number | null;
  currentDoomScore: number;
  onSave: (target: number) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<number>(currentTarget ?? 30);

  useEffect(() => {
    if (visible) {
      setDraft(currentTarget ?? 30);
    }
  }, [visible, currentTarget]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.calOuter} activeOpacity={1} onPress={onClose}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        <View
          style={styles.doomModalCard}
          onStartShouldSetResponder={() => true}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <View style={styles.goalsSheetHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MaterialIcons name="speed" size={20} color="#000" />
              <Text style={styles.goalsSheetTitle}>TARGET DOOMSCORE</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={14}>
              <MaterialIcons name="close" size={20} color="#777" />
            </TouchableOpacity>
          </View>

          {/* 1-2 line info about what DoomScore is */}
          <View style={styles.doomInfoBox}>
            <Text style={styles.doomInfoText}>
              DoomScore (0–100) measures your daily distraction load from social media and games. Keep your score below your daily target to protect your deep focus.
            </Text>
          </View>

          {/* Stepper */}
          <View style={styles.doomStepperRow}>
            <TouchableOpacity
              style={styles.doomStepperBtn}
              onPress={() => {
                Haptics.selectionAsync();
                setDraft((v) => Math.max(5, v - 5));
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="remove" size={22} color="#000" />
            </TouchableOpacity>

            <View style={{ alignItems: "center", minWidth: 110 }}>
              <Text style={styles.doomTargetBigNum}>{draft}</Text>
              <Text style={styles.doomTargetUnit}>MAX POINTS / DAY</Text>
            </View>

            <TouchableOpacity
              style={styles.doomStepperBtn}
              onPress={() => {
                Haptics.selectionAsync();
                setDraft((v) => Math.min(95, v + 5));
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add" size={22} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Quick presets */}
          <View style={styles.doomPresetsRow}>
            {DOOM_PRESETS.map((p) => {
              const active = draft === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.doomPresetChip, active && styles.doomPresetChipActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setDraft(p);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.doomPresetChipText, active && { color: "#fff" }]}>
                    ≤ {p}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.doomCurrentCompare}>
            Current DoomScore: <Text style={{ fontFamily: "Inter_700Bold", color: currentDoomScore <= draft ? "#16a34a" : "#dc2626" }}>{currentDoomScore} pts</Text> ({currentDoomScore <= draft ? "Within Target" : "Above Target"})
          </Text>

          <TouchableOpacity
            style={styles.logSubmitBtn}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onSave(draft);
              onClose();
            }}
          >
            <Text style={styles.logSubmitBtnText}>SET TARGET (≤ {draft} PTS)</Text>
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

  // Prefer daily goals, or show all added goals if user added scheduled goals
  const dailyGoals = goals.filter((g) => g.type === "daily");
  const displayGoals = dailyGoals.length > 0 ? dailyGoals : goals;
  const done  = displayGoals.filter((g) => g.status === "done").length;
  const total = displayGoals.length;

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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="checklist" size={16} color="#0284C7" />
              </View>
              <Text style={styles.goalsSheetTitle}>DAILY GOALS</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={14}>
              <MaterialIcons name="close" size={20} color="#777" />
            </TouchableOpacity>
          </View>
          <Text style={styles.goalsSheetSub}>
            {total > 0 ? `${done} of ${total} completed today` : "No daily goals added yet"}
          </Text>
          <ScrollView style={{ maxHeight: 310 }} showsVerticalScrollIndicator={false}>
            <View style={styles.goalsList}>
              {total === 0 && (
                <Text style={[styles.goalsListName, { color: "#999", paddingVertical: 14, textAlign: "center" }]}>
                  No daily goals added yet — tap below to add your first daily goal.
                </Text>
              )}
              {displayGoals.map((g, i) => {
                const isDone = g.status === "done";
                const isForfeited = (g.status as string) === "forfeited";
                return (
                  <View key={g.id} style={[styles.goalsListRow, i < displayGoals.length - 1 && styles.goalsListDivider]}>
                    <View
                      style={[
                        styles.goalsListDot,
                        {
                          backgroundColor: isDone
                            ? "#16a34a"
                            : isForfeited
                              ? "#fee2e2"
                              : "#DBEAFE",
                        },
                      ]}
                    >
                      {isDone ? (
                        <MaterialIcons name="check" size={13} color="#fff" />
                      ) : isForfeited ? (
                        <MaterialIcons name="close" size={13} color="#dc2626" />
                      ) : (
                        <MaterialIcons name="schedule" size={12} color="#0284C7" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.goalsListName, { color: isDone ? "#111" : "#222" }]}>
                        {g.title}
                      </Text>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#64748b", marginTop: 2 }}>
                        {g.startTime} · {g.durationMinutes}m · {(g.priority || "medium").toUpperCase()}
                      </Text>
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: isDone ? "#dcfce7" : isForfeited ? "#fee2e2" : "#E0F2FE",
                      }}
                    >
                      <Text
                        style={[
                          styles.goalsListStatus,
                          {
                            color: isDone ? "#15803d" : isForfeited ? "#dc2626" : "#0284C7",
                          },
                        ]}
                      >
                        {isDone ? "Done" : isForfeited ? "Forfeited" : "Pending"}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.logSubmitBtn, { backgroundColor: "#0284C7", marginTop: 14, height: 46 }]}
            activeOpacity={0.85}
            onPress={() => {
              onClose();
              router.push("/(tabs)/goals" as any);
            }}
          >
            <Text style={styles.logSubmitBtnText}>OPEN GOALS TAB</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Oval accent card (Daily Tasks / Mood Check / Streaks) ────────────────────


// ── Mood Check Modal ────────────────────────────────────────────────────────────
function MoodCheckModal({
  visible,
  onClose,
  initialMood,
  onSave,
  isSaving,
}: {
  visible: boolean;
  onClose: () => void;
  initialMood?: { moodScore: number; moodLabel: string; note?: string } | null;
  onSave: (score: number, label: string, note: string) => void;
  isSaving: boolean;
}) {
  const [selectedScore, setSelectedScore] = React.useState<number>(initialMood?.moodScore || 4);
  const [note, setNote] = React.useState<string>(initialMood?.note || "");

  React.useEffect(() => {
    if (initialMood) {
      setSelectedScore(initialMood.moodScore);
      setNote(initialMood.note || "");
    }
  }, [initialMood, visible]);

  const moods = [
    { score: 5, label: "Great", emoji: "🤩" },
    { score: 4, label: "Good", emoji: "😊" },
    { score: 3, label: "Okay", emoji: "😐" },
    { score: 2, label: "Low", emoji: "😔" },
    { score: 1, label: "Bad", emoji: "😫" },
  ];

  const handleSave = () => {
    const selected = moods.find((m) => m.score === selectedScore) || moods[1];
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(selected.score, selected.label, note);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdropOverlay}>
        <View style={styles.moodModalCard}>
          <View style={styles.moodModalHeader}>
            <View>
              <Text style={styles.moodModalTitle}>Daily Mood Check</Text>
              <Text style={styles.moodModalSub}>How are you feeling today?</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.moodModalCloseBtn}>
              <MaterialIcons name="close" size={22} color="#555" />
            </TouchableOpacity>
          </View>

          <View style={styles.moodOptionsRow}>
            {moods.map((m) => {
              const isSelected = selectedScore === m.score;
              return (
                <TouchableOpacity
                  key={m.score}
                  style={[
                    styles.moodOptionItem,
                    isSelected && styles.moodOptionSelected,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedScore(m.score);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.moodOptionEmoji}>{m.emoji}</Text>
                  <Text style={[styles.moodOptionLabel, isSelected && styles.moodOptionLabelSelected]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={styles.moodNoteInput}
            placeholder="Add a reflection note (optional)..."
            placeholderTextColor="#999"
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity
            style={[styles.moodSaveBtn, isSaving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.85}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.moodSaveBtnText}>Save Today's Mood (+15 XP)</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Oval accent card (Daily Tasks / Mood Check / Streaks) ─────────────────────
function OvalCard({ bg, iconColor, icon, label1, label2, badgeText, badgeBg, onPress }: {
  bg: string; iconColor: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label1: string; label2?: string;
  badgeText?: string; badgeBg?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.ovalCard, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.8}
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
    </TouchableOpacity>
  );
}

// ── Home screen ───────────────────────────────────────────────────────────────
interface MergedAppUsage {
  appName: string;
  packageName: string;
  category?: string | null;
  dailyMinutes: number;
  totalMinutes: number;
  weeklyAvgMinutes?: number;
  iconUri?: string;
}
let memoryMostUsedCache: MergedAppUsage[] = [];
const MOST_USED_CACHE_KEY = "hadaf_most_used_apps_v4";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 24 : insets.top;
  const [showCal,   setShowCal]   = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [showLogUsage, setShowLogUsage] = useState(false);
  const [showOptIn, setShowOptIn] = useState(false);
  const [showDoomTargetModal, setShowDoomTargetModal] = useState(false);
  const [targetDoomScore, setTargetDoomScore] = useState<number | null>(null);
  const [refreshAnimKey, setRefreshAnimKey] = useState(0);
  const [localGoalsBackup, setLocalGoalsBackup] = useState<Goal[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(DOOM_TARGET_STORAGE_KEY)
      .then((val) => {
        if (val) {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num > 0) setTargetDoomScore(num);
        }
      })
      .catch(() => {});

    AsyncStorage.getItem("@hadaf/local_goals_backup_v1")
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setLocalGoalsBackup(parsed);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveTargetDoomScore = (target: number) => {
    setTargetDoomScore(target);
    AsyncStorage.setItem(DOOM_TARGET_STORAGE_KEY, String(target)).catch(() => {});
  };

  // Native device usage state
  const [deviceUsage, setDeviceUsage] = useState<MergedAppUsage[]>(memoryMostUsedCache);

  useEffect(() => {
    AsyncStorage.getItem(MOST_USED_CACHE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const cleaned = parsed
              .filter((x) => !isCallOrSystemNoise(x?.appName, x?.packageName))
              .map((x) => ({
                ...x,
                category: normalizeAppCategory(x?.appName, x?.category, x?.packageName),
              }));
            memoryMostUsedCache = cleaned;
            setDeviceUsage(cleaned);
          }
        } catch {}
      }
    });
  }, []);
  const [nativePermGranted, setNativePermGranted] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: me, refetch: refetchMe } = useGetMe();
  const { data: rawGoals, refetch: refetchGoals } = useListGoals();
  const goals = React.useMemo(() => {
    const serverList = Array.isArray(rawGoals) ? rawGoals : [];
    const byId = new Map<string, Goal>();
    for (const g of serverList) byId.set(g.id, g);
    for (const lg of localGoalsBackup) {
      const matched = serverList.find(
        (s) => s.id === lg.id || (s.title === lg.title && s.startTime === lg.startTime)
      );
      if (matched) {
        const localUpdated = new Date(lg.updatedAt || 0).getTime();
        const serverUpdated = new Date(matched.updatedAt || 0).getTime();
        byId.set(
          matched.id,
          localUpdated >= serverUpdated ? { ...matched, status: lg.status, updatedAt: lg.updatedAt } : matched
        );
      } else {
        byId.set(lg.id, lg);
      }
    }
    return Array.from(byId.values());
  }, [rawGoals, localGoalsBackup]);
  const { data: rawAppUsage, refetch: refetchAppUsage } = useGetAppUsageSummary();
  const appUsage = Array.isArray(rawAppUsage) ? rawAppUsage : [];
  const { data: settings } = useGetUserSettings();
  const { data: rawFocusSessions, refetch: refetchFocusSessions } = useListFocusSessions();
  const focusSessions = Array.isArray(rawFocusSessions) ? rawFocusSessions : [];
  const { data: rawEntries, refetch: refetchEntries } = useListAppUsageEntries();
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  const updateSettings = useUpdateUserSettings();
  const createUsageEntry = useCreateAppUsageEntry();

  const { data: userProfile, refetch: refetchProfile } = useQuery({
    queryKey: ["userMe"],
    queryFn: () => customFetch<any>("/api/users/me"),
  });

  const { data: todayMoodData, refetch: refetchTodayMood } = useQuery({
    queryKey: ["todayMood"],
    queryFn: () => customFetch<any>("/api/mood-logs/today"),
  });

  const [showMoodModal, setShowMoodModal] = React.useState(false);
  const [isSavingMood, setIsSavingMood] = React.useState(false);

  const handleSaveMood = async (score: number, label: string, note: string) => {
    setIsSavingMood(true);
    try {
      await customFetch("/api/mood-logs", {
        method: "POST",
        body: JSON.stringify({ moodScore: score, moodLabel: label, note }),
      });
      setShowMoodModal(false);
      refetchTodayMood();
      refetchProfile();
    } catch (err) {
      console.error("[Home] Save mood error:", err);
    } finally {
      setIsSavingMood(false);
    }
  };

  const calculatedStreak = computeStreak(focusSessions);
  const streak = (userProfile?.currentStreak !== undefined && userProfile.currentStreak > 0)
    ? userProfile.currentStreak
    : calculatedStreak;

  const checkAndLoadStats = React.useCallback(async () => {
    console.log("[Home] checkAndLoadStats: Checking native device permission...");
    const perm = hasUsagePermission();
    console.log(`[Home] checkAndLoadStats: hasUsagePermission returned: ${perm}`);
    setNativePermGranted(perm);

    if (perm) {
      if (memoryMostUsedCache.length === 0) {
        setLoadingStats(true);
      }
      console.log("[Home] checkAndLoadStats: Loading native usage stats (daily & weekly)...");
      try {
        const daily = await getDeviceUsageStats(1);
        const weekly = await getDeviceUsageStats(7);
        console.log(`[Home] checkAndLoadStats: Fetched ${daily.length} daily and ${weekly.length} weekly apps`);

        // Merge union of today's apps and weekly apps, sorted by today's daily screen time descending
        const pkgMap = new Map<string, MergedAppUsage>();
        for (const d of daily) {
          if (isCallOrSystemNoise(d.appName, d.packageName)) continue;
          const w = weekly.find((x) => x.packageName === d.packageName || x.appName === d.appName);
          const total7 = w ? Math.max(w.totalMinutes, d.totalMinutes) : d.totalMinutes;
          const normCat = normalizeAppCategory(d.appName, d.category, d.packageName);
          pkgMap.set(d.packageName || d.appName, {
            appName: d.appName,
            packageName: d.packageName,
            category: normCat,
            dailyMinutes: d.totalMinutes,
            totalMinutes: total7,
            weeklyAvgMinutes: Math.max(1, Math.round(total7 / 7)),
            iconUri: d.iconUri || w?.iconUri || undefined,
          });
        }
        for (const w of weekly) {
          if (isCallOrSystemNoise(w.appName, w.packageName)) continue;
          const key = w.packageName || w.appName;
          if (!pkgMap.has(key)) {
            const d = daily.find((x) => x.packageName === w.packageName || x.appName === w.appName);
            const normCat = normalizeAppCategory(w.appName, w.category, w.packageName);
            pkgMap.set(key, {
              appName: w.appName,
              packageName: w.packageName,
              category: normCat,
              dailyMinutes: d ? d.totalMinutes : 0,
              totalMinutes: w.totalMinutes,
              weeklyAvgMinutes: Math.max(1, Math.round(w.totalMinutes / 7)),
              iconUri: w.iconUri || d?.iconUri || undefined,
            });
          }
        }
        const combined: MergedAppUsage[] = Array.from(pkgMap.values()).sort(
          (a, b) => b.dailyMinutes - a.dailyMinutes || b.totalMinutes - a.totalMinutes
        );

        setDeviceUsage(combined);
        memoryMostUsedCache = combined;
        setLoadingStats(false);
        AsyncStorage.setItem(MOST_USED_CACHE_KEY, JSON.stringify(combined)).catch(() => {});

        // Non-blocking background sync to backend database so UI / pull-to-refresh never waits or freezes!
        const activeTodayApps = combined.filter((a) => a.dailyMinutes > 0).slice(0, 8);
        if (activeTodayApps.length > 0) {
          void (async () => {
            try {
              await Promise.allSettled(
                activeTodayApps.map((app) =>
                  customFetch("/api/app-usage", {
                    method: "POST",
                    body: JSON.stringify({
                      appName: app.appName,
                      category: app.category ?? undefined,
                      durationMinutes: app.dailyMinutes,
                    }),
                  })
                )
              );
              void refetchAppUsage();
            } catch {}
          })();
        }
      } catch (err: any) {
        console.error("[Home] checkAndLoadStats: Failed to query native stats:", err.message || err);
      } finally {
        setLoadingStats(false);
        console.log("[Home] checkAndLoadStats: Loading complete.");
      }
    }
  }, [refetchAppUsage]);

  const checkAndLoadStatsRef = React.useRef(checkAndLoadStats);
  useEffect(() => {
    checkAndLoadStatsRef.current = checkAndLoadStats;
  }, [checkAndLoadStats]);

  // Monitor mount and app foreground resumes (returning from Settings)
  useEffect(() => {
    console.log("[Home] App mounted. Performing initial stats and permission check...");
    checkAndLoadStatsRef.current();

    const sub = AppState.addEventListener("change", (nextState) => {
      console.log(`[Home] AppState changed to: ${nextState}`);
      if (nextState === "active") {
        console.log("[Home] App resumed. Re-checking permission and stats...");
        checkAndLoadStatsRef.current();
      }
    });

    return () => {
      console.log("[Home] App unmounted. Removing AppState listener.");
      sub.remove();
    };
  }, []);

  // Merge device usage with server usage — device data takes priority when available
  interface DisplayAppUsage {
    appName: string;
    packageName?: string;
    category?: string | null;
    dailyMinutes: number;
    totalMinutes: number;
    weeklyAvgMinutes: number;
    iconUri?: string;
  }

  const todayKeyStr = localDayKey(new Date());
  const weekCutoffMs = Date.now() - 7 * 86_400_000;

  // Build accurate fallback daily & weekly avg per app from server entries (deduped per day)
  const fallbackServerUsage = React.useMemo<DisplayAppUsage[]>(() => {
    if (entries.length > 0) {
      const perAppDay = new Map<string, { appName: string; category?: string | null; day: string; mins: number }>();
      for (const e of entries) {
        const ts = new Date(e.loggedAt).getTime();
        if (ts < weekCutoffMs) continue;
        const day = localDayKey(new Date(e.loggedAt));
        const key = `${e.appName.toLowerCase()}|${day}`;
        const prev = perAppDay.get(key);
        if (!prev || e.durationMinutes >= prev.mins) {
          perAppDay.set(key, { appName: e.appName, category: e.category, day, mins: e.durationMinutes });
        }
      }
      const activeDaysSet = new Set<string>();
      const byApp = new Map<string, { appName: string; category?: string | null; todayMins: number; weekMins: number }>();
      for (const item of perAppDay.values()) {
        activeDaysSet.add(item.day);
        const k = item.appName.toLowerCase();
        const cur = byApp.get(k) ?? { appName: item.appName, category: item.category, todayMins: 0, weekMins: 0 };
        cur.weekMins += item.mins;
        if (item.day === todayKeyStr) cur.todayMins = Math.max(cur.todayMins, item.mins);
        byApp.set(k, cur);
      }
      const numDays = Math.max(1, activeDaysSet.size);
      return Array.from(byApp.values())
        .map((a) => ({
          appName: a.appName,
          category: a.category,
          dailyMinutes: a.todayMins,
          totalMinutes: a.weekMins,
          weeklyAvgMinutes: Math.max(1, Math.round(a.weekMins / numDays)),
        }))
        .sort((a, b) => b.dailyMinutes - a.dailyMinutes || b.totalMinutes - a.totalMinutes);
    }
    return appUsage.map((a) => ({
      appName: a.appName,
      category: a.category,
      dailyMinutes: a.totalMinutes,
      totalMinutes: a.totalMinutes,
      weeklyAvgMinutes: Math.max(1, Math.round(a.totalMinutes / 7)),
    }));
  }, [entries, appUsage, todayKeyStr, weekCutoffMs]);

  const mergedUsage: DisplayAppUsage[] =
    deviceUsage.length > 0
      ? deviceUsage
          .filter((d) => !isCallOrSystemNoise(d.appName, d.packageName))
          .map((d) => ({
            appName: d.appName,
            packageName: d.packageName,
            category: normalizeAppCategory(d.appName, d.category, d.packageName),
            dailyMinutes: d.dailyMinutes,
            totalMinutes: d.totalMinutes,
            weeklyAvgMinutes: d.weeklyAvgMinutes || Math.max(1, Math.round((d.totalMinutes || d.dailyMinutes) / 7)),
            iconUri: d.iconUri,
          }))
      : fallbackServerUsage
          .filter((d) => !isCallOrSystemNoise(d.appName, d.packageName))
          .map((d) => ({
            ...d,
            category: normalizeAppCategory(d.appName, d.category, d.packageName),
          }));

  const handlePullRefresh = React.useCallback(async () => {
    setRefreshing(true);
    Haptics.selectionAsync();
    try {
      const localRaw = await AsyncStorage.getItem("@hadaf/local_goals_backup_v1");
      if (localRaw) {
        const parsed = JSON.parse(localRaw);
        if (Array.isArray(parsed)) setLocalGoalsBackup(parsed);
      }
      // Refresh all Home cards (screen time, DoomScore, most used apps, goals, mood, streak) EXCEPT AI messages
      await Promise.allSettled([
        checkAndLoadStats(),
        refetchMe(),
        refetchProfile(),
        refetchTodayMood(),
        refetchGoals(),
        refetchFocusSessions(),
        refetchAppUsage(),
        refetchEntries(),
      ]);
    } finally {
      setRefreshing(false);
      // Replay fresh counter, progress bar, and card entrance animations!
      setRefreshAnimKey((k) => k + 1);
    }
  }, [
    checkAndLoadStats,
    refetchMe,
    refetchProfile,
    refetchTodayMood,
    refetchGoals,
    refetchFocusSessions,
    refetchAppUsage,
    refetchEntries,
  ]);

  const handleOpenLogUsage = () => {
    Haptics.selectionAsync();
    console.log(`[Home] handleOpenLogUsage called. nativePermGranted: ${nativePermGranted}`);
    if (nativePermGranted) {
      // Already have real data — refresh and auto-sync in background, no modal needed!
      checkAndLoadStats();
    } else {
      // Permission not granted — open settings directly!
      handleRequestPermission();
    }
  };

  const handleRequestPermission = () => {
    console.log("[Home] handleRequestPermission: Requesting native permission (redirecting to Settings)...");
    void requestUsagePermission();

    // Set server flag to opted-in
    console.log("[Home] handleRequestPermission: Saving opt-in flag to backend server settings...");
    updateSettings.mutate(
      { data: { usageTrackingOptIn: true } },
      {
        onSuccess: () => {
          console.log("[Home] handleRequestPermission: Saved opt-in to server successfully.");
          setShowOptIn(false);
        },
        onError: (err) => {
          console.error("[Home] handleRequestPermission: Failed to save opt-in to server:", err);
        }
      }
    );
  };

  const handleLogUsage = (apps: { name: string; category: string; minutes: number }[]) => {
    let remaining = apps.length;
    apps.forEach(app => {
      createUsageEntry.mutate(
        { data: { appName: app.name, category: app.category, durationMinutes: app.minutes } },
        {
          onSuccess: () => {
            remaining--;
            if (remaining === 0) { refetchAppUsage(); setShowLogUsage(false); }
          },
        }
      );
    });
  };

  const firstName = (me?.name ?? me?.email ?? "there").split(" ")[0].split("@")[0];
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  const pendingGoals = goals.filter(g => g.status === "pending").length;
  const doneGoals    = goals.filter(g => g.status === "done").length;

  // Most Used Apps list: sorted strictly by today's daily screen time activity (with weekly average below each app)
  const sortedByToday = [...mergedUsage].sort(
    (a, b) => b.dailyMinutes - a.dailyMinutes || b.totalMinutes - a.totalMinutes
  );
  const usedTodayApps = sortedByToday.filter((a) => a.dailyMinutes > 0);
  const topApps = (usedTodayApps.length > 0 ? usedTodayApps : sortedByToday).slice(0, 5);
  const maxAppMinutes = Math.max(1, ...topApps.map((a) => a.dailyMinutes));

  // Total Screen Time & DoomScore: calculated ONLY from Social Media apps and Games!
  const socialAndGameApps = mergedUsage.filter((app) =>
    isSocialOrGameApp(app.appName, app.category, app.packageName)
  );
  const distractingMinutes = socialAndGameApps.reduce((sum, app) => sum + app.dailyMinutes, 0);
  const totalScreenMinutes = distractingMinutes;

  // Dynamic limit: 120 minutes (2 hours) allowed across social media & games (scaled by active social/game apps, max 240m)
  const activeSocialOrGameCount = Math.max(
    1,
    socialAndGameApps.filter((a) => a.dailyMinutes > 0 || a.totalMinutes > 0).length
  );
  const maxSocialLimit = Math.min(240, Math.max(120, activeSocialOrGameCount * 90));

  function calculateDoomScore(mins: number): number {
    if (mins <= 0) return 0;
    return Math.min(100, Math.round((mins / maxSocialLimit) * 100));
  }

  const doomScore = calculateDoomScore(distractingMinutes);

  // Weekly average screen time & weekly average DoomScore (ONLY Social Media & Games)
  const avgScreenTime = React.useMemo(() => {
    if (socialAndGameApps.length > 0 && deviceUsage.length > 0) {
      const totalWeeklySocialAndGames = socialAndGameApps.reduce(
        (sum, app) => sum + (app.totalMinutes || app.dailyMinutes),
        0
      );
      return Math.round(totalWeeklySocialAndGames / 7);
    }
    const perDaySocial = new Map<string, number>();
    const perAppDayMax = new Map<string, { day: string; mins: number }>();
    for (const entry of entries) {
      const entryDate = new Date(entry.loggedAt);
      const diffDays = Math.ceil(Math.abs(Date.now() - entryDate.getTime()) / 86_400_000);
      if (diffDays <= 7 && isSocialOrGameApp(entry.appName, entry.category)) {
        const dayStr = localDayKey(entryDate);
        const key = `${dayStr}|${entry.appName.toLowerCase()}`;
        const prev = perAppDayMax.get(key);
        if (!prev || entry.durationMinutes >= prev.mins) {
          perAppDayMax.set(key, { day: dayStr, mins: entry.durationMinutes });
        }
      }
    }
    for (const item of perAppDayMax.values()) {
      perDaySocial.set(item.day, (perDaySocial.get(item.day) ?? 0) + item.mins);
    }
    if (perDaySocial.size === 0) return distractingMinutes;
    const sum = Array.from(perDaySocial.values()).reduce((a, b) => a + b, 0);
    return Math.round(sum / perDaySocial.size);
  }, [socialAndGameApps, deviceUsage.length, entries, distractingMinutes]);

  const avgDoomScore = calculateDoomScore(avgScreenTime);

  const progressColor = doomScore < 30 ? "#4ade80" : doomScore < 70 ? "#facc15" : "#f87171";

  const dailyGoalsOnly = goals.filter((g) => g.type === "daily");
  const displayDailyGoals = dailyGoalsOnly.length > 0 ? dailyGoalsOnly : goals;
  const doneDailyCount = displayDailyGoals.filter((g) => g.status === "done").length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />
      <CalendarModal visible={showCal} onClose={() => setShowCal(false)} />
      <GoalsStatusModal visible={showGoals} onClose={() => setShowGoals(false)} goals={goals} />
      <TargetDoomScoreModal
        visible={showDoomTargetModal}
        currentTarget={targetDoomScore}
        currentDoomScore={doomScore}
        onSave={handleSaveTargetDoomScore}
        onClose={() => setShowDoomTargetModal(false)}
      />
      <SelectAppsModal
        visible={showLogUsage}
        onClose={() => setShowLogUsage(false)}
        onSubmit={handleLogUsage}
        submitting={createUsageEntry.isPending}
      />
      <UsageOptInModal
        visible={showOptIn}
        onClose={() => setShowOptIn(false)}
        onEnable={handleRequestPermission}
        enabling={updateSettings.isPending}
      />

      <ScrollView scrollEventThrottle={16} decelerationRate="normal" 
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 20, paddingBottom: isWeb ? 34 + 84 : 100 },
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

        {/* ── AI Coach Reality Check & Motivation Widget (auto-refreshes every 1m, not on manual swipe) ── */}
        <AiCoachWidget firstName={firstName} />

        {/* ── Two stat cards (Screen Time & Clickable DoomScore with Target) ── */}
        <Animated.View
          key={`stat-row-${refreshAnimKey}`}
          entering={isWeb ? undefined : FadeInDown.delay(60).springify()}
          style={styles.statRow}
        >
          {/* Screen Time */}
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>SCREEN TIME</Text>
            <ScreenTimeCounter
              targetMinutes={totalScreenMinutes}
              delay={120}
              animKey={refreshAnimKey}
              style={styles.statNumber}
            />
            <View style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)", paddingTop: 8, marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.5)", letterSpacing: 0.8 }}>
                WEEKLY AVG
              </Text>
              <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>
                {formatDuration(avgScreenTime)}
              </Text>
            </View>
          </View>

          {/* DoomScore (Clickable to set Target DoomScore) */}
          <TouchableOpacity
            style={styles.statCard}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.selectionAsync();
              setShowDoomTargetModal(true);
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.statLabel}>DOOMSCORE</Text>
              <MaterialIcons name="tune" size={13} color="rgba(255,255,255,0.65)" />
            </View>

            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
              <CounterNumber
                target={doomScore}
                delay={180}
                animKey={refreshAnimKey}
                style={styles.statNumber}
              />
              {targetDoomScore !== null && (
                <View
                  style={[
                    styles.doomTargetMiniBadge,
                    {
                      backgroundColor:
                        doomScore <= targetDoomScore
                          ? "rgba(74, 222, 128, 0.18)"
                          : "rgba(248, 113, 113, 0.22)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.doomTargetMiniText,
                      {
                        color: doomScore <= targetDoomScore ? "#4ade80" : "#f87171",
                      },
                    ]}
                  >
                    TARGET ≤ {targetDoomScore}
                  </Text>
                </View>
              )}
            </View>

            <AnimatedProgressBar
              percent={doomScore / 100}
              delay={300}
              animKey={refreshAnimKey}
              height={5}
              radius={3}
              trackColor="rgba(255,255,255,0.2)"
              fillColor={progressColor}
            />
            <View style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)", paddingTop: 8, marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.5)", letterSpacing: 0.8 }}>
                WEEKLY AVG
              </Text>
              <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>
                {avgDoomScore} pts
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Most Used Apps ── */}
        <Animated.View
          key={`apps-card-${refreshAnimKey}`}
          entering={isWeb ? undefined : FadeInDown.delay(130).springify()}
          style={styles.appsCard}
        >
          <View style={styles.appsHeader}>
            <Text style={styles.appsHeaderLabel}>MOST USED APPS</Text>
            <TouchableOpacity onPress={handleOpenLogUsage} hitSlop={10} style={styles.appsHeaderAddBtn}>
              <MaterialIcons name="add" size={16} color="#333" />
            </TouchableOpacity>
          </View>
          {loadingStats ? (
            <HadafInlineLoader message="Syncing screen time..." compact light />
          ) : (!nativePermGranted && Platform.OS !== "web") ? (
            <TouchableOpacity
              onPress={handleRequestPermission}
              activeOpacity={0.8}
              style={{ alignItems: "center", paddingVertical: 14, gap: 8 }}
            >
              <MaterialIcons name="security" size={24} color={colors.primary} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#222", textAlign: "center" }}>
                Enable Permission to View Most Used Apps
              </Text>
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#888", textAlign: "center", paddingHorizontal: 20, lineHeight: 16 }}>
                Hadaf reads local app statistics to block distracting apps and compute your daily DoomScore.
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {topApps.length === 0 && (
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#999", paddingVertical: 8 }}>
                  No usage logged yet.
                </Text>
              )}
              {topApps.map((app, i) => (
                <AppRow
                  key={`${app.appName}-${refreshAnimKey}`}
                  app={app}
                  index={i}
                  last={i === topApps.length - 1}
                  maxMinutes={maxAppMinutes}
                  animKey={refreshAnimKey}
                />
              ))}
            </>
          )}
        </Animated.View>

        {/* ── Three oval accent cards (Daily Goals in Light Blue, Mood, Streaks) ── */}
        <Animated.View
          key={`oval-row-${refreshAnimKey}`}
          entering={isWeb ? undefined : FadeInDown.delay(180).springify()}
          style={styles.ovalRow}
        >
          <OvalCard
            bg="#DBEAFE"
            iconColor="#0284C7"
            icon="checklist"
            label1="DAILY"
            label2="GOALS"
            badgeText="VIEW"
            badgeBg="#0284C7"
            onPress={() => {
              Haptics.selectionAsync();
              setShowGoals(true);
            }}
          />
          <OvalCard
            bg={todayMoodData?.logged ? "#e8f5e9" : "#fff3e0"}
            iconColor={todayMoodData?.logged ? "#2e7d32" : "#d84315"}
            icon="self-improvement"
            label1="MOOD"
            label2={todayMoodData?.logged ? (todayMoodData.log?.moodLabel || "LOGGED").toUpperCase() : "CHECK"}
            badgeText={todayMoodData?.logged ? "LOGGED" : "CHECK IN"}
            badgeBg={todayMoodData?.logged ? "#2e7d32" : "#d84315"}
            onPress={() => {
              Haptics.selectionAsync();
              setShowMoodModal(true);
            }}
          />
          <OvalCard
            bg="#fff3e0"
            iconColor="#d84315"
            icon="local-fire-department"
            label1="STREAKS"
            label2={streak > 0 ? `${streak} ${streak === 1 ? "DAY" : "DAYS"}` : "0 DAYS"}
            badgeText={`${streak}d`}
            badgeBg="#d84315"
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/achievements" as any);
            }}
          />
        </Animated.View>

        <MoodCheckModal
          visible={showMoodModal}
          onClose={() => setShowMoodModal(false)}
          initialMood={todayMoodData?.log}
          onSave={handleSaveMood}
          isSaving={isSavingMood}
        />

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  modalBackdropOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
  },
  moodModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f4f4f5",
    alignItems: "center",
    justifyContent: "center",
  },
  moodModalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
    gap: 20,
    width: "100%",
  },
  sheetDragBar: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#e4e4e7",
    alignSelf: "center",
    marginBottom: 4,
  },
  moodModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  moodModalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#000",
    letterSpacing: -0.5,
  },
  moodModalSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#71717a",
    marginTop: 2,
  },
  moodOptionsRow: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 4,
  },
  moodOptionItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#eee",
    backgroundColor: "#fafafa",
    gap: 6,
  },
  moodOptionSelected: {
    borderColor: "#000",
    backgroundColor: "#f4f4f5",
    transform: [{ scale: 1.04 }],
  },
  moodOptionEmoji: {
    fontSize: 32,
  },
  moodOptionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#71717a",
  },
  moodOptionLabelSelected: {
    color: "#000",
    fontFamily: "Inter_700Bold",
  },
  moodNoteInput: {
    backgroundColor: "#f4f4f5",
    borderRadius: 16,
    padding: 16,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#000",
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#e4e4e7",
  },
  moodSaveBtn: {
    backgroundColor: "#000",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  moodSaveBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  root:   { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 16 },

  // Header
  headerRow:   { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  headerLeft:  { flex: 1, gap: 4 },
  greeting:    { fontSize: 26, fontFamily: "Inter_700Bold", color: "#111", letterSpacing: -0.3 },
  greetingSmall: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#555", letterSpacing: -0.2 },
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
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 9,
  },
  statLabel:  { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.55)", letterSpacing: 1.4 },
  statNumber: { fontSize: 34, fontFamily: "Inter_700Bold",    color: "#fff", letterSpacing: -1 },

  doomTargetMiniBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  doomTargetMiniText: {
    fontSize: 8.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },

  // Target DoomScore Modal
  doomModalCard: {
    width: SCREEN_W * 0.9,
    backgroundColor: "#ffffff",
    borderRadius: 26,
    padding: 24,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 18,
  },
  doomInfoBox: {
    backgroundColor: "#f4f4f5",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e4e4e7",
  },
  doomInfoText: {
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
    color: "#3f3f46",
    lineHeight: 18,
  },
  doomStepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingVertical: 6,
  },
  doomStepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  doomTargetBigNum: {
    fontSize: 42,
    fontFamily: "Inter_700Bold",
    color: "#000",
    letterSpacing: -1.5,
  },
  doomTargetUnit: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#71717a",
    letterSpacing: 1.2,
  },
  doomPresetsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  doomPresetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#f4f4f5",
    borderWidth: 1,
    borderColor: "#e4e4e7",
  },
  doomPresetChipActive: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  doomPresetChipText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#3f3f46",
  },
  doomCurrentCompare: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#52525b",
    textAlign: "center",
  },

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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 18,
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.11,
    shadowRadius: 14,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  ovalLabel:     { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2, textAlign: "center", textTransform: "uppercase" },
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

  // Select apps modal
  selectModalOuter: { flex: 1, justifyContent: "flex-end" },
  selectModalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 20,
  },
  selectModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ddd", alignSelf: "center", marginBottom: 18 },
  selectModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  selectModalTitle:  { fontSize: 18, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 0.5 },
  selectModalSub:    { fontSize: 13, fontFamily: "Inter_400Regular", color: "#888", marginBottom: 18 },
  timeRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  timeRowLabel: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#555", letterSpacing: 1 },
  timeBtns:     { flexDirection: "row", gap: 6 },
  timeBtn:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#f0f0f0" },
  timeBtnActive:{ backgroundColor: "#111" },
  timeBtnText:  { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#555" },
  timeBtnTextActive: { color: "#fff" },
  selectAppsList: { maxHeight: 340, marginBottom: 8 },
  selectAppRow:  { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13 },
  selectAppIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#f0f0f0", alignItems: "center", justifyContent: "center" },
  selectAppName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111", marginBottom: 2 },
  selectAppCat:  { fontSize: 10, fontFamily: "Inter_500Medium", color: "#888", letterSpacing: 0.8 },
  selectCheckbox:{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: "#ddd", alignItems: "center", justifyContent: "center" },

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
