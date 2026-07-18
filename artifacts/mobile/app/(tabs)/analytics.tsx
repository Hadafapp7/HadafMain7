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
  type AppUsageEntry,
  type AppUsageSummaryItem,
  useGetAppUsageSummary,
  useListAppUsageEntries,
} from "@workspace/api-client-react";

const isWeb    = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;

const DATE_RANGES = ["WEEK", "MONTH", "YEAR"];

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

          {apps.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.outline }]}>
              No app usage logged yet.
            </Text>
          ) : (
            apps.map((app, i) => (
              <View
                key={app.appName}
                style={[
                  styles.topAppRow,
                  i < apps.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerHigh },
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

// ─── Analytics Screen ─────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const colors      = useColors();
  const insets      = useSafeAreaInsets();
  const topPad      = isWeb ? 24 : insets.top;
  const [activeRange, setActiveRange] = useState("WEEK");
  const [showTopApps, setShowTopApps] = useState(false);

  const { data: entries = [], isLoading: loadingEntries } = useListAppUsageEntries();
  const { data: summary = [], isLoading: loadingSummary } = useGetAppUsageSummary();

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

      <ScrollView
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

            {/* 3-column KPIs */}
            <Animated.View entering={isWeb ? undefined : FadeInDown.delay(180).springify()} style={styles.kpiRow}>
              <KpiCard icon="alarm"  label="PEAK TIME"  value={peakTime} />
              <KpiCard icon="timer"  label="DAILY AVG"  value={dailyAvg} />
              <KpiCard icon="apps"   label="TOP APP"    value={hasData ? topApp : "—"} />
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

            {/* Empty state when no data at all */}
            {!hasData && (
              <Animated.View
                entering={isWeb ? undefined : FadeInDown.delay(360).springify()}
                style={[styles.chartCard, styles.emptyCard, { backgroundColor: colors.card }]}
              >
                <MaterialIcons name="smartphone" size={40} color={colors.outline} />
                <Text style={[styles.emptyHeading, { color: colors.onSurface }]}>No screen time yet</Text>
                <Text style={[styles.emptyText, { color: colors.outline }]}>
                  Log your first app session from the Home tab to see your usage data here.
                </Text>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>
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
