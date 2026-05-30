import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const FOCUS_TYPES = [
  { label: "Deep Work", icon: "bolt" as const },
  { label: "Reading", icon: "menu-book" as const },
  { label: "Exercise", icon: "fitness-center" as const },
  { label: "Custom", icon: "tune" as const },
];

const BLOCK_ITEMS = [
  { label: "Social Media", icon: "thumb-up" as const },
  { label: "Games", icon: "sports-esports" as const },
  { label: "Entertainment", icon: "play-arrow" as const },
  { label: "Messaging", icon: "chat" as const },
];

const ALLOWED_APPS = [
  { name: "Spotify", icon: "music-note" as const, allowed: true },
  { name: "Maps", icon: "map" as const, allowed: true },
  { name: "Calendar", icon: "calendar-today" as const, allowed: true },
  { name: "Notes", icon: "edit-note" as const, allowed: false },
  { name: "Camera", icon: "camera-alt" as const, allowed: false },
];

function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onToggle();
      }}
      style={[
        styles.toggle,
        { backgroundColor: value ? colors.primary : colors.surfaceContainerHighest },
      ]}
    >
      <View
        style={[
          styles.toggleKnob,
          {
            backgroundColor: value ? colors.primaryForeground : colors.outline,
            transform: [{ translateX: value ? 22 : 2 }],
          },
        ]}
      />
    </Pressable>
  );
}

export default function FocusScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [duration, setDuration] = useState(25);
  const [selectedType, setSelectedType] = useState(0);
  const [blockToggles, setBlockToggles] = useState([true, false, true, false]);
  const [allowedApps, setAllowedApps] = useState(ALLOWED_APPS.map((a) => a.allowed));
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const toggleBlock = (i: number) => {
    setBlockToggles((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  };

  const toggleApp = (i: number) => {
    Haptics.selectionAsync();
    setAllowedApps((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: "rgba(249,249,249,0.95)" }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>Focus Mode</Text>
          <TouchableOpacity activeOpacity={0.7}>
            <MaterialIcons name="close" size={22} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 70, paddingBottom: isWeb ? 34 + 84 : 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Duration Picker */}
        <View style={[styles.durationCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.outline }]}>SESSION DURATION</Text>
          <View style={styles.durationRow}>
            <TouchableOpacity
              style={[styles.durationBtn, { borderColor: colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDuration((d) => Math.max(5, d - 5));
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="remove" size={22} color={colors.primary} />
            </TouchableOpacity>

            <View style={styles.durationDisplay}>
              <Text style={[styles.durationNumber, { color: colors.onSurface }]}>{duration}</Text>
              <Text style={[styles.durationUnit, { color: colors.outline }]}>min</Text>
            </View>

            <TouchableOpacity
              style={[styles.durationBtn, { borderColor: colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDuration((d) => Math.min(120, d + 5));
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="add" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Focus Type */}
        <View>
          <Text style={[styles.sectionLabel, { color: colors.outline, marginLeft: 4, marginBottom: 10 }]}>FOCUS TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }}>
            {FOCUS_TYPES.map((t, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.typeCard,
                  {
                    backgroundColor: selectedType === i ? colors.primary : colors.card,
                    marginLeft: i === 0 ? 16 : 10,
                    marginRight: i === FOCUS_TYPES.length - 1 ? 16 : 0,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedType(i);
                }}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={t.icon}
                  size={28}
                  color={selectedType === i ? colors.primaryForeground : colors.onSurface}
                />
                <Text
                  style={[
                    styles.typeLabel,
                    { color: selectedType === i ? colors.primaryForeground : colors.onSurface },
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Block Distractions */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.outline, marginBottom: 16 }]}>BLOCK DISTRACTIONS</Text>
          <View style={{ gap: 18 }}>
            {BLOCK_ITEMS.map((item, i) => (
              <View key={i} style={styles.blockRow}>
                <View style={[styles.blockIconWrap, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <MaterialIcons name={item.icon} size={18} color={colors.onSurface} />
                </View>
                <Text style={[styles.blockLabel, { color: colors.onSurface }]}>{item.label}</Text>
                <Toggle value={blockToggles[i]} onToggle={() => toggleBlock(i)} />
              </View>
            ))}
          </View>
        </View>

        {/* Allowed Apps */}
        <View>
          <Text style={[styles.sectionLabel, { color: colors.outline, marginLeft: 4, marginBottom: 12 }]}>ALLOWED APPS</Text>
          <View style={styles.allowedRow}>
            {ALLOWED_APPS.map((app, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.allowedApp,
                  { backgroundColor: colors.card, opacity: allowedApps[i] ? 1 : 0.45 },
                ]}
                onPress={() => toggleApp(i)}
                activeOpacity={0.7}
              >
                <View style={[styles.allowedIconWrap, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <MaterialIcons name={app.icon} size={20} color={colors.onSurface} />
                </View>
                {!allowedApps[i] && (
                  <View style={[styles.deniedBadge, { backgroundColor: colors.primary }]}>
                    <MaterialIcons name="block" size={9} color={colors.primaryForeground} />
                  </View>
                )}
                <Text style={[styles.allowedLabel, { color: colors.onSurface }]}>{app.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Start Session CTA */}
        <TouchableOpacity
          style={[styles.startCta, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)}
        >
          <MaterialIcons name="play-arrow" size={24} color={colors.primaryForeground} />
          <Text style={[styles.startCtaText, { color: colors.primaryForeground }]}>
            Start {duration} Min Session
          </Text>
        </TouchableOpacity>
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
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  durationCard: {
    borderRadius: 28,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
    alignItems: "center",
    gap: 20,
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  durationBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  durationDisplay: { alignItems: "center" },
  durationNumber: {
    fontSize: 56,
    fontFamily: "Inter_700Bold",
    letterSpacing: -2,
    lineHeight: 62,
  },
  durationUnit: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    marginTop: -4,
  },
  typeCard: {
    width: 110,
    borderRadius: 28,
    padding: 18,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  typeLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  card: {
    borderRadius: 28,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  blockRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  blockIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  blockLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  allowedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  allowedApp: {
    width: 72,
    borderRadius: 20,
    padding: 12,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
    position: "relative",
  },
  allowedIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  deniedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  allowedLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  startCta: {
    height: 64,
    borderRadius: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  startCtaText: { fontSize: 17, fontFamily: "Inter_700Bold" },
});
