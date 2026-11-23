import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { HadafInlineLoader } from "@/components/AppLoadingScreen";
import { useColors } from "@/hooks/useColors";
import {
  computePeriodInsights,
  useTargetMinutes,
  fmtMin,
  fmtShort,
  TARGET_STEP,
  MIN_TARGET,
  MAX_TARGET,
  type PeriodRange,
  type HealthStats,
  type PeriodGoalTracker,
  type ChartIntervalStat,
  type BedrockDiagnosticResult,
} from "@/lib/usageStats";
import {
  type AppUsageEntry,
  type AppUsageSummaryItem,
  type FocusSession,
  type Goal,
  useListGoals,
  useListFocusSessions,
  useGetAppUsageSummary,
  useListAppUsageEntries,
  useCreateAppUsageEntry,
  getListAppUsageEntriesQueryKey,
  getGetAppUsageSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import LockedOverlay from "@/components/LockedOverlay";
import { useSubscription } from "@/hooks/useSubscription";
import { hasUsagePermission, getDeviceUsageStats } from "../../modules/hadaf-native/src";

const isWeb    = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;

const DATE_RANGES: PeriodRange[] = ["WEEK", "MONTH", "YEAR"];

// ─── Data helpers ─────────────────────────────────────────────────────────────

function formatMinutes(m: number): string {
  const h   = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0 && rem > 0) return `${h}h ${rem}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function categoryIcon(
  category?: string | null,
): React.ComponentProps<typeof MaterialIcons>["name"] {
  switch (category?.toLowerCase()) {
    case "social":        return "group";
    case "entertainment": return "movie";
    case "video":         return "play-circle-filled";
    case "productivity":  return "work";
    case "games":         return "sports-esports";
    case "news":          return "article";
    default:              return "smartphone";
  }
}

function buildChartData(
  entries: AppUsageEntry[],
  range: string,
): { data: number[]; labels: string[] } {
  const now = new Date();

  if (range === "WEEK") {
    const days: { label: string; date: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({
        label: d.toLocaleDateString("en", { weekday: "short" }),
        date:  d.toISOString().slice(0, 10),
      });
    }
    const data = days.map(({ date }) => {
      const total = entries
        .filter(e => e.loggedAt.slice(0, 10) === date)
        .reduce((s, e) => s + e.durationMinutes, 0);
      return total / 60;
    });
    return { data, labels: days.map(d => d.label) };
  }

  if (range === "MONTH") {
    const year   = now.getFullYear();
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const data   = months.map((_, m) => {
      const total = entries
        .filter(e => {
          const d = new Date(e.loggedAt);
          return d.getFullYear() === year && d.getMonth() === m;
        })
        .reduce((s, e) => s + e.durationMinutes, 0);
      return total / 60;
    });
    return { data, labels: months };
  }

  // YEAR — last 5 years
  const startYear = now.getFullYear() - 4;
  const years     = Array.from({ length: 5 }, (_, i) => startYear + i);
  const data      = years.map(y => {
    const total = entries
      .filter(e => new Date(e.loggedAt).getFullYear() === y)
      .reduce((s, e) => s + e.durationMinutes, 0);
    return total / 60;
  });
  return { data, labels: years.map(String) };
}

function computeKpis(entries: AppUsageEntry[], summary: AppUsageSummaryItem[]) {
  if (entries.length === 0) {
    return { peakTime: "—", dailyAvg: "—", topApp: "—" };
  }

  // Peak time by hour
  const hourTotals: Record<number, number> = {};
  for (const e of entries) {
    const h = new Date(e.loggedAt).getHours();
    hourTotals[h] = (hourTotals[h] ?? 0) + e.durationMinutes;
  }
  const peakHour = Number(
    Object.entries(hourTotals).sort((a, b) => b[1] - a[1])[0][0],
  );
  const period  = peakHour >= 12 ? "PM" : "AM";
  const h12     = peakHour % 12 || 12;
  const peakTime = `${h12} ${period}`;

  // Daily average
  const uniqueDays = new Set(entries.map(e => e.loggedAt.slice(0, 10)));
  const totalMin   = entries.reduce((s, e) => s + e.durationMinutes, 0);
  const avgMin     = Math.round(totalMin / uniqueDays.size);
  const dailyAvg   = formatMinutes(avgMin);

  // Top app (summary already sorted by total)
  const name     = summary[0]?.appName ?? "—";
  const topApp   = name.length > 6 ? name.slice(0, 6) + "…" : name;

  return { peakTime, dailyAvg, topApp };
}

// ─── Chart paths ──────────────────────────────────────────────────────────────

function buildPaths(data: number[], w: number, h: number) {
  const padL = 36, padR = 12, padT = 16, padB = 44;
  const maxVal = Math.max(...data, 0.1) * 1.15;

  const toX = (i: number) =>
    padL + (data.length > 1 ? (i / (data.length - 1)) : 0.5) * (w - padL - padR);
  const toY = (v: number) => padT + (1 - v / maxVal) * (h - padT - padB);

  let line = `M ${toX(0)} ${toY(data[0])}`;
  for (let i = 1; i < data.length; i++) {
    const cpx = (toX(i - 1) + toX(i)) / 2;
    line += ` C ${cpx} ${toY(data[i - 1])}, ${cpx} ${toY(data[i])}, ${toX(i)} ${toY(data[i])}`;
  }
  const area   = `${line} L ${toX(data.length - 1)} ${h - padB} L ${toX(0)} ${h - padB} Z`;
  const points = data.map((v, i) => ({ x: toX(i), y: toY(v) }));

  return { line, area, points, toX, padB };
}

// ─── Activity Chart ───────────────────────────────────────────────────────────

function ActivityChart({ data, labels }: { data: number[]; labels: string[] }) {
  const chartW = SCREEN_W - 80;
  const chartH = 220;

  const { line, area, points, padB } = buildPaths(data, chartW, chartH);

  const maxVal     = Math.max(...data, 0);
  const yMax       = Math.ceil(maxVal * 1.15) || 4;
  const yStep      = Math.ceil(yMax / 4) || 1;
  const yLabels    = [yStep * 4, yStep * 3, yStep * 2, yStep].map(v => `${v}h`);
  const yPositions = [0.08, 0.31, 0.56, 0.80].map(p => chartH * p);

  const padL = 36, padR = 12;
  const labelX = (i: number) =>
    padL + (data.length > 1 ? (i / (data.length - 1)) : 0.5) * (chartW - padL - padR);

  // Peak index (highest value)
  const peakIdx = data.reduce((best, v, i) => (v > data[best] ? i : best), 0);

  return (
    <View style={{ height: chartH }}>
      <Svg width={chartW} height={chartH}>
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3b82f6" stopOpacity="0.20" />
            <Stop offset="1" stopColor="#3b82f6" stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {yLabels.map((label, i) => (
          <SvgText key={i} x={4} y={yPositions[i] + 4} fontSize={10} fill="#aaa" fontFamily="Inter_500Medium">
            {label}
          </SvgText>
        ))}

        <Path d={area} fill="url(#areaGrad)" />
        <Path d={line} fill="none" stroke="#3b82f6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {points[peakIdx] && data[peakIdx] > 0 && (
          <Circle cx={points[peakIdx].x} cy={points[peakIdx].y} r={6} fill="#f97316" stroke="#fff" strokeWidth={2} />
        )}

        {labels.map((label, i) => (
          <SvgText
            key={i}
            x={labelX(i)}
            y={chartH - padB + 18}
            fontSize={9}
            fill="#aaa"
            fontFamily="Inter_500Medium"
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function isNoiseApp(appName?: string | null): boolean {
  const n = (appName || "").trim().toLowerCase();
  return n === "call" || n === "phone" || n === "incallui" || n === "dialer";
}

const TOP5_COLORS = [
  { main: "#6366f1", bg: "#eef2ff", light: "rgba(99, 102, 241, 0.16)" },  // Indigo
  { main: "#ec4899", bg: "#fdf2f8", light: "rgba(236, 72, 153, 0.16)" },  // Pink
  { main: "#f59e0b", bg: "#fffbeb", light: "rgba(245, 158, 11, 0.16)" },  // Amber
  { main: "#10b981", bg: "#ecfdf5", light: "rgba(16, 185, 129, 0.16)" },  // Emerald
  { main: "#3b82f6", bg: "#eff6ff", light: "rgba(59, 130, 246, 0.16)" },  // Blue
];

interface Top5AppStat {
  appName: string;
  category: string;
  totalMinutes: number;
  sharePct: number;
  color: string;
  bgColor: string;
  lightColor: string;
}

function buildTop5AppsForRange(
  entries: AppUsageEntry[],
  summary: AppUsageSummaryItem[],
  nativeWeekly: { appName: string; category?: string; totalMinutes: number }[],
  nativeMonthly: { appName: string; category?: string; totalMinutes: number }[],
  range: PeriodRange
): Top5AppStat[] {
  const now = Date.now();
  const cutoffMs =
    range === "WEEK"
      ? now - 7 * 86_400_000
      : range === "MONTH"
        ? now - 30 * 86_400_000
        : now - 365 * 86_400_000;

  // 1. Aggregate from server entries in the period (deduped by app + day)
  const perAppDay = new Map<string, { appName: string; category: string; mins: number }>();
  for (const e of entries) {
    if (isNoiseApp(e.appName)) continue;
    const ts = new Date(e.loggedAt).getTime();
    if (ts < cutoffMs) continue;
    const dayKey = new Date(e.loggedAt).toISOString().slice(0, 10);
    const k = `${e.appName.toLowerCase()}|${dayKey}`;
    const prev = perAppDay.get(k);
    if (!prev || e.durationMinutes >= prev.mins) {
      perAppDay.set(k, {
        appName: e.appName,
        category: e.category || "Social",
        mins: e.durationMinutes,
      });
    }
  }

  const totalsByApp = new Map<string, { appName: string; category: string; totalMinutes: number }>();
  for (const item of perAppDay.values()) {
    const k = item.appName.toLowerCase();
    const cur = totalsByApp.get(k) ?? { appName: item.appName, category: item.category, totalMinutes: 0 };
    cur.totalMinutes += item.mins;
    totalsByApp.set(k, cur);
  }

  // 2. Merge with native device stats for WEEK (7d) or MONTH/YEAR (30d) so device data is always reflected
  const nativeSource = range === "WEEK" ? nativeWeekly : nativeMonthly;
  for (const n of nativeSource) {
    if (isNoiseApp(n.appName) || n.totalMinutes <= 0) continue;
    const k = n.appName.toLowerCase();
    const cur = totalsByApp.get(k);
    if (!cur || n.totalMinutes > cur.totalMinutes) {
      totalsByApp.set(k, {
        appName: n.appName,
        category: n.category || cur?.category || "Other",
        totalMinutes: n.totalMinutes,
      });
    }
  }

  // 3. Fallback to summary if still empty
  if (totalsByApp.size === 0 && summary.length > 0) {
    for (const s of summary) {
      if (isNoiseApp(s.appName) || s.totalMinutes <= 0) continue;
      totalsByApp.set(s.appName.toLowerCase(), {
        appName: s.appName,
        category: s.category || "Other",
        totalMinutes: s.totalMinutes,
      });
    }
  }

  const top5 = Array.from(totalsByApp.values())
    .filter((a) => a.totalMinutes > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 5);

  const sumTop5 = Math.max(1, top5.reduce((acc, a) => acc + a.totalMinutes, 0));

  return top5.map((a, idx) => {
    const palette = TOP5_COLORS[idx % TOP5_COLORS.length];
    return {
      appName: a.appName,
      category: a.category,
      totalMinutes: a.totalMinutes,
      sharePct: Math.max(1, Math.round((a.totalMinutes / sumTop5) * 100)),
      color: palette.main,
      bgColor: palette.bg,
      lightColor: palette.light,
    };
  });
}

function AnimatedColorfulVerticalBar({
  item,
  maxMinutes,
  index,
  animKey,
}: {
  item: Top5AppStat;
  maxMinutes: number;
  index: number;
  animKey: number;
}) {
  const chartH = 132;
  const targetH = maxMinutes > 0 ? Math.max(18, Math.round((item.totalMinutes / maxMinutes) * chartH)) : 18;
  const barH = useSharedValue(0);

  useEffect(() => {
    barH.value = 0;
    barH.value = withDelay(120 + index * 90, withSpring(targetH, { damping: 16, stiffness: 110 }));
  }, [targetH, index, animKey]);

  const animBarStyle = useAnimatedStyle(() => ({
    height: barH.value,
  }));

  const shortName = item.appName.length > 8 ? item.appName.slice(0, 7) + "…" : item.appName;

  return (
    <View style={styles.colorBarCol}>
      <View style={[styles.colorBarTimePill, { backgroundColor: item.lightColor }]}>
        <Text style={[styles.colorBarTimeText, { color: item.color }]}>
          {formatMinutes(item.totalMinutes)}
        </Text>
      </View>

      <View style={[styles.colorBarSlot, { height: chartH }]}>
        <Animated.View
          style={[
            styles.colorBarFill,
            {
              backgroundColor: item.color,
              shadowColor: item.color,
            },
            animBarStyle,
          ]}
        >
          <View style={styles.colorBarRankCircle}>
            <Text style={[styles.colorBarRankText, { color: item.color }]}>#{index + 1}</Text>
          </View>
        </Animated.View>
      </View>

      <Text style={styles.colorBarAppName} numberOfLines={1}>
        {shortName}
      </Text>
      <Text style={[styles.colorBarShareText, { color: item.color }]}>
        {item.sharePct}%
      </Text>
    </View>
  );
}

function ColorfulTop5AppsChartCard({
  top5,
  range,
  onRangeChange,
  animKey,
}: {
  top5: Top5AppStat[];
  range: PeriodRange;
  onRangeChange: (r: PeriodRange) => void;
  animKey: number;
}) {
  const colors = useColors();
  const maxMinutes = Math.max(1, ...top5.map((a) => a.totalMinutes));
  const totalTop5Minutes = top5.reduce((s, a) => s + a.totalMinutes, 0);

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
      {/* Header + Weekly / Monthly / Yearly switcher */}
      <View style={styles.chartHeader}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={[styles.chartSubLabel, { color: colors.outline }]}>
            TOP 5 MOST USED · {range}
          </Text>
          <Text style={[styles.chartTitle, { color: colors.onSurface }]}>
            App Usage Chart
          </Text>
        </View>

        <View style={styles.top5RangePillsWrap}>
          {DATE_RANGES.map((r) => {
            const active = range === r;
            return (
              <TouchableOpacity
                key={r}
                style={[styles.top5RangePill, active && styles.top5RangePillActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  onRangeChange(r);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.top5RangePillText, active && { color: "#fff" }]}>
                  {r === "WEEK" ? "W" : r === "MONTH" ? "M" : "Y"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {top5.length === 0 ? (
        <EmptyChart colors={colors} />
      ) : (
        <>
          {/* Colorful 5-Bar Vertical Chart */}
          <View style={styles.colorVerticalChartBox}>
            <View style={styles.colorBarsRow}>
              {top5.map((item, idx) => (
                <AnimatedColorfulVerticalBar
                  key={`${item.appName}-${range}-${animKey}`}
                  item={item}
                  maxMinutes={maxMinutes}
                  index={idx}
                  animKey={animKey}
                />
              ))}
            </View>
          </View>

          {/* Colorful Multi-Segment Share Bar */}
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: colors.outline, letterSpacing: 1 }}>
                {range === "WEEK" ? "WEEKLY" : range === "MONTH" ? "MONTHLY" : "YEARLY"} SHARE DISTRIBUTION
              </Text>
              <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.onSurface }}>
                Total: {formatMinutes(totalTop5Minutes)}
              </Text>
            </View>
            <View style={styles.segmentedShareTrack}>
              {top5.map((item) => (
                <View
                  key={item.appName}
                  style={{
                    flex: Math.max(1, item.totalMinutes),
                    backgroundColor: item.color,
                    height: "100%",
                  }}
                />
              ))}
            </View>
          </View>

          {/* Colorful Legend & Breakdown List */}
          <View style={{ gap: 10, marginTop: 4 }}>
            {top5.map((item, idx) => (
              <View
                key={item.appName}
                style={[
                  styles.colorLegendRow,
                  { backgroundColor: item.bgColor },
                ]}
              >
                <View style={[styles.colorLegendDot, { backgroundColor: item.color }]}>
                  <Text style={styles.colorLegendRank}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.topAppName, { color: "#111827", fontFamily: "Inter_700Bold" }]}>
                    {item.appName}
                  </Text>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: item.color, letterSpacing: 0.6 }}>
                    {(item.category || "OTHER").toUpperCase()} · {item.sharePct}% OF TOP 5
                  </Text>
                </View>
                <View style={[styles.colorTimeBadge, { backgroundColor: item.color }]}>
                  <Text style={styles.colorTimeBadgeText}>
                    {formatMinutes(item.totalMinutes)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value }: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  value: string;
}) {
  const colors = useColors();
  const scale  = useSharedValue(1);
  const anim   = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View
      style={[styles.kpiCard, { backgroundColor: colors.card }, anim]}
      onTouchStart={() => { scale.value = withSpring(0.95, { damping: 12 }); }}
      onTouchEnd={()   => { scale.value = withSpring(1,    { damping: 12 }); }}
      onTouchCancel={() => { scale.value = withSpring(1,   { damping: 12 }); }}
    >
      <MaterialIcons name={icon} size={22} color={colors.onSurface} />
      <Text style={[styles.kpiLabel, { color: colors.outline }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color: colors.onSurface }]}>{value}</Text>
    </Animated.View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyChart({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.emptyChart}>
      <MaterialIcons name="bar-chart" size={36} color={colors.outline} />
      <Text style={[styles.emptyText, { color: colors.outline }]}>
        No usage logged yet.{"\n"}Use "Log App Usage" on the Home tab to get started.
      </Text>
    </View>
  );
}

// ─── 1. Health Index Block ────────────────────────────────────────────────────

function HealthIndexBlock({
  health,
  intervals,
  range,
}: {
  health: HealthStats;
  intervals: ChartIntervalStat[];
  range: PeriodRange;
}) {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<"focus" | "goals">("focus");
  const flipVal = useSharedValue(0); // 0 = focus, 1 = goals

  const handleSwitch = (tab: "focus" | "goals") => {
    if (tab === activeTab) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
    flipVal.value = withTiming(tab === "focus" ? 0 : 1, {
      duration: 480,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  };

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipVal.value, [0, 1], [0, 180]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      opacity: flipVal.value < 0.5 ? 1 : 0,
      zIndex: flipVal.value < 0.5 ? 2 : 1,
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipVal.value, [0, 1], [180, 360]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      opacity: flipVal.value >= 0.5 ? 1 : 0,
      zIndex: flipVal.value >= 0.5 ? 2 : 1,
    };
  });

  const toneColor =
    health.scoreLabel === "NEUTRAL"
      ? "#64748b"
      : health.score >= 80
      ? "#10b981"
      : health.score >= 65
      ? "#3b82f6"
      : health.score >= 50
      ? "#f59e0b"
      : "#ef4444";

  // Calculations for Focus Bar Chart
  const maxFocus = Math.max(
    1,
    ...intervals.map((it) => (it.focusCompleted || 0) + (it.focusForfeited || 0))
  );

  // Calculations for Goals Bar Chart (Done + Missed + Forfeited)
  const maxGoals = Math.max(
    1,
    ...intervals.map(
      (it) => (it.goalsCompleted || 0) + (it.goalsMissed || 0) + (it.goalsForfeited || 0)
    )
  );

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
      {/* Top Header Row with Switcher on Top Right Corner */}
      <View style={styles.scoreTopRow}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={[styles.chartSubLabel, { color: colors.outline }]}>HEALTH INDEX · {range}</Text>
          <Text style={[styles.chartTitle, { color: colors.onSurface }]}>Focus Score</Text>
        </View>

        {/* Focus / Goals Switcher Toggle */}
        <View style={styles.tabSwitchWrap}>
          <TouchableOpacity
            style={[styles.tabSwitchBtn, activeTab === "focus" && styles.tabSwitchBtnActive]}
            onPress={() => handleSwitch("focus")}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="timer"
              size={13}
              color={activeTab === "focus" ? "#fff" : colors.outline}
            />
            <Text
              style={[
                styles.tabSwitchText,
                activeTab === "focus" && styles.tabSwitchTextActive,
              ]}
            >
              Focus
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabSwitchBtn, activeTab === "goals" && styles.tabSwitchBtnActive]}
            onPress={() => handleSwitch("goals")}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="flag"
              size={13}
              color={activeTab === "goals" ? "#fff" : colors.outline}
            />
            <Text
              style={[
                styles.tabSwitchText,
                activeTab === "goals" && styles.tabSwitchTextActive,
              ]}
            >
              Goals
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Score & Tone Badge */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={styles.scoreNumBox}>
          <Text style={[styles.bigScoreText, { color: colors.onSurface }]}>{health.score}</Text>
          <Text style={[styles.scoreOutOf, { color: colors.outline }]}>/100</Text>
        </View>
        <View style={[styles.scoreBadge, { backgroundColor: `${toneColor}18`, borderColor: `${toneColor}40` }]}>
          <Text style={[styles.scoreBadgeText, { color: toneColor }]}>{health.scoreLabel}</Text>
        </View>
      </View>

      {/* Flip Area */}
      <View style={styles.flipContainer}>
        {/* FACE A: FOCUS SESSIONS */}
        <Animated.View
          style={[
            styles.flipFace,
            frontAnimatedStyle,
            { backgroundColor: colors.surfaceContainerHigh || "#fafafa" },
          ]}
        >
          <View style={styles.healthMetricHeader}>
            <View style={styles.metricTitleWrap}>
              <MaterialIcons name="timer" size={15} color={colors.onSurface} />
              <Text style={[styles.healthMetricTitle, { color: colors.onSurface }]}>FOCUS SESSIONS</Text>
            </View>
            <Text style={[styles.healthMetricRate, { color: toneColor }]}>
              {health.focusCompleted + health.focusForfeited > 0
                ? `${health.focusCompletionRate}% completed`
                : "No sessions yet"}
            </Text>
          </View>

          <View style={styles.healthPillsRow}>
            <View style={[styles.healthPill, { backgroundColor: "#e8f7ee" }]}>
              <MaterialIcons name="check-circle" size={13} color="#15803d" />
              <Text style={[styles.healthPillText, { color: "#15803d" }]}>
                {health.focusCompleted} Completed
              </Text>
            </View>
            <View
              style={[
                styles.healthPill,
                { backgroundColor: health.focusForfeited > 0 ? "#fdeceb" : "#f4f4f5" },
              ]}
            >
              <MaterialIcons
                name="cancel"
                size={13}
                color={health.focusForfeited > 0 ? "#ef4444" : "#71717a"}
              />
              <Text
                style={[
                  styles.healthPillText,
                  { color: health.focusForfeited > 0 ? "#ef4444" : "#71717a" },
                ]}
              >
                {health.focusForfeited} Forfeited
              </Text>
            </View>
          </View>

          {/* Focus Reactive Bar Chart */}
          <View style={styles.healthBarChartWrap}>
            <View style={styles.healthBarsRow}>
              {intervals.map((it) => {
                const completed = it.focusCompleted || 0;
                const forfeited = it.focusForfeited || 0;
                const total = completed + forfeited;
                const chartH = 48;
                const barH = total > 0 ? Math.max(12, Math.round((total / maxFocus) * chartH)) : 4;
                const compRatio = total > 0 ? completed / total : 1;
                const compH = Math.round(barH * compRatio);
                const forfH = barH - compH;

                return (
                  <View key={it.key} style={styles.healthBarCol}>
                    <Text style={styles.barCountText}>{total > 0 ? total : ""}</Text>
                    <View style={[styles.barTrackSlot, { height: chartH }]}>
                      {total === 0 ? (
                        <View style={styles.zeroBarDot} />
                      ) : (
                        <View style={[styles.stackedBarWrap, { height: barH }]}>
                          {forfeited > 0 && (
                            <View style={[styles.stackedForfeited, { height: forfH }]} />
                          )}
                          {completed > 0 && (
                            <View style={[styles.stackedCompleted, { height: compH }]} />
                          )}
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.barLabelText,
                        it.isCurrent && styles.currentBarLabel,
                      ]}
                    >
                      {it.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </Animated.View>

        {/* FACE B: GOALS PROGRESS */}
        <Animated.View
          style={[
            styles.flipFace,
            backAnimatedStyle,
            { backgroundColor: colors.surfaceContainerHigh || "#fafafa" },
          ]}
        >
          <View style={styles.healthMetricHeader}>
            <View style={styles.metricTitleWrap}>
              <MaterialIcons name="flag" size={15} color={colors.onSurface} />
              <Text style={[styles.healthMetricTitle, { color: colors.onSurface }]}>GOALS PROGRESS</Text>
            </View>
            <Text style={[styles.healthMetricRate, { color: toneColor }]}>
              {health.goalsCompleted + health.goalsMissed + health.goalsForfeited > 0
                ? `${health.goalSuccessRate}% achieved`
                : "No goals yet"}
            </Text>
          </View>

          <View style={styles.healthPillsRow}>
            <View style={[styles.healthPill, { backgroundColor: "#e8f7ee" }]}>
              <MaterialIcons name="check-circle" size={13} color="#15803d" />
              <Text style={[styles.healthPillText, { color: "#15803d" }]}>
                {health.goalsCompleted} Done
              </Text>
            </View>
            <View
              style={[
                styles.healthPill,
                { backgroundColor: health.goalsMissed > 0 ? "#fff4e5" : "#f4f4f5" },
              ]}
            >
              <MaterialIcons
                name="warning-amber"
                size={13}
                color={health.goalsMissed > 0 ? "#c2610c" : "#71717a"}
              />
              <Text
                style={[
                  styles.healthPillText,
                  { color: health.goalsMissed > 0 ? "#c2610c" : "#71717a" },
                ]}
              >
                {health.goalsMissed} Missed
              </Text>
            </View>
            <View
              style={[
                styles.healthPill,
                { backgroundColor: health.goalsForfeited > 0 ? "#fdeceb" : "#f4f4f5" },
              ]}
            >
              <MaterialIcons
                name="close"
                size={13}
                color={health.goalsForfeited > 0 ? "#ef4444" : "#71717a"}
              />
              <Text
                style={[
                  styles.healthPillText,
                  { color: health.goalsForfeited > 0 ? "#ef4444" : "#71717a" },
                ]}
              >
                {health.goalsForfeited} Forfeited
              </Text>
            </View>
          </View>

          {/* Goals Reactive Bar Chart */}
          <View style={styles.healthBarChartWrap}>
            <View style={styles.healthBarsRow}>
              {intervals.map((it) => {
                const completed = it.goalsCompleted || 0;
                const missed = it.goalsMissed || 0;
                const forfeited = it.goalsForfeited || 0;
                const total = completed + missed + forfeited;
                const chartH = 48;
                const barH = total > 0 ? Math.max(12, Math.round((total / maxGoals) * chartH)) : 4;
                const compH = total > 0 ? Math.round((completed / total) * barH) : 0;
                const forfH = total > 0 ? Math.round((forfeited / total) * barH) : 0;
                const missH = Math.max(0, barH - compH - forfH);

                return (
                  <View key={it.key} style={styles.healthBarCol}>
                    <Text style={styles.barCountText}>{total > 0 ? total : ""}</Text>
                    <View style={[styles.barTrackSlot, { height: chartH }]}>
                      {total === 0 ? (
                        <View style={styles.zeroBarDot} />
                      ) : (
                        <View style={[styles.stackedBarWrap, { height: barH }]}>
                          {forfeited > 0 && (
                            <View style={[styles.stackedForfeited, { height: Math.max(3, forfH) }]} />
                          )}
                          {missed > 0 && (
                            <View style={[styles.stackedMissed, { height: Math.max(3, missH) }]} />
                          )}
                          {completed > 0 && (
                            <View style={[styles.stackedCompleted, { height: Math.max(3, compH) }]} />
                          )}
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.barLabelText,
                        it.isCurrent && styles.currentBarLabel,
                      ]}
                    >
                      {it.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

// ─── 2. Goal Tracker Block (Simple, Clean Graph) ──────────────────────────────

function GoalTrackerBlock({
  tracker,
  range,
  onTargetChange,
}: {
  tracker: PeriodGoalTracker;
  range: PeriodRange;
  onTargetChange: (v: number) => void;
}) {
  const colors = useColors();
  const intervals = tracker.intervals;
  const maxIntervalTarget = intervals[0]?.targetMinutes || tracker.targetPerDay;
  const maxVal = Math.max(maxIntervalTarget * 1.35, ...intervals.map((it) => it.minutes), 120);
  const chartH = 130;
  const targetY = Math.max(8, Math.min(chartH - 8, chartH - (maxIntervalTarget / maxVal) * chartH));

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
      <View style={styles.chartHeader}>
        <View>
          <Text style={[styles.chartSubLabel, { color: colors.outline }]}>GOAL TRACKER · {range}</Text>
          <Text style={[styles.chartTitle, { color: colors.onSurface }]}>Screen Time vs Target</Text>
        </View>

        {/* Target Stepper */}
        <View style={[styles.targetStepper, { backgroundColor: colors.surfaceContainerHigh }]}>
          <TouchableOpacity
            hitSlop={8}
            onPress={() => onTargetChange(Math.max(MIN_TARGET, tracker.targetPerDay - TARGET_STEP))}
            style={styles.stepperBtn}
          >
            <MaterialIcons name="remove" size={16} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={[styles.targetValueText, { color: colors.onSurface }]}>
            {fmtMin(tracker.targetPerDay)}/d
          </Text>
          <TouchableOpacity
            hitSlop={8}
            onPress={() => onTargetChange(Math.min(MAX_TARGET, tracker.targetPerDay + TARGET_STEP))}
            style={styles.stepperBtn}
          >
            <MaterialIcons name="add" size={16} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Simple Graph Container */}
      <View style={{ height: chartH + 34, marginTop: 12, position: "relative" }}>
        {/* Dashed Target Line */}
        <View
          style={[
            styles.simpleTargetLine,
            {
              top: targetY,
              borderColor: "#ef4444",
            },
          ]}
        >
          <View style={styles.targetLineBadge}>
            <Text style={styles.targetLineText}>Goal {fmtShort(maxIntervalTarget)}</Text>
          </View>
        </View>

        {/* Clean Single Bars */}
        <View style={styles.simpleBarsRow}>
          {intervals.map((it) => {
            const barH = Math.min(chartH, Math.max(6, (it.minutes / maxVal) * chartH));
            return (
              <View key={it.key} style={styles.simpleBarCol}>
                {/* Over badge */}
                <View style={styles.overPillWrap}>
                  {it.isOver && it.minutes > 0 ? (
                    <Text style={styles.overPillText}>+{fmtShort(it.overMinutes)}</Text>
                  ) : null}
                </View>

                {/* Single Bar */}
                <View style={[styles.singleBarSlot, { height: chartH }]}>
                  <View
                    style={[
                      styles.simpleBarItem,
                      {
                        height: barH,
                        backgroundColor: it.isOver ? "#ef4444" : "#18181b",
                      },
                    ]}
                  />
                </View>

                {/* Label */}
                <Text
                  style={[
                    styles.simpleBarLabel,
                    it.isCurrent && styles.todayLabel,
                    { color: it.isCurrent ? colors.onSurface : colors.outline },
                  ]}
                >
                  {it.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Simple Summary Box: Daily Screen Time vs Target (Above target = Bad) */}
      <View style={[styles.trackerSummaryBox, { backgroundColor: colors.surfaceContainerHigh || "#fafafa" }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.summaryBoxLabel, { color: colors.outline }]}>
            DAILY SCREEN TIME VS TARGET
          </Text>
          <Text style={[styles.summaryBoxValue, { color: tracker.isOverallOver ? "#ef4444" : colors.onSurface }]}>
            {fmtMin(tracker.todayUsedMinutes > 0 ? tracker.todayUsedMinutes : tracker.dailyAvgUsedMinutes)} / {fmtMin(tracker.targetPerDay)}
          </Text>
          <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.outline, marginTop: 2 }}>
            Period total: {fmtMin(tracker.totalUsedMinutes)} · {tracker.daysExceeded}d exceeded target
          </Text>
        </View>

        <View
          style={[
            styles.summaryStatusBadge,
            {
              backgroundColor:
                tracker.totalUsedMinutes === 0
                  ? "#f4f4f5"
                  : tracker.isOverallOver
                    ? "#fdeceb"
                    : "#e8f7ee",
            },
          ]}
        >
          <MaterialIcons
            name={
              tracker.totalUsedMinutes === 0
                ? "remove-circle-outline"
                : tracker.isOverallOver
                  ? "warning"
                  : "check-circle"
            }
            size={14}
            color={
              tracker.totalUsedMinutes === 0
                ? "#71717a"
                : tracker.isOverallOver
                  ? "#ef4444"
                  : "#15803d"
            }
          />
          <Text
            style={[
              styles.summaryStatusText,
              {
                color:
                  tracker.totalUsedMinutes === 0
                    ? "#71717a"
                    : tracker.isOverallOver
                      ? "#ef4444"
                      : "#15803d",
              },
            ]}
          >
            {tracker.totalUsedMinutes === 0
              ? "No usage yet"
              : tracker.isOverallOver
                ? `BAD · +${fmtMin(tracker.diffMinutes)} over`
                : `GOOD · -${fmtMin(tracker.diffMinutes)} under`}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── 3. Hadaf Diagnostic Block (5 UI Cards) ──────────────────────────────────

function BedrockDiagnosticBlock({
  diagnostic,
  loading,
  range,
}: {
  diagnostic: BedrockDiagnosticResult | null;
  loading: boolean;
  range: PeriodRange;
}) {
  const colors = useColors();

  // Always extract or map exactly 5 diagnostic cards for unfiltered motivation
  const cards: Array<{ title: string; text: string }> = useMemo(() => {
    if (!diagnostic) return [];
    if (Array.isArray(diagnostic.cards) && diagnostic.cards.length >= 5) {
      return diagnostic.cards.slice(0, 5);
    }
    const defaultTitles = [
      "Focus Session Execution",
      "Distraction Bleed",
      "Goal Follow-Through",
      "Screen Time Boundary",
      "Unfiltered Mindset Kick",
    ];
    const points = Array.isArray(diagnostic.laggingPoints) ? diagnostic.laggingPoints : [];
    const result: Array<{ title: string; text: string }> = [];

    for (let i = 0; i < 5; i++) {
      const raw = points[i];
      if (raw) {
        const parts = raw.split(":");
        if (parts.length > 1) {
          result.push({ title: parts[0].trim(), text: parts.slice(1).join(":").trim() });
        } else {
          result.push({ title: defaultTitles[i] || `Diagnostic 0${i + 1}`, text: raw });
        }
      } else {
        result.push({
          title: defaultTitles[i],
          text:
            i === 4
              ? "Excuses produce zero results. Put your phone in another room, silence notifications, and lock in right now."
              : "Keep pushing your boundaries and track your progress daily.",
        });
      }
    }
    return result;
  }, [diagnostic]);

  const cardIcons: Array<React.ComponentProps<typeof MaterialIcons>["name"]> = [
    "timer",
    "block",
    "flag",
    "speed",
    "bolt",
  ];

  if (!loading && !diagnostic) {
    return null;
  }

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
      <View style={styles.chartHeader}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={styles.aiTagWrap}>
            <MaterialIcons name="bolt" size={13} color="#f59e0b" />
            <Text style={styles.aiTagText}>Hadaf Diagnostic</Text>
          </View>
          <Text style={[styles.chartTitle, { color: colors.onSurface, marginTop: 4 }]}>
            Diagnostic Board
          </Text>
        </View>
      </View>

      {loading && !diagnostic ? (
        <View style={styles.loadingDiagWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingDiagText, { color: colors.outline }]}>
            Analyzing screen time, goals & focus habits...
          </Text>
        </View>
      ) : diagnostic ? (
        <View style={styles.diagBody}>
          {/* Headline Banner */}
          <View style={styles.diagHeadlineBox}>
            <MaterialIcons name="warning" size={16} color="#ef4444" />
            <Text style={styles.diagHeadlineText}>{diagnostic.headline}</Text>
          </View>

          {/* Simple-words Summary */}
          <Text style={[styles.diagSummaryText, { color: colors.onSurface }]}>
            {diagnostic.summary}
          </Text>

          {/* 5 UI Cards for Unfiltered Motivation & Improvement */}
          <View style={styles.diagCardsList}>
            {cards.map((card, i) => (
              <View
                key={i}
                style={[
                  styles.diagCardItem,
                  { backgroundColor: colors.surfaceContainerHigh || "#fafafa" },
                ]}
              >
                <View style={styles.diagCardTop}>
                  <View style={styles.diagCardBadge}>
                    <Text style={styles.diagCardBadgeText}>{String(i + 1).padStart(2, "0")}</Text>
                  </View>
                  <MaterialIcons name={cardIcons[i % cardIcons.length]} size={14} color="#000" />
                  <Text style={[styles.diagCardTitle, { color: colors.onSurface }]}>
                    {card.title}
                  </Text>
                </View>
                <Text style={[styles.diagCardText, { color: colors.outline }]}>
                  {card.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Action Step Banner */}
          {diagnostic.actionStep ? (
            <View style={styles.actionStepBox}>
              <MaterialIcons name="flag" size={15} color="#15803d" />
              <Text style={styles.actionStepText}>
                <Text style={{ fontFamily: "Inter_700Bold" }}>Action: </Text>
                {diagnostic.actionStep}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.emptyText, { color: colors.outline }]}>
          Tap refresh to generate your Hadaf diagnostic.
        </Text>
      )}
    </View>
  );
}



// ─── Analytics Screen ─────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const colors      = useColors();
  const insets      = useSafeAreaInsets();
  const topPad      = isWeb ? 24 : insets.top;
  const sub         = useSubscription();
  const [activeRange, setActiveRange] = useState<PeriodRange>("WEEK");
  const [syncing, setSyncing] = useState(false);
  const [refreshAnimKey, setRefreshAnimKey] = useState(0);
  const [nativeWeeklyApps, setNativeWeeklyApps] = useState<{ appName: string; category?: string; totalMinutes: number }[]>([]);
  const [nativeMonthlyApps, setNativeMonthlyApps] = useState<{ appName: string; category?: string; totalMinutes: number }[]>([]);

  const queryClient = useQueryClient();
  const createUsageEntry = useCreateAppUsageEntry();

  const { data: rawEntries, isLoading: loadingEntries, refetch: refetchEntries } = useListAppUsageEntries();
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  const { data: rawSummary, isLoading: loadingSummary, refetch: refetchSummary } = useGetAppUsageSummary();
  const summary = Array.isArray(rawSummary) ? rawSummary : [];

  const [targetMin, setTargetMin] = useTargetMinutes();
  const { data: rawSessions, refetch: refetchSessions } = useListFocusSessions();
  const sessions = Array.isArray(rawSessions) ? rawSessions : [];
  const { data: rawGoals, refetch: refetchGoals } = useListGoals();
  const [localGoalsBackup, setLocalGoalsBackup] = useState<Goal[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadLocalGoalsBackup = React.useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem("@hadaf/local_goals_backup_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setLocalGoalsBackup(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    void loadLocalGoalsBackup();
  }, [loadLocalGoalsBackup]);

  // Merge server goals + locally cached goals (so completed & forfeited goals update on Analytics immediately!)
  const goals = useMemo(() => {
    const serverList = Array.isArray(rawGoals) ? rawGoals : [];
    const byId = new Map<string, Goal>();
    for (const g of serverList) byId.set(g.id, g);
    for (const lg of localGoalsBackup) {
      const matched = serverList.find(
        (s) => s.id === lg.id || (s.title === lg.title && s.startTime === lg.startTime)
      );
      if (matched) {
        // Prefer latest status if local goal was just completed/forfeited
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

  const insights = useMemo(
    () => computePeriodInsights(entries, sessions, goals, targetMin, activeRange),
    [entries, sessions, goals, targetMin, activeRange],
  );

  const [diagnostic, setDiagnostic] = useState<BedrockDiagnosticResult | null>(null);
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false);

  const fetchBedrockDiagnostic = React.useCallback(
    async (r: PeriodRange, silent = false) => {
      if (!silent) setLoadingDiagnostic(true);
      try {
        const res = await customFetch<any>("/api/analytics/diagnostic", {
          method: "POST",
          body: JSON.stringify({ range: r, targetMinutes: targetMin }),
        });
        if (res?.diagnostic) {
          setDiagnostic(res.diagnostic);
        }
      } catch (err) {
        console.warn("[Analytics] Diagnostic fetch error:", err);
      } finally {
        if (!silent) setLoadingDiagnostic(false);
      }
    },
    [targetMin]
  );

  // Fetch diagnostic on mount/range change + 1-minute automatic refresh
  useEffect(() => {
    fetchBedrockDiagnostic(activeRange, false);
    const interval = setInterval(() => {
      fetchBedrockDiagnostic(activeRange, true);
    }, 60_000);
    return () => clearInterval(interval);
  }, [activeRange, fetchBedrockDiagnostic]);

  const syncStats = React.useCallback(async () => {
    if (Platform.OS === "web") return;
    const perm = hasUsagePermission();
    if (!perm) return;

    setSyncing(true);
    try {
      const [statsToday, statsWeek, statsMonth] = await Promise.all([
        getDeviceUsageStats(1),
        getDeviceUsageStats(7),
        getDeviceUsageStats(30),
      ]);
      setNativeWeeklyApps(statsWeek);
      setNativeMonthlyApps(statsMonth);

      const activeApps = statsToday.filter((a) => a.totalMinutes > 0).slice(0, 8);
      if (activeApps.length > 0) {
        await Promise.allSettled(
          activeApps.map((app) =>
            customFetch("/api/app-usage", {
              method: "POST",
              body: JSON.stringify({
                appName: app.appName,
                category: app.category ?? undefined,
                durationMinutes: app.totalMinutes,
              }),
            })
          )
        );
        await queryClient.invalidateQueries({ queryKey: getListAppUsageEntriesQueryKey() });
        await queryClient.invalidateQueries({ queryKey: getGetAppUsageSummaryQueryKey() });
        void refetchEntries();
        void refetchSummary();
      }
    } catch (err: any) {
      console.warn("[Analytics] Error during stats sync:", err.message || err);
    } finally {
      setSyncing(false);
    }
  }, [queryClient, refetchEntries, refetchSummary]);

  useFocusEffect(
    React.useCallback(() => {
      void loadLocalGoalsBackup();
      void refetchGoals();
      void refetchSessions();
      void refetchEntries();
      void refetchSummary();
      void syncStats();
    }, [loadLocalGoalsBackup, refetchGoals, refetchSessions, refetchEntries, refetchSummary, syncStats])
  );

  const handlePullRefresh = React.useCallback(async () => {
    setRefreshing(true);
    Haptics.selectionAsync();
    try {
      // Trigger device stats sync in background and immediately refresh all Analytics charts/cards (EXCEPT AI Diagnostic)
      void syncStats();
      await Promise.allSettled([
        loadLocalGoalsBackup(),
        refetchEntries(),
        refetchSummary(),
        refetchSessions(),
        refetchGoals(),
      ]);
    } finally {
      setRefreshing(false);
      setRefreshAnimKey((k) => k + 1);
    }
  }, [
    loadLocalGoalsBackup,
    syncStats,
    refetchEntries,
    refetchSummary,
    refetchSessions,
    refetchGoals,
  ]);

  const isLoading = loadingEntries || loadingSummary;
  const hasData   = entries.length > 0;

  const { data: chartData, labels: chartLabels } = useMemo(
    () => buildChartData(entries, activeRange),
    [entries, activeRange],
  );

  const hasChartData = chartData.some(v => v > 0);

  const { peakTime, dailyAvg, topApp } = useMemo(
    () => computeKpis(entries, summary),
    [entries, summary],
  );

  const top5AppsForRange = useMemo(
    () => buildTop5AppsForRange(entries, summary, nativeWeeklyApps, nativeMonthlyApps, activeRange),
    [entries, summary, nativeWeeklyApps, nativeMonthlyApps, activeRange]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />

      <ScrollView scrollEventThrottle={16} decelerationRate="normal" 
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 16, paddingBottom: isWeb ? 34 + 84 : 90 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handlePullRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Header */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(0).springify()} style={styles.headerRow}>
          <MaterialIcons name="bar-chart" size={26} color={colors.onSurface} />
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>ANALYTICS</Text>
        </Animated.View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <HadafInlineLoader message="Analyzing your focus & goals..." />
          </View>
        ) : (
          <>
            {/* Range tabs */}
            <Animated.View
              key={`range-bar-${refreshAnimKey}`}
              entering={isWeb ? undefined : FadeInDown.delay(40).springify()}
              style={[styles.rangeBar, { backgroundColor: colors.surfaceContainerHigh }]}
            >
              {DATE_RANGES.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rangeBtn, activeRange === r && { backgroundColor: colors.primary }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setActiveRange(r);
                    setRefreshAnimKey((k) => k + 1);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.rangeBtnText,
                    {
                      color: activeRange === r ? "#fff" : colors.outline,
                      fontFamily: activeRange === r ? "Inter_700Bold" : "Inter_500Medium",
                    },
                  ]}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </Animated.View>

            {/* 1. Health Index Block (Completed vs Forfeited Focus & Goals) */}
            <Animated.View
              key={`health-idx-${refreshAnimKey}`}
              entering={isWeb ? undefined : FadeInDown.delay(80).springify()}
            >
              <HealthIndexBlock
                health={insights.health}
                intervals={insights.tracker.intervals}
                range={activeRange}
              />
            </Animated.View>

            {/* 2. Goal Tracker Block (Simple, Clean Screen vs Target Graph) */}
            <Animated.View
              key={`goal-tracker-${refreshAnimKey}`}
              entering={isWeb ? undefined : FadeInDown.delay(120).springify()}
            >
              <GoalTrackerBlock
                tracker={insights.tracker}
                range={activeRange}
                onTargetChange={setTargetMin}
              />
            </Animated.View>

            {/* 3. Diagnostic Block (AWS Bedrock LLM — auto-refreshes once every minute, not remounted on pull-to-refresh) */}
            <Animated.View entering={isWeb ? undefined : FadeInDown.delay(160).springify()}>
              <BedrockDiagnosticBlock
                diagnostic={diagnostic}
                loading={loadingDiagnostic}
                range={activeRange}
              />
            </Animated.View>

            {/* 2-column KPIs */}
            <Animated.View
              key={`kpis-${refreshAnimKey}`}
              entering={isWeb ? undefined : FadeInDown.delay(180).springify()}
              style={[styles.kpiRow, { gap: 14 }]}
            >
              <KpiCard icon="alarm" label="PEAK USAGE" value={peakTime} />
              <KpiCard icon="timer" label="DAILY AVG" value={dailyAvg} />
            </Animated.View>

            {/* Activity chart */}
            <Animated.View
              key={`activity-flow-${refreshAnimKey}`}
              entering={isWeb ? undefined : FadeInDown.delay(220).springify()}
              style={[styles.chartCard, { backgroundColor: colors.card }]}
            >
              <View style={styles.chartHeader}>
                <View>
                  <Text style={[styles.chartSubLabel, { color: colors.outline }]}>USAGE TRENDS</Text>
                  <Text style={[styles.chartTitle, { color: colors.onSurface }]}>Activity Flow</Text>
                </View>
                <View style={[styles.yearlyBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <Text style={[styles.yearlyBadgeText, { color: colors.onSurface }]}>{activeRange}</Text>
                </View>
              </View>

              {hasChartData ? (
                <ActivityChart data={chartData} labels={chartLabels} />
              ) : (
                <EmptyChart colors={colors} />
              )}
            </Animated.View>

            {/* Colorful Weekly / Monthly / Yearly Top 5 Most Used Apps Chart (Point 3) */}
            <Animated.View
              key={`top5-chart-${refreshAnimKey}`}
              entering={isWeb ? undefined : FadeInDown.delay(270).springify()}
            >
              <ColorfulTop5AppsChartCard
                top5={top5AppsForRange}
                range={activeRange}
                onRangeChange={(r) => {
                  setActiveRange(r);
                  setRefreshAnimKey((k) => k + 1);
                }}
                animKey={refreshAnimKey}
              />
            </Animated.View>
          </>
        )}
      </ScrollView>

      {sub.analyticsLocked && (
        <LockedOverlay bottomOffset={isWeb ? 84 : 62 + insets.bottom} />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, gap: 18 },

  headerRow:  { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4 },
  headerTitle:{ fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: 1 },

  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },

  rangeBar: { flexDirection: "row", borderRadius: 40, padding: 4, gap: 4 },
  rangeBtn: { flex: 1, paddingVertical: 10, borderRadius: 36, alignItems: "center" },
  rangeBtnText: { fontSize: 13, letterSpacing: 0.8 },

  kpiRow:  { flexDirection: "row", gap: 10 },
  kpiCard: {
    flex: 1, borderRadius: 20, padding: 14, gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 6,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.05)",
  },
  kpiLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  kpiValue: { fontSize: 15, fontFamily: "Inter_700Bold" },

  chartCard: {
    borderRadius: 28, padding: 20, gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.13, shadowRadius: 20, elevation: 7,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.05)",
  },
  chartHeader:    { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  chartSubLabel:  { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  chartTitle:     { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3, marginTop: 2 },
  yearlyBadge:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  yearlyBadgeText:{ fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },

  // Colorful Top 5 Most Used Apps Chart Styles
  top5RangePillsWrap: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    padding: 3,
    gap: 3,
  },
  top5RangePill: {
    width: 30,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  top5RangePillActive: {
    backgroundColor: "#000000",
  },
  top5RangePillText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#64748b",
  },
  colorVerticalChartBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  colorBarsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    gap: 6,
  },
  colorBarCol: {
    flex: 1,
    alignItems: "center",
    gap: 5,
  },
  colorBarTimePill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  colorBarTimeText: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
  },
  colorBarSlot: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  colorBarFill: {
    width: 34,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  colorBarRankCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  colorBarRankText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  colorBarAppName: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    color: "#1e293b",
    marginTop: 2,
  },
  colorBarShareText: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
  },
  segmentedShareTrack: {
    height: 12,
    borderRadius: 6,
    flexDirection: "row",
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
    gap: 2,
  },
  colorLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  colorLegendDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  colorLegendRank: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  colorTimeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  colorTimeBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },

  topAppRow:      { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  topAppIcon:     { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  topAppName:     { fontSize: 14, fontFamily: "Inter_500Medium" },
  topAppCategory: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  topAppTime:     { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  emptyChart: {
    height: 160, alignItems: "center", justifyContent: "center", gap: 12,
  },
  emptyCard: {
    alignItems: "center", gap: 12, paddingVertical: 32,
  },
  emptyHeading: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyText:    { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  // Top Apps Modal

  // Health Index Block Styles
  scoreTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  scoreNumBox: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
    marginTop: 2,
  },
  bigScoreText: {
    fontSize: 42,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
  },
  scoreOutOf: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  healthMetricBox: {
    padding: 12,
    borderRadius: 14,
    gap: 8,
    marginTop: 6,
  },
  healthMetricHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  healthMetricTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  healthMetricRate: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  healthPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  healthPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  healthPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  healthProgressBar: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  healthProgressFill: {
    height: "100%",
    borderRadius: 3,
  },

  // Goal Tracker Block Styles
  targetStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  stepperBtn: {
    padding: 2,
  },
  targetValueText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  simpleTargetLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1.5,
    borderStyle: "dashed",
    zIndex: 2,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  targetLineBadge: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginTop: -9,
    marginRight: 4,
  },
  targetLineText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  simpleBarsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: "100%",
  },
  simpleBarCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
  },
  singleBarSlot: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    width: "100%",
  },
  simpleBarItem: {
    width: 14,
    borderRadius: 7,
  },
  overPillWrap: {
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  overPillText: {
    color: "#ef4444",
    fontSize: 8,
    fontFamily: "Inter_700Bold",
  },
  simpleBarLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  todayLabel: {
    fontFamily: "Inter_700Bold",
    textDecorationLine: "underline",
  },
  trackerSummaryBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  summaryBoxLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  summaryBoxValue: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  summaryStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  summaryStatusText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },

  // Bedrock Diagnostic Block Styles
  aiTagWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  aiTagText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#3b82f6",
    letterSpacing: 0.8,
  },
  refreshDiagnosticBtn: {
    padding: 4,
  },
  loadingDiagWrap: {
    paddingVertical: 24,
    alignItems: "center",
    gap: 10,
  },
  loadingDiagText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  diagBody: {
    gap: 12,
  },
  diagHeadlineBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    padding: 10,
    borderRadius: 12,
  },
  diagHeadlineText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#ef4444",
    flex: 1,
  },
  diagSummaryText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 19,
  },
  diagPointsList: {
    gap: 6,
  },
  diagPointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  diagPointDot: {
    marginTop: 1,
  },
  diagPointText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 17,
  },
  actionStepBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#e8f7ee",
    padding: 10,
    borderRadius: 12,
  },
  actionStepText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#15803d",
    flex: 1,
  },

  // Switcher Tab Styles
  tabSwitchWrap: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.06)",
    padding: 3,
    borderRadius: 20,
    gap: 3,
  },
  tabSwitchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  tabSwitchBtnActive: {
    backgroundColor: "#000",
  },
  tabSwitchText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#666",
  },
  tabSwitchTextActive: {
    color: "#fff",
  },

  // Flip Container & Faces
  flipContainer: {
    height: 182,
    position: "relative",
    marginTop: 6,
    overflow: "hidden",
  },
  flipFace: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    padding: 10,
    gap: 6,
    backfaceVisibility: "hidden",
    width: "100%",
    height: "100%",
  },

  // Health Bar Charts
  healthBarChartWrap: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  healthBarsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 72,
  },
  healthBarCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barCountText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#444",
    height: 12,
    marginBottom: 2,
  },
  barTrackSlot: {
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  zeroBarDot: {
    width: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  stackedBarWrap: {
    width: 14,
    borderRadius: 7,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  stackedCompleted: {
    width: "100%",
    backgroundColor: "#10b981",
  },
  stackedForfeited: {
    width: "100%",
    backgroundColor: "#ef4444",
  },
  stackedMissed: {
    width: "100%",
    backgroundColor: "#f59e0b",
  },
  barLabelText: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: "#888",
    marginTop: 4,
  },
  currentBarLabel: {
    fontFamily: "Inter_700Bold",
    color: "#000",
  },

  // 5 Diagnostic UI Cards
  diagCardsList: {
    gap: 8,
  },
  diagCardItem: {
    borderRadius: 14,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  diagCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  diagCardBadge: {
    backgroundColor: "#000",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  diagCardBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  diagCardTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
    flex: 1,
  },
  diagCardText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },

  modalOuter: { flex: 1, alignItems: "center", justifyContent: "center" },
  modalSheet: {
    width: SCREEN_W * 0.88,
    borderRadius: 24, padding: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18, shadowRadius: 30, elevation: 14,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle:  { fontSize: 18, fontFamily: "Inter_700Bold" },
});
