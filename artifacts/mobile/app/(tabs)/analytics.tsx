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

const isWeb    = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;

const DATE_RANGES = ["WEEK", "MONTH", "YEAR"];

// ─── Chart data ───────────────────────────────────────────────────────────────

const CHART_DATASETS: Record<string, number[]> = {
  WEEK:  [1.2, 1.8, 3.7, 2.3, 2.1, 2.8, 1.6],
  MONTH: [1.5, 2.2, 2.8, 1.9, 3.1, 2.4, 2.7, 1.8, 2.5, 3.0, 2.1, 1.7],
  YEAR:  [2.1, 2.4, 2.8, 3.1, 2.6],
};

const X_LABELS: Record<string, string[]> = {
  WEEK:  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
  MONTH: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
  YEAR:  ["2021","2022","2023","2024","2025"],
};

const DOT_CONFIG: Record<string, { peak: number; secondary: number }> = {
  WEEK:  { peak: 2, secondary: 6 },
  MONTH: { peak: 4, secondary: 9  },
  YEAR:  { peak: 3, secondary: 0  },
};

// ─── Top Apps ─────────────────────────────────────────────────────────────────

const TOP_APPS = [
  { name: "Instagram", category: "Social",        time: "2h 15m", icon: "photo-camera"      as const },
  { name: "TikTok",    category: "Entertainment", time: "1h 45m", icon: "music-video"       as const },
  { name: "YouTube",   category: "Video",         time: "45m",    icon: "play-circle-filled" as const },
  { name: "Twitter",   category: "Social",        time: "32m",    icon: "alternate-email"   as const },
  { name: "Reddit",    category: "Social",        time: "24m",    icon: "forum"             as const },
];

// ─── Weekly Focus data ────────────────────────────────────────────────────────

const WEEK_DATA = [
  { day: "Mon", value: 0.6 },
  { day: "Tue", value: 0.8 },
  { day: "Wed", value: 0.5 },
  { day: "Thu", value: 0.9 },
  { day: "Fri", value: 0.7 },
  { day: "Sat", value: 1.0, today: true },
  { day: "Sun", value: 0.3 },
];

// ─── Chart paths ──────────────────────────────────────────────────────────────

function buildPaths(data: number[], w: number, h: number) {
  const padL = 36, padR = 12, padT = 16, padB = 44; // padB 44 for x-axis labels
  const max  = Math.max(...data) * 1.15;

  const toX = (i: number) => padL + (i / (data.length - 1)) * (w - padL - padR);
  const toY = (v: number) => padT + (1 - v / max) * (h - padT - padB);

  let line = `M ${toX(0)} ${toY(data[0])}`;
  for (let i = 1; i < data.length; i++) {
    const cpx = (toX(i - 1) + toX(i)) / 2;
    line += ` C ${cpx} ${toY(data[i - 1])}, ${cpx} ${toY(data[i])}, ${toX(i)} ${toY(data[i])}`;
  }
  const area = `${line} L ${toX(data.length - 1)} ${h - padB} L ${toX(0)} ${h - padB} Z`;
  const points = data.map((v, i) => ({ x: toX(i), y: toY(v) }));

  return { line, area, points, toX, padB };
}

// ─── Activity Chart ───────────────────────────────────────────────────────────

function ActivityChart({ range }: { range: string }) {
  const data   = CHART_DATASETS[range] ?? CHART_DATASETS.WEEK;
  const dotCfg = DOT_CONFIG[range] ?? DOT_CONFIG.WEEK;
  const labels = X_LABELS[range] ?? [];

  const chartW = SCREEN_W - 40;
  const chartH = 220;

  const { line, area, points, padB } = buildPaths(data, chartW, chartH);

  const yLabels    = ["4h", "3h", "2h", "1h"];
  const yPositions = [0.08, 0.31, 0.56, 0.80].map(p => chartH * p);

  // x-label positions
  const padL = 36, padR = 12;
  const labelX = (i: number) => padL + (i / (data.length - 1)) * (chartW - padL - padR);

  return (
    <View style={{ height: chartH }}>
      <Svg width={chartW} height={chartH}>
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3b82f6" stopOpacity="0.20" />
            <Stop offset="1" stopColor="#3b82f6" stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {/* Y-axis labels */}
        {yLabels.map((label, i) => (
          <SvgText key={i} x={4} y={yPositions[i] + 4} fontSize={10} fill="#aaa" fontFamily="Inter_500Medium">
            {label}
          </SvgText>
        ))}

        {/* Area + line */}
        <Path d={area} fill="url(#areaGrad)" />
        <Path d={line} fill="none" stroke="#3b82f6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {/* Peak dot — orange */}
        {points[dotCfg.peak] && (
          <Circle cx={points[dotCfg.peak].x} cy={points[dotCfg.peak].y} r={6} fill="#f97316" stroke="#fff" strokeWidth={2} />
        )}
        {/* Secondary dot — green */}
        {points[dotCfg.secondary] && (
          <Circle cx={points[dotCfg.secondary].x} cy={points[dotCfg.secondary].y} r={6} fill="#22c55e" stroke="#fff" strokeWidth={2} />
        )}

        {/* X-axis labels */}
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

function TopAppsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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
          {TOP_APPS.map((app, i) => (
            <View
              key={app.name}
              style={[
                styles.topAppRow,
                i < TOP_APPS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerHigh },
              ]}
            >
              <View style={[styles.topAppIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
                <MaterialIcons name={app.icon} size={20} color={colors.onSurface} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.topAppName, { color: colors.onSurface }]}>{app.name}</Text>
                <Text style={[styles.topAppCategory, { color: colors.outline }]}>{app.category}</Text>
              </View>
              <Text style={[styles.topAppTime, { color: colors.onSurface }]}>{app.time}</Text>
            </View>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Weekly Focus Bar ─────────────────────────────────────────────────────────

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
        <Animated.View style={[
          styles.weekBarFill,
          { backgroundColor: data.today ? colors.primary : colors.surfaceContainerHighest, borderRadius: 4 },
          barStyle,
        ]} />
      </View>
      <Text style={[styles.weekDay, { color: data.today ? colors.onSurface : colors.outline }]}>{data.day}</Text>
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

// ─── Analytics Screen ─────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const colors       = useColors();
  const insets       = useSafeAreaInsets();
  const topPad       = isWeb ? 24 : insets.top;
  const [activeRange,  setActiveRange]  = useState("WEEK");
  const [showTopApps,  setShowTopApps]  = useState(false);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />
      <TopAppsModal visible={showTopApps} onClose={() => setShowTopApps(false)} />

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

        {/* TODAY'S Screen Time — big black card */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(120).springify()}
          style={[styles.totalCard, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.totalLabel}>TODAY'S SCREEN TIME</Text>
          <View style={styles.totalTimeRow}>
            <Text style={styles.totalHours}>4</Text>
            <Text style={styles.totalHUnit}>h</Text>
            <Text style={styles.totalMins}>32</Text>
            <Text style={styles.totalMUnit}>m</Text>
          </View>
          <View style={styles.totalTrendRow}>
            <MaterialIcons name="south-west" size={16} color="#9ca3af" />
            <Text style={styles.totalTrendText}> 12% less than last {activeRange.toLowerCase()}</Text>
          </View>
        </Animated.View>

        {/* 3-column KPIs */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(180).springify()} style={styles.kpiRow}>
          <KpiCard icon="alarm"  label="PEAK TIME"  value="8 PM"    />
          <KpiCard icon="timer"  label="DAILY AVG"  value="2h 40m"  />
          <KpiCard icon="apps"   label="TOP APP"    value="INSTAG…" />
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
          <ActivityChart range={activeRange} />
        </Animated.View>

        {/* Top Apps — tap to expand */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(300).springify()}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => setShowTopApps(true)}
            style={[styles.topAppsCard, { backgroundColor: colors.card }]}
          >
            <View style={styles.chartHeader}>
              <View>
                <Text style={[styles.chartSubLabel, { color: colors.outline }]}>SCREEN TIME</Text>
                <Text style={[styles.chartTitle, { color: colors.onSurface }]}>Top Apps</Text>
              </View>
              <View style={[styles.yearlyBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
                <MaterialIcons name="open-in-new" size={14} color={colors.onSurface} />
              </View>
            </View>
            {TOP_APPS.slice(0, 3).map((app, i) => (
              <View key={app.name} style={[
                styles.topAppRow,
                i < 2 && { borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerHigh },
              ]}>
                <View style={[styles.topAppIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <MaterialIcons name={app.icon} size={18} color={colors.onSurface} />
                </View>
                <Text style={[styles.topAppName, { color: colors.onSurface, flex: 1 }]}>{app.name}</Text>
                <Text style={[styles.topAppTime, { color: colors.onSurface }]}>{app.time}</Text>
              </View>
            ))}
            <Text style={[styles.tapToExpand, { color: colors.outline }]}>Tap to see all 5 apps →</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Weekly Focus (moved from Home) */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(360).springify()}
          style={[styles.chartCard, { backgroundColor: colors.card }]}
        >
          <View style={styles.chartHeader}>
            <View>
              <Text style={[styles.chartSubLabel, { color: colors.outline }]}>THIS WEEK</Text>
              <Text style={[styles.chartTitle, { color: colors.onSurface }]}>Focus Time</Text>
            </View>
            <Text style={[styles.weeklyTotal, { color: colors.onSurface }]}>8h 20m</Text>
          </View>
          <View style={styles.weekBars}>
            {WEEK_DATA.map((d, i) => <WeekBar key={i} data={d} index={i} />)}
          </View>
        </Animated.View>
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

  rangeBar: { flexDirection: "row", borderRadius: 40, padding: 4, gap: 4 },
  rangeBtn: { flex: 1, paddingVertical: 10, borderRadius: 36, alignItems: "center" },
  rangeBtnText: { fontSize: 13, letterSpacing: 0.8 },

  totalCard: { borderRadius: 28, padding: 24, gap: 12 },
  totalLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5, color: "#9ca3af" },
  totalTimeRow: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  totalHours: { fontSize: 72, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 78, letterSpacing: -2 },
  totalHUnit: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#fff", marginBottom: 8, letterSpacing: -1 },
  totalMins:  { fontSize: 72, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 78, letterSpacing: -2, marginLeft: 8 },
  totalMUnit: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#fff", marginBottom: 8, letterSpacing: -1 },
  totalTrendRow:  { flexDirection: "row", alignItems: "center" },
  totalTrendText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#9ca3af" },

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

  // Top Apps card
  topAppsCard: {
    borderRadius: 28, padding: 20, gap: 0,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 24, elevation: 2,
  },
  topAppRow:      { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  topAppIcon:     { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  topAppName:     { fontSize: 14, fontFamily: "Inter_500Medium" },
  topAppCategory: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  topAppTime:     { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tapToExpand:    { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 8 },

  // Weekly focus bars
  weeklyTotal: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  weekBars:    { flexDirection: "row", justifyContent: "space-between", height: 80, alignItems: "flex-end" },
  weekBarItem: { alignItems: "center", gap: 4, flex: 1 },
  weekBarOuter:{ flex: 1, width: "60%", justifyContent: "flex-end" },
  weekBarFill: { width: "100%" },
  weekDay:     { fontSize: 11, fontFamily: "Inter_500Medium" },

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
