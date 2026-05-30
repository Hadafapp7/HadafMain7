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
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb = Platform.OS === "web";

const ACHIEVEMENTS = [
  { label: "7-Day Streak",  icon: "local-fire-department" as const },
  { label: "Focus Master",  icon: "bolt"                  as const },
  { label: "Early Bird",    icon: "wb-sunny"              as const },
  { label: "Screen Free",   icon: "smartphone"            as const },
];

const SETTINGS = [
  { label: "Notifications", icon: "notifications"  as const, danger: false, upgrade: false },
  { label: "Privacy",       icon: "lock"            as const, danger: false, upgrade: false },
  { label: "Upgrade Plan",  icon: "workspace-premium" as const, danger: false, upgrade: true  },
  { label: "Help",          icon: "help-outline"    as const, danger: false, upgrade: false },
  { label: "Sign Out",      icon: "logout"          as const, danger: true,  upgrade: false },
];

// Stat items for profile card
const STATS = [
  {
    value: "47",
    label: "Focus Sessions",
    sublabel: "completed",
    trend: null,
  },
  {
    value: "12",
    label: "Goals",
    sublabel: "completed",
    trend: null,
  },
  {
    value: "98%",
    label: "Improvement",
    sublabel: "rate",
    trend: "up" as const, // "up" | "down" | null
  },
];

function PressCard({
  children,
  style,
  delay = 0,
}: {
  children: React.ReactNode;
  style?: object;
  delay?: number;
}) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[pressStyle, style]}
      entering={isWeb ? undefined : FadeInDown.delay(delay).springify()}
      onTouchStart={() => { scale.value = withSpring(0.97, { damping: 12 }); }}
      onTouchEnd={() => { scale.value = withSpring(1, { damping: 12 }); }}
      onTouchCancel={() => { scale.value = withSpring(1, { damping: 12 }); }}
    >
      {children}
    </Animated.View>
  );
}

function AchievementCard({
  achievement,
  index,
  isLast,
}: {
  achievement: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"] };
  index: number;
  isLast: boolean;
}) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        pressStyle,
        styles.achievementCard,
        {
          backgroundColor: colors.card,
          marginLeft: index === 0 ? 16 : 10,
          marginRight: isLast ? 16 : 0,
        },
      ]}
    >
      <TouchableOpacity
        style={{ alignItems: "center", gap: 10 }}
        onPressIn={() => { scale.value = withSpring(0.93, { damping: 12 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
        onPress={() => Haptics.selectionAsync()}
        activeOpacity={1}
      >
        <View style={[styles.achievementIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
          <MaterialIcons name={achievement.icon} size={24} color={colors.onSurface} />
        </View>
        <Text style={[styles.achievementLabel, { color: colors.onSurface }]}>
          {achievement.label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />

      {/* Floating header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 12, backgroundColor: "rgba(249,249,249,0.88)" },
        ]}
      >
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
        {/* ── Profile card ── */}
        <PressCard delay={60} style={[styles.profileCard, { backgroundColor: colors.card }]}>
          {/* Basic plan badge — top-left */}
          <View style={[styles.planBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
            <MaterialIcons name="person-outline" size={11} color={colors.outline} />
            <Text style={[styles.planBadgeText, { color: colors.outline }]}>BASIC PLAN</Text>
          </View>

          <View style={styles.profileAvatar}>
            <View
              style={[
                styles.profileAvatarInner,
                { backgroundColor: colors.surfaceContainerHigh },
              ]}
            >
              <MaterialIcons name="person" size={44} color={colors.onSurfaceVariant} />
            </View>
          </View>

          <Text style={[styles.profileName, { color: colors.onSurface }]}>Alex Johnson</Text>
          <Text style={[styles.profileSub, { color: colors.outline }]}>@alexjohnson</Text>

          {/* Stats row */}
          <View style={[styles.statsDivider, { backgroundColor: colors.surfaceContainerHigh }]} />
          <View style={styles.statsRow}>
            {STATS.map((s, i) => (
              <View key={i} style={[styles.statItem, i < STATS.length - 1 && { borderRightWidth: 1, borderRightColor: colors.surfaceContainerHigh }]}>
                <View style={styles.statValueRow}>
                  <Text style={[styles.statValue, { color: colors.onSurface }]}>{s.value}</Text>
                  {s.trend === "up" && (
                    <MaterialIcons name="arrow-upward" size={14} color="#22c55e" />
                  )}
                  {s.trend === "down" && (
                    <MaterialIcons name="arrow-downward" size={14} color="#ef4444" />
                  )}
                </View>
                <Text style={[styles.statLabel, { color: colors.outline }]}>{s.label}</Text>
                <Text style={[styles.statSublabel, { color: colors.outlineVariant }]}>{s.sublabel}</Text>
              </View>
            ))}
          </View>
        </PressCard>

        {/* ── Achievements ── */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(180).springify()}>
          <Text
            style={[
              styles.sectionLabel,
              { color: colors.outline, marginLeft: 4, marginBottom: 10 },
            ]}
          >
            ACHIEVEMENTS
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -16 }}
          >
            {ACHIEVEMENTS.map((a, i) => (
              <AchievementCard
                key={i}
                achievement={a}
                index={i}
                isLast={i === ACHIEVEMENTS.length - 1}
              />
            ))}
          </ScrollView>
        </Animated.View>

        {/* ── Settings ── */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(260).springify()}
          style={[styles.settingsCard, { backgroundColor: colors.card }]}
        >
          {SETTINGS.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.settingRow,
                i < SETTINGS.length - 1 && {
                  marginBottom: 18,
                  paddingBottom: 18,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: "rgba(0,0,0,0.06)",
                },
              ]}
              activeOpacity={0.7}
              onPress={() => Haptics.selectionAsync()}
            >
              <View
                style={[
                  styles.settingIconWrap,
                  {
                    backgroundColor: item.upgrade
                      ? colors.primary
                      : item.danger
                      ? "rgba(186,26,26,0.08)"
                      : colors.surfaceContainerHigh,
                  },
                ]}
              >
                <MaterialIcons
                  name={item.icon}
                  size={18}
                  color={
                    item.upgrade ? "#fff" : item.danger ? colors.destructive : colors.onSurface
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.settingLabel,
                    {
                      color: item.upgrade
                        ? colors.primary
                        : item.danger
                        ? colors.destructive
                        : colors.onSurface,
                    },
                  ]}
                >
                  {item.label}
                </Text>
                {item.upgrade && (
                  <Text style={[styles.settingUpgradeSub, { color: colors.outline }]}>
                    Unlock advanced insights & more
                  </Text>
                )}
              </View>
              {!item.danger && (
                <MaterialIcons
                  name={item.upgrade ? "arrow-forward" : "chevron-right"}
                  size={18}
                  color={item.upgrade ? colors.primary : colors.outline}
                />
              )}
            </TouchableOpacity>
          ))}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  header: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    zIndex: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle:  { fontSize: 22, fontFamily: "Inter_700Bold" },
  scroll:       { flex: 1 },
  content:      { paddingHorizontal: 16, gap: 16 },

  profileCard: {
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
    gap: 6,
  },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
  },
  planBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },

  profileAvatar:      { marginBottom: 4 },
  profileAvatarInner: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  profileName:  { fontSize: 22, fontFamily: "Inter_700Bold" },
  profileSub:   { fontSize: 13, fontFamily: "Inter_400Regular" },

  statsDivider: { width: "100%", height: 1, marginVertical: 10 },
  statsRow:     { flexDirection: "row", width: "100%" },
  statItem:     { flex: 1, alignItems: "center", gap: 2, paddingVertical: 4 },
  statValueRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  statValue:    { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel:    { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  statSublabel: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },

  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },

  achievementCard: {
    width: 100,
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  achievementIcon:  { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  achievementLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" },

  settingsCard: {
    borderRadius: 28,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  settingRow:       { flexDirection: "row", alignItems: "center", gap: 14 },
  settingIconWrap:  { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  settingLabel:     { fontSize: 15, fontFamily: "Inter_500Medium" },
  settingUpgradeSub:{ fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Needed for colors reference
  onSurfaceVariant: { color: "#474747" },
  outlineVariant:   { color: "#c6c6c6" },
});
