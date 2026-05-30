import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const GOALS = [
  { label: "Reduce Screen Time to 3h", progress: 68 },
  { label: "30 Focus Sessions/Month", progress: 47 },
  { label: "No Phone After 10PM", progress: 82 },
];

const ACHIEVEMENTS = [
  { label: "7-Day Streak", icon: "local-fire-department" as const },
  { label: "Focus Master", icon: "bolt" as const },
  { label: "Early Bird", icon: "wb-sunny" as const },
  { label: "Screen Free", icon: "smartphone" as const },
];

const SETTINGS = [
  { label: "Notifications", icon: "notifications" as const, danger: false },
  { label: "Privacy", icon: "lock" as const, danger: false },
  { label: "Export Data", icon: "download" as const, danger: false },
  { label: "Help", icon: "help-outline" as const, danger: false },
  { label: "Sign Out", icon: "logout" as const, danger: true },
];

function CircularProgress({ percent, size = 52 }: { percent: number; size?: number }) {
  const colors = useColors();
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ * (1 - percent / 100);
  const center = size / 2;

  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Circle
        cx={center}
        cy={center}
        r={r}
        stroke={colors.surfaceContainerHighest}
        strokeWidth={8}
        fill="none"
      />
      <Circle
        cx={center}
        cy={center}
        r={r}
        stroke={colors.primary}
        strokeWidth={8}
        fill="none"
        strokeDasharray={`${circ} ${circ}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: "rgba(249,249,249,0.95)" }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Account</Text>
          <TouchableOpacity onPress={() => Haptics.selectionAsync()} activeOpacity={0.7}>
            <MaterialIcons name="settings" size={22} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 68, paddingBottom: isWeb ? 34 + 84 : 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
          <View style={[styles.profileAvatar, { backgroundColor: colors.surfaceContainerHigh }]}>
            <MaterialIcons name="person" size={44} color={colors.onSurfaceVariant} />
          </View>
          <Text style={[styles.profileName, { color: colors.onSurface }]}>Alex Johnson</Text>
          <Text style={[styles.profileSub, { color: colors.outline }]}>Premium Member</Text>
          <View style={styles.statsRow}>
            {[
              { value: "47", label: "Sessions" },
              { value: "12", label: "Goals" },
              { value: "98%", label: "Rate" },
            ].map((s, i) => (
              <View key={i} style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.onSurface }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.outline }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Goals */}
        <View>
          <Text style={[styles.sectionLabel, { color: colors.outline, marginLeft: 4, marginBottom: 10 }]}>ACTIVE GOALS</Text>
          <View style={{ gap: 10 }}>
            {GOALS.map((goal, i) => (
              <View key={i} style={[styles.goalCard, { backgroundColor: colors.card }]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.goalLabel, { color: colors.onSurface }]}>{goal.label}</Text>
                  <Text style={[styles.goalPercent, { color: colors.outline }]}>{goal.progress}% complete</Text>
                </View>
                <View style={{ alignItems: "center", justifyContent: "center" }}>
                  <CircularProgress percent={goal.progress} />
                  <View style={StyleSheet.absoluteFill}>
                    <View style={styles.circularCenter}>
                      <Text style={[styles.circularText, { color: colors.onSurface }]}>{goal.progress}%</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Achievements */}
        <View>
          <Text style={[styles.sectionLabel, { color: colors.outline, marginLeft: 4, marginBottom: 10 }]}>ACHIEVEMENTS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }}>
            {ACHIEVEMENTS.map((a, i) => (
              <View
                key={i}
                style={[
                  styles.achievementCard,
                  {
                    backgroundColor: colors.card,
                    marginLeft: i === 0 ? 16 : 10,
                    marginRight: i === ACHIEVEMENTS.length - 1 ? 16 : 0,
                  },
                ]}
              >
                <View style={[styles.achievementIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <MaterialIcons name={a.icon} size={24} color={colors.onSurface} />
                </View>
                <Text style={[styles.achievementLabel, { color: colors.onSurface }]}>{a.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Settings list */}
        <View style={[styles.settingsCard, { backgroundColor: colors.card }]}>
          {SETTINGS.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.settingRow,
                i < SETTINGS.length - 1 && { marginBottom: 18 },
              ]}
              activeOpacity={0.7}
              onPress={() => Haptics.selectionAsync()}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: colors.surfaceContainerHigh }]}>
                <MaterialIcons
                  name={item.icon}
                  size={18}
                  color={item.danger ? colors.destructive : colors.onSurface}
                />
              </View>
              <Text
                style={[
                  styles.settingLabel,
                  { color: item.danger ? colors.destructive : colors.onSurface },
                ]}
              >
                {item.label}
              </Text>
              {!item.danger && (
                <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  profileCard: {
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
    gap: 8,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  profileName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  profileSub: { fontSize: 14, fontFamily: "Inter_500Medium" },
  statsRow: { flexDirection: "row", gap: 32, marginTop: 8 },
  statItem: { alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  goalCard: {
    borderRadius: 24,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  goalLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  goalPercent: { fontSize: 13, fontFamily: "Inter_400Regular" },
  circularCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  circularText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  achievementCard: {
    width: 100,
    borderRadius: 20,
    padding: 16,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  achievementIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  achievementLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  settingsCard: {
    borderRadius: 28,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  settingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
});
