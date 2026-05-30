import { MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
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
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;

const DATE_RANGES = ["WEEK", "MONTH", "YEAR"];

// Chart data — weekly usage in hours
const CHART_DATASETS: Record<string, number[]> = {
  WEEK:  [1.2, 1.8, 3.7, 2.3, 2.1, 2.8, 1.6],
  MONTH: [1.5, 2.2, 2.8, 1.9, 3.1, 2.4, 2.7, 1.8, 2.5, 3.0, 2.1, 1.7,
          2.3, 2.9, 1.4, 2.6, 3.2, 2.0, 1.8, 2.4, 2.7, 3.1, 2.5, 1.9,
          2.2, 2.8, 1.6, 2.1, 2.9, 2.3],
  YEAR:  [1.2, 1.5, 3.6, 2.4, 2.2, 2.8, 1.5, 1.8, 2.6, 2.1, 1.9, 2.4],
};

// orange dot at peak, green dot somewhere else
const DOT_CONFIG: Record<string, { peak: number; secondary: number }> = {
  WEEK:  { peak: 2, secondary: 6 },
  MONTH: { peak: 10, secondary: 25 },
  YEAR:  { peak: 2, secondary: 11 },
};

function buildPaths(data: number[], w: number, h: number) {
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 24;
  const max = Math.max(...data) * 1.15;
  const min = 0;

  const toX = (i: number) => padL + (i / (data.length - 1)) * (w - padL - padR);
  const toY = (v: number) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);

  // build smooth bezier
  let line = `M ${toX(0)} ${toY(data[0])}`;
  for (let i = 1; i < data.length; i++) {
    const cpx = (toX(i - 1) + toX(i)) / 2;
    line += ` C ${cpx} ${toY(data[i - 1])}, ${cpx} ${toY(data[i])}, ${toX(i)} ${toY(data[i])}`;
  }

  // area = line + close to bottom
  const area = `${line} L ${toX(data.length - 1)} ${h - padB} L ${toX(0)} ${h - padB} Z`;

  const points = data.map((v, i) => ({ x: toX(i), y: toY(v) }));

  return { line, area, points, toX, toY };
}

function ActivityChart({ range }: { range: string }) {
  const colors = useColors();
  const data = CHART_DATASETS[range] ?? CHART_DATASETS.YEAR;
  const dotCfg = DOT_CONFIG[range] ?? DOT_CONFIG.YEAR;

  const chartW = SCREEN_W - 40; // 20px padding each side
  const chartH = 200;

  const { line, area, points } = buildPaths(data, chartW, chartH);

  const yLabels = ["4h", "3h", "2h", "1h"];
  const yPositions = [0.08, 0.31, 0.56, 0.80].map((p) => chartH * p);

  return (
    <View style={{ height: chartH }}>
      <Svg width={chartW} height={chartH}>
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3b82f6" stopOpacity="0.22" />
            <Stop offset="1" stopColor="#3b82f6" stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {/* Y-axis labels */}
        {yLabels.map((label, i) => (
          <SvgText
            key={i}
            x={4}
            y={yPositions[i] + 4}
            fontSize={10}
            fill="#aaa"
            fontFamily="Inter_500Medium"
          >
            {label}
          </SvgText>
        ))}

        {/* Area fill */}
        <Path d={area} fill="url(#areaGrad)" />

        {/* Line */}
        <Path d={line} fill="none" stroke="#3b82f6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {/* Peak dot — orange */}
        {points[dotCfg.peak] && (
          <Circle
            cx={points[dotCfg.peak].x}
            cy={points[dotCfg.peak].y}
            r={6}
            fill="#f97316"
            stroke="#fff"
            strokeWidth={2}
          />
        )}

        {/* Secondary dot — green */}
        {points[dotCfg.secondary] && (
          <Circle
            cx={points[dotCfg.secondary].x}
            cy={points[dotCfg.secondary].y}
            r={6}
            fill="#22c55e"
            stroke="#fff"
            strokeWidth={2}
          />
        )}
      </Svg>
    </View>
  );
}

export default function AnalyticsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeRange, setActiveRange] = useState("WEEK");
  const topPad = isWeb ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 16, paddingBottom: isWeb ? 34 + 84 : 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(0).springify()}
          style={styles.headerRow}
        >
          <MaterialIcons name="bar-chart" size={28} color={colors.onSurface} />
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>ANALYTICS</Text>
        </Animated.View>

        {/* Date range tabs */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(60).springify()}
          style={[styles.rangeBar, { backgroundColor: colors.surfaceContainerHigh }]}
        >
          {DATE_RANGES.map((r) => (
            <TouchableOpacity
              key={r}
              style={[
                styles.rangeBtn,
                activeRange === r && { backgroundColor: colors.primary },
              ]}
              onPress={() => setActiveRange(r)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.rangeBtnText,
                  {
                    color: activeRange === r ? "#fff" : colors.outline,
                    fontFamily: activeRange === r ? "Inter_700Bold" : "Inter_500Medium",
                  },
                ]}
              >
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>

        {/* Total Screen Time — big black card */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(120).springify()}
          style={[styles.totalCard, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.totalLabel}>TOTAL SCREEN TIME</Text>
          <View style={styles.totalTimeRow}>
            <Text style={styles.totalHours}>18</Text>
            <Text style={styles.totalHUnit}>h</Text>
            <Text style={styles.totalMins}>42</Text>
            <Text style={styles.totalMUnit}>m</Text>
          </View>
          <View style={styles.totalTrendRow}>
            <MaterialIcons name="south-west" size={16} color="#9ca3af" />
            <Text style={styles.totalTrendText}> 12% less than last {activeRange.toLowerCase()}</Text>
          </View>
        </Animated.View>

        {/* 3-column KPI cards */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(180).springify()}
          style={styles.kpiRow}
        >
          <KpiCard icon="alarm" label="PEAK TIME" value="8 PM" />
          <KpiCard icon="timer" label="DAILY AVG" value="2h 40m" />
          <KpiCard icon="apps" label="TOP APP" value="INSTAG..." />
        </Animated.View>

        {/* Activity Flow chart card */}
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
              <Text style={[styles.yearlyBadgeText, { color: colors.onSurface }]}>
                {activeRange}
              </Text>
            </View>
          </View>

          <ActivityChart range={activeRange} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  value: string;
}) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[styles.kpiCard, { backgroundColor: colors.card }, pressStyle]}
      onTouchStart={() => { scale.value = withSpring(0.95, { damping: 12 }); }}
      onTouchEnd={() => { scale.value = withSpring(1, { damping: 12 }); }}
      onTouchCancel={() => { scale.value = withSpring(1, { damping: 12 }); }}
    >
      <MaterialIcons name={icon} size={24} color={colors.onSurface} />
      <Text style={[styles.kpiLabel, { color: colors.outline }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color: colors.onSurface }]}>{value}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },

  rangeBar: {
    flexDirection: "row",
    borderRadius: 40,
    padding: 4,
    gap: 4,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 36,
    alignItems: "center",
  },
  rangeBtnText: {
    fontSize: 13,
    letterSpacing: 0.8,
  },

  totalCard: {
    borderRadius: 28,
    padding: 24,
    gap: 12,
  },
  totalLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    color: "#9ca3af",
  },
  totalTimeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  totalHours: {
    fontSize: 72,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    lineHeight: 78,
    letterSpacing: -2,
  },
  totalHUnit: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 8,
    letterSpacing: -1,
  },
  totalMins: {
    fontSize: 72,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    lineHeight: 78,
    letterSpacing: -2,
    marginLeft: 8,
  },
  totalMUnit: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 8,
    letterSpacing: -1,
  },
  totalTrendRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalTrendText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#9ca3af",
  },

  kpiRow: {
    flexDirection: "row",
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  kpiLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  kpiValue: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },

  chartCard: {
    borderRadius: 28,
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  chartSubLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
  },
  chartTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    marginTop: 2,
  },
  yearlyBadge: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  yearlyBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
});
