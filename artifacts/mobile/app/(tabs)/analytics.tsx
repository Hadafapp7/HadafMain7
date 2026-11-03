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
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
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

// ─── Top Apps Modal ───────────────────────────────────────────────────────────

function TopAppsModal({
  visible,
  onClose,
  apps,
}: {
  visible: boolean;
  onClose: () => void;
  apps: AppUsageSummaryItem[];
}) {
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
    opacity: opacity.value,
  }));

  const appsList = Array.isArray(apps) ? apps : [];

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.modalOuter}>
        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <Animated.View
          style={[styles.modalSheet, { backgroundColor: colors.card }, sheetStyle]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Top Apps</Text>
            <TouchableOpacity onPress={onClose} hitSlop={14}>
              <MaterialIcons name="close" size={20} color={colors.outline} />
            </TouchableOpacity>
          </View>

          {appsList.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.outline }]}>
              No app usage logged yet.
            </Text>
          ) : (
            appsList.map((app, i) => (
              <View
                key={app.appName}
                style={[
                  styles.topAppRow,
                  i < appsList.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerHigh },
                ]}
              >
                <View style={[styles.topAppIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <MaterialIcons name={categoryIcon(app.category)} size={20} color={colors.onSurface} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.topAppName, { color: colors.onSurface }]}>{app.appName}</Text>
                  {app.category ? (
                    <Text style={[styles.topAppCategory, { color: colors.outline }]}>{app.category}</Text>
                  ) : null}
                </View>
                <Text style={[styles.topAppTime, { color: colors.onSurface }]}>
                  {formatMinutes(app.totalMinutes)}
                </Text>
              </View>
            ))
          )}
        </Animated.View>
      </View>
    </Modal>
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
  range,
}: {
  health: HealthStats;
  range: PeriodRange;
}) {
  const colors = useColors();

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

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
      <View style={styles.scoreTopRow}>
        <View>
          <Text style={[styles.chartSubLabel, { color: colors.outline }]}>HEALTH INDEX · {range}</Text>
          <Text style={[styles.chartTitle, { color: colors.onSurface }]}>Focus Score</Text>
        </View>
        <View style={[styles.scoreBadge, { backgroundColor: `${toneColor}18`, borderColor: `${toneColor}40` }]}>
          <Text style={[styles.scoreBadgeText, { color: toneColor }]}>{health.scoreLabel}</Text>
        </View>
      </View>

      {/* Main Score Num */}
      <View style={styles.scoreNumBox}>
        <Text style={[styles.bigScoreText, { color: colors.onSurface }]}>{health.score}</Text>
        <Text style={[styles.scoreOutOf, { color: colors.outline }]}>/100</Text>
      </View>

      {/* Focus Sessions Completed vs Forfeited */}
      <View style={[styles.healthMetricBox, { backgroundColor: colors.surfaceContainerHigh || "#fafafa" }]}>
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
            <MaterialIcons name="check-circle" size={14} color="#15803d" />
            <Text style={[styles.healthPillText, { color: "#15803d" }]}>
              {health.focusCompleted} Completed
            </Text>
          </View>

          <View style={[styles.healthPill, { backgroundColor: health.focusForfeited > 0 ? "#fdeceb" : "#f4f4f5" }]}>
            <MaterialIcons
              name="cancel"
              size={14}
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

        {/* Progress Bar */}
        <View style={[styles.healthProgressBar, { backgroundColor: "#e4e4e7" }]}>
          <View
            style={[
              styles.healthProgressFill,
              {
                width: `${health.focusCompletionRate}%`,
                backgroundColor: health.focusCompletionRate >= 70 ? "#10b981" : "#f59e0b",
              },
            ]}
          />
        </View>
      </View>

      {/* Goals Completed vs Missed vs Forfeited */}
      <View style={[styles.healthMetricBox, { backgroundColor: colors.surfaceContainerHigh || "#fafafa" }]}>
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
            <MaterialIcons name="check-circle" size={14} color="#15803d" />
            <Text style={[styles.healthPillText, { color: "#15803d" }]}>
              {health.goalsCompleted} Done
            </Text>
          </View>

          <View style={[styles.healthPill, { backgroundColor: health.goalsMissed > 0 ? "#fff4e5" : "#f4f4f5" }]}>
            <MaterialIcons
              name="warning-amber"
              size={14}
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

          <View style={[styles.healthPill, { backgroundColor: health.goalsForfeited > 0 ? "#fdeceb" : "#f4f4f5" }]}>
            <MaterialIcons
              name="close"
              size={14}
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

        {/* Progress Bar */}
        <View style={[styles.healthProgressBar, { backgroundColor: "#e4e4e7" }]}>
          <View
            style={[
              styles.healthProgressFill,
              {
                width: `${health.goalSuccessRate}%`,
                backgroundColor: health.goalSuccessRate >= 70 ? "#10b981" : "#f59e0b",
              },
            ]}
          />
        </View>
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

      {/* Simple Summary Box */}
      <View style={[styles.trackerSummaryBox, { backgroundColor: colors.surfaceContainerHigh || "#fafafa" }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.summaryBoxLabel, { color: colors.outline }]}>PERIOD TOTAL</Text>
          <Text style={[styles.summaryBoxValue, { color: colors.onSurface }]}>
            {fmtMin(tracker.totalUsedMinutes)} / {fmtMin(tracker.totalTargetMinutes)}
          </Text>
        </View>

        <View
          style={[
            styles.summaryStatusBadge,
            { backgroundColor: tracker.isOverallOver ? "#fdeceb" : "#e8f7ee" },
          ]}
        >
          <MaterialIcons
            name={tracker.isOverallOver ? "error-outline" : "check-circle"}
            size={14}
            color={tracker.isOverallOver ? "#ef4444" : "#15803d"}
          />
          <Text
            style={[
              styles.summaryStatusText,
              { color: tracker.isOverallOver ? "#ef4444" : "#15803d" },
            ]}
          >
            {tracker.isOverallOver
              ? `+${fmtMin(tracker.diffMinutes)} over goal`
              : `-${fmtMin(tracker.diffMinutes)} under goal`}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── 3. Bedrock Diagnostic Block (LLM Powered) ────────────────────────────────

function BedrockDiagnosticBlock({
  diagnostic,
  loading,
  onRefresh,
  range,
}: {
  diagnostic: BedrockDiagnosticResult | null;
  loading: boolean;
  onRefresh: () => void;
  range: PeriodRange;
}) {
  const colors = useColors();

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
      <View style={styles.chartHeader}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={styles.aiTagWrap}>
            <MaterialIcons name="auto-awesome" size={13} color="#3b82f6" />
            <Text style={styles.aiTagText}>AI DIAGNOSTIC · BEDROCK LLM</Text>
          </View>
          <Text style={[styles.chartTitle, { color: colors.onSurface, marginTop: 4 }]}>
            Where You're Lagging
          </Text>
        </View>

        <TouchableOpacity
          onPress={onRefresh}
          hitSlop={8}
          disabled={loading}
          style={styles.refreshDiagnosticBtn}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MaterialIcons name="refresh" size={18} color={colors.outline} />
          )}
        </TouchableOpacity>
      </View>

      {loading && !diagnostic ? (
        <View style={styles.loadingDiagWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingDiagText, { color: colors.outline }]}>
            Analyzing screen time, goals & focus habits with AWS Bedrock...
          </Text>
        </View>
      ) : diagnostic ? (
        <View style={styles.diagBody}>
          {/* Headline Banner */}
          <View style={styles.diagHeadlineBox}>
            <MaterialIcons name="insights" size={18} color="#ef4444" />
            <Text style={styles.diagHeadlineText}>{diagnostic.headline}</Text>
          </View>

          {/* Simple-words Summary */}
          <Text style={[styles.diagSummaryText, { color: colors.onSurface }]}>
            {diagnostic.summary}
          </Text>

          {/* Lagging Leaks / Points */}
          {diagnostic.laggingPoints.length > 0 && (
            <View style={styles.diagPointsList}>
              {diagnostic.laggingPoints.map((point, i) => (
                <View key={i} style={styles.diagPointRow}>
                  <View style={styles.diagPointDot}>
                    <MaterialIcons name="arrow-right" size={16} color="#ef4444" />
                  </View>
                  <Text style={[styles.diagPointText, { color: colors.outline }]}>
                    {point}
                  </Text>
                </View>
              ))}
            </View>
          )}

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
          Tap refresh to generate an AI diagnosis with Bedrock.
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
  const [showTopApps, setShowTopApps] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const queryClient = useQueryClient();
  const createUsageEntry = useCreateAppUsageEntry();

  const { data: rawEntries, isLoading: loadingEntries, refetch: refetchEntries } = useListAppUsageEntries();
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  const { data: rawSummary, isLoading: loadingSummary, refetch: refetchSummary } = useGetAppUsageSummary();
  const summary = Array.isArray(rawSummary) ? rawSummary : [];

  const [targetMin, setTargetMin] = useTargetMinutes();
  const { data: rawSessions } = useListFocusSessions();
  const sessions = Array.isArray(rawSessions) ? rawSessions : [];
  const { data: rawGoals } = useListGoals();
  const goals = Array.isArray(rawGoals) ? rawGoals : [];

  const insights = useMemo(
    () => computePeriodInsights(entries, sessions, goals, targetMin, activeRange),
    [entries, sessions, goals, targetMin, activeRange],
  );

  const [diagnostic, setDiagnostic] = useState<BedrockDiagnosticResult | null>(null);
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false);

  const fetchBedrockDiagnostic = React.useCallback(
    async (r: PeriodRange) => {
      setLoadingDiagnostic(true);
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
        setLoadingDiagnostic(false);
      }
    },
    [targetMin]
  );

  useEffect(() => {
    fetchBedrockDiagnostic(activeRange);
  }, [activeRange, fetchBedrockDiagnostic]);

  const syncStats = React.useCallback(async () => {
    if (Platform.OS === "web") return;
    console.log("[Analytics] Checking native usage permission for sync...");
    const perm = hasUsagePermission();
    if (!perm) {
      console.log("[Analytics] Native permission not granted. Skipping auto-sync.");
      return;
    }

    setSyncing(true);
    console.log("[Analytics] Syncing real-time device stats to server...");
    try {
      const stats = await getDeviceUsageStats(1); // Today's stats
      console.log(`[Analytics] Fetched ${stats.length} daily stats from device`);
      if (stats.length > 0) {
        for (const app of stats) {
          if (app.totalMinutes <= 0) {
            console.log(`[Analytics] Skipping sync for ${app.appName} because usage is 0m`);
            continue;
          }
          try {
            console.log(`[Analytics] Syncing ${app.appName} (${app.totalMinutes}m)`);
            await createUsageEntry.mutateAsync({
              data: {
                appName: app.appName,
                category: app.category ?? undefined,
                durationMinutes: app.totalMinutes,
              }
            });
          } catch (e: any) {
            console.warn(`[Analytics] Failed to sync ${app.appName}:`, e.message || e);
          }
        }
        console.log("[Analytics] Sync completed. Invalidate and refetching server summary...");
        await queryClient.invalidateQueries({ queryKey: getListAppUsageEntriesQueryKey() });
        await queryClient.invalidateQueries({ queryKey: getGetAppUsageSummaryQueryKey() });
        refetchEntries();
        refetchSummary();
      }
    } catch (err: any) {
      console.warn("[Analytics] Error during stats sync:", err.message || err);
    } finally {
      setSyncing(false);
      console.log("[Analytics] Sync complete.");
    }
  }, [createUsageEntry, queryClient, refetchEntries, refetchSummary]);

  useFocusEffect(
    React.useCallback(() => {
      syncStats();
    }, [])
  );

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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />
      <TopAppsModal
        visible={showTopApps}
        onClose={() => setShowTopApps(false)}
        apps={summary}
      />

      <ScrollView scrollEventThrottle={16} decelerationRate="normal" removeClippedSubviews={true}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 16, paddingBottom: isWeb ? 34 + 84 : 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(0).springify()} style={styles.headerRow}>
          <MaterialIcons name="bar-chart" size={26} color={colors.onSurface} />
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>ANALYTICS</Text>
        </Animated.View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <>
            {/* Range tabs */}
            <Animated.View
              entering={isWeb ? undefined : FadeInDown.delay(60).springify()}
              style={[styles.rangeBar, { backgroundColor: colors.surfaceContainerHigh }]}
            >
              {DATE_RANGES.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rangeBtn, activeRange === r && { backgroundColor: colors.primary }]}
                  onPress={() => setActiveRange(r)}
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
            <Animated.View entering={isWeb ? undefined : FadeInDown.delay(100).springify()}>
              <HealthIndexBlock health={insights.health} range={activeRange} />
            </Animated.View>

            {/* 2. Goal Tracker Block (Simple, Clean Screen vs Target Graph) */}
            <Animated.View entering={isWeb ? undefined : FadeInDown.delay(130).springify()}>
              <GoalTrackerBlock
                tracker={insights.tracker}
                range={activeRange}
                onTargetChange={setTargetMin}
              />
            </Animated.View>

            {/* 3. Diagnostic Block (AWS Bedrock LLM) */}
            <Animated.View entering={isWeb ? undefined : FadeInDown.delay(160).springify()}>
              <BedrockDiagnosticBlock
                diagnostic={diagnostic}
                loading={loadingDiagnostic}
                onRefresh={() => fetchBedrockDiagnostic(activeRange)}
                range={activeRange}
              />
            </Animated.View>

            {/* 2-column KPIs */}
            <Animated.View entering={isWeb ? undefined : FadeInDown.delay(180).springify()} style={[styles.kpiRow, { gap: 14 }]}>
              <KpiCard icon="alarm" label="PEAK USAGE" value={peakTime} />
              <KpiCard icon="timer" label="DAILY AVG" value={dailyAvg} />
            </Animated.View>

            {/* Activity chart */}
            <Animated.View
              entering={isWeb ? undefined : FadeInDown.delay(240).springify()}
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

            {/* Per-app breakdown card */}
            {summary.length > 0 && (
              <Animated.View
                entering={isWeb ? undefined : FadeInDown.delay(300).springify()}
                style={[styles.chartCard, { backgroundColor: colors.card }]}
              >
                <View style={styles.chartHeader}>
                  <View>
                    <Text style={[styles.chartSubLabel, { color: colors.outline }]}>BREAKDOWN</Text>
                    <Text style={[styles.chartTitle, { color: colors.onSurface }]}>Top Apps</Text>
                  </View>
                  {summary.length > 3 && (
                    <TouchableOpacity
                      style={[styles.yearlyBadge, { backgroundColor: colors.surfaceContainerHigh }]}
                      onPress={() => setShowTopApps(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.yearlyBadgeText, { color: colors.onSurface }]}>See all</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {summary.slice(0, 5).map((app, i) => (
                  <View
                    key={app.appName}
                    style={[
                      styles.topAppRow,
                      i < Math.min(summary.length, 5) - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.surfaceContainerHigh,
                      },
                    ]}
                  >
                    <View style={[styles.topAppIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
                      <MaterialIcons name={categoryIcon(app.category)} size={20} color={colors.onSurface} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.topAppName, { color: colors.onSurface }]}>{app.appName}</Text>
                      {app.category ? (
                        <Text style={[styles.topAppCategory, { color: colors.outline }]}>{app.category}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.topAppTime, { color: colors.onSurface }]}>
                      {formatMinutes(app.totalMinutes)}
                    </Text>
                  </View>
                ))}
              </Animated.View>
            )}

            
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
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 16, elevation: 2,
  },
  kpiLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  kpiValue: { fontSize: 15, fontFamily: "Inter_700Bold" },

  chartCard: {
    borderRadius: 28, padding: 20, gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 24, elevation: 2,
  },
  chartHeader:    { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  chartSubLabel:  { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  chartTitle:     { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3, marginTop: 2 },
  yearlyBadge:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  yearlyBadgeText:{ fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },

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
