import { MaterialIcons } from "@expo/vector-icons";
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
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb = Platform.OS === "web";

const DATE_RANGES = ["Day", "Week", "Month"];

const WEEK_POINTS = [3.5, 4.2, 2.8, 5.1, 4.0, 3.2, 2.5];
const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const APP_BREAKDOWN = [
  { name: "Instagram", time: "2h 15m", percent: 0.85, icon: "photo-camera" as const },
  { name: "TikTok", time: "1h 45m", percent: 0.66, icon: "music-video" as const },
  { name: "YouTube", time: "45m", percent: 0.28, icon: "play-circle-filled" as const },
  { name: "Twitter", time: "30m", percent: 0.19, icon: "tag" as const },
  { name: "Reddit", time: "20m", percent: 0.13, icon: "forum" as const },
];

const INSIGHTS = [
  "Your Instagram usage peaked on Wednesday.",
  "You spent 30% less time on screens than last week.",
  "Morning hours (6–9am) show your lowest usage.",
];

function buildLinePath(data: number[], width: number, height: number): string {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const padH = 12;
  const padV = 10;
  const xs = data.map((_, i) => padH + (i / (data.length - 1)) * (width - padH * 2));
  const ys = data.map((v) => padV + (1 - (v - min) / range) * (height - padV * 2));
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < data.length; i++) {
    const cpx = (xs[i - 1] + xs[i]) / 2;
    d += ` C ${cpx} ${ys[i - 1]}, ${cpx} ${ys[i]}, ${xs[i]} ${ys[i]}`;
  }
  return d;
}

function AnimatedBar({ percent, delay }: { percent: number; delay: number }) {
  const colors = useColors();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(percent, { damping: 20, stiffness: 90 }));
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as any,
  }));

  return (
    <View style={[styles.barTrack, { backgroundColor: colors.surfaceContainerHighest }]}>
      <Animated.View style={[styles.barFill, { backgroundColor: colors.primary }, barStyle]} />
    </View>
  );
}

export default function AnalyticsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeRange, setActiveRange] = useState("Week");
  const topPad = isWeb ? 67 : insets.top;

  const chartWidth = 340;
  const chartHeight = 120;
  const linePath = buildLinePath(WEEK_POINTS, chartWidth, chartHeight);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: "rgba(249,249,249,0.88)" }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <MaterialIcons name="arrow-back" size={22} color={colors.onSurface} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Analytics</Text>
          <View style={styles.headerRight}>
            <MaterialIcons name="calendar-today" size={20} color={colors.onSurface} />
          </View>
        </View>
        <View style={styles.rangeRow}>
          {DATE_RANGES.map((r) => (
            <TouchableOpacity
              key={r}
              style={[
                styles.rangeChip,
                { backgroundColor: activeRange === r ? colors.primary : colors.surfaceContainer },
              ]}
              onPress={() => setActiveRange(r)}
              activeOpacity={0.8}
            >
              <Text style={[styles.rangeChipText, { color: activeRange === r ? colors.primaryForeground : colors.onSurface }]}>
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 112, paddingBottom: isWeb ? 34 + 84 : 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* KPI row */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(60).springify()} style={styles.kpiRow}>
          {[
            { label: "Screen Time", value: "4h 32m" },
            { label: "Sessions", value: "24" },
            { label: "Avg Session", value: "11m" },
          ].map((kpi, i) => (
            <KpiCard key={i} kpi={kpi} index={i} />
          ))}
        </Animated.View>

        {/* Line chart */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(140).springify()} style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.outline }]}>SCREEN TIME</Text>
          <View style={styles.chartContainer}>
            <Svg width={chartWidth} height={chartHeight}>
              <Path d={linePath} fill="none" stroke={colors.primary} strokeWidth={2.5} />
            </Svg>
          </View>
          <View style={styles.xLabels}>
            {WEEK_LABELS.map((l, i) => (
              <Text key={i} style={[styles.xLabel, { color: colors.outline }]}>{l}</Text>
            ))}
          </View>
        </Animated.View>

        {/* App Breakdown */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(220).springify()} style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.outline }]}>APP BREAKDOWN</Text>
          <View style={{ gap: 16, marginTop: 4 }}>
            {APP_BREAKDOWN.map((app, i) => (
              <View key={i} style={styles.breakdownRow}>
                <View style={[styles.breakdownIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <MaterialIcons name={app.icon} size={18} color={colors.onSurface} />
                </View>
                <View style={styles.breakdownInfo}>
                  <View style={styles.breakdownTop}>
                    <Text style={[styles.breakdownName, { color: colors.onSurface }]}>{app.name}</Text>
                    <Text style={[styles.breakdownTime, { color: colors.onSurface }]}>{app.time}</Text>
                  </View>
                  <AnimatedBar percent={app.percent} delay={300 + i * 80} />
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Insights */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(300).springify()} style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.outline }]}>INSIGHTS</Text>
          <View style={{ gap: 12, marginTop: 8 }}>
            {INSIGHTS.map((insight, i) => (
              <View key={i} style={styles.insightRow}>
                <View style={[styles.insightDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.insightText, { color: colors.onSurface }]}>{insight}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function KpiCard({ kpi, index }: { kpi: { label: string; value: string }; index: number }) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[styles.kpiCard, { backgroundColor: colors.card }, pressStyle]}
      onTouchStart={() => { scale.value = withSpring(0.96, { damping: 12 }); }}
      onTouchEnd={() => { scale.value = withSpring(1, { damping: 12 }); }}
      onTouchCancel={() => { scale.value = withSpring(1, { damping: 12 }); }}
    >
      <Text style={[styles.kpiValue, { color: colors.onSurface }]}>{kpi.value}</Text>
      <Text style={[styles.kpiLabel, { color: colors.outline }]}>{kpi.label}</Text>
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
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  headerLeft: { width: 32, alignItems: "flex-start" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerRight: { width: 32, alignItems: "flex-end" },
  rangeRow: { flexDirection: "row", gap: 8 },
  rangeChip: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  rangeChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  kpiRow: { flexDirection: "row", gap: 10 },
  kpiCard: {
    flex: 1,
    borderRadius: 24,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  kpiValue: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 3, textAlign: "center" },
  card: {
    borderRadius: 28,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  cardTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2, marginBottom: 12 },
  chartContainer: { overflow: "hidden" },
  xLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingHorizontal: 12 },
  xLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  breakdownRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  breakdownIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  breakdownInfo: { flex: 1, gap: 6 },
  breakdownTop: { flexDirection: "row", justifyContent: "space-between" },
  breakdownName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  breakdownTime: { fontSize: 14, fontFamily: "Inter_500Medium" },
  barTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  insightDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5, flexShrink: 0 },
  insightText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20 },
});
