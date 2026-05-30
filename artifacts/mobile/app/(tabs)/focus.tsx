import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;

// ── Duration options ──────────────────────────────────────────────────────────
const DURATION_OPTIONS = [
  { minutes: 15, label: "Sprint", hint: "Quick burst" },
  { minutes: 30, label: "Focus",  hint: "Core block"  },
  { minutes: 45, label: "Deep",   hint: "Flow state"  },
  { minutes: 60, label: "Flow",   hint: "Full hour"   },
];

// ── Apps pool ─────────────────────────────────────────────────────────────────
type AppEntry = {
  name: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  category: string;
};

const ALL_APPS: AppEntry[] = [
  { name: "Instagram", icon: "photo-camera",        category: "Social"        },
  { name: "TikTok",    icon: "music-video",          category: "Entertainment" },
  { name: "YouTube",   icon: "play-circle-filled",   category: "Video"         },
  { name: "Twitter",   icon: "alternate-email",      category: "Social"        },
  { name: "Reddit",    icon: "forum",                category: "Social"        },
  { name: "Facebook",  icon: "people",               category: "Social"        },
  { name: "Snapchat",  icon: "camera-alt",           category: "Social"        },
  { name: "Netflix",   icon: "tv",                   category: "Video"         },
  { name: "Discord",   icon: "headset",              category: "Chat"          },
  { name: "Twitch",    icon: "videogame-asset",      category: "Gaming"        },
];

// ── Ring constants ────────────────────────────────────────────────────────────
const RING_SIZE     = 200;
const STROKE_WIDTH  = 10;
const RADIUS        = (RING_SIZE - STROKE_WIDTH) / 2;
const CENTER        = RING_SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_DEGREES   = 300;
const GAP_DEGREES   = 360 - ARC_DEGREES;
const ARC_LENGTH    = (ARC_DEGREES / 360) * CIRCUMFERENCE;
const GAP_LENGTH    = (GAP_DEGREES  / 360) * CIRCUMFERENCE;
const RING_ROTATION = -90 + GAP_DEGREES / 2;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Timer ring ────────────────────────────────────────────────────────────────
function TimerRing({ duration }: { duration: number }) {
  const colors  = useColors();
  const progress = useSharedValue(0.85);

  useEffect(() => {
    const raw = duration / 60;
    progress.value = withSpring(Math.min(1, raw + 0.35), { damping: 18, stiffness: 80 });
  }, [duration]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${progress.value * ARC_LENGTH} ${CIRCUMFERENCE - progress.value * ARC_LENGTH}`,
  }));

  const mm = String(duration).padStart(2, "0");

  return (
    <View style={styles.ringContainer}>
      <Svg
        width={RING_SIZE}
        height={RING_SIZE}
        style={{ transform: [{ rotate: `${RING_ROTATION}deg` }] }}
      >
        <Circle
          cx={CENTER} cy={CENTER} r={RADIUS}
          fill="none"
          stroke={colors.surfaceContainerHighest}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={`${ARC_LENGTH} ${GAP_LENGTH}`}
          strokeLinecap="round"
        />
        <AnimatedCircle
          cx={CENTER} cy={CENTER} r={RADIUS}
          fill="none"
          stroke={colors.primary}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <Text style={[styles.ringTime, { color: colors.onSurface }]}>{mm}:00</Text>
        <Text style={[styles.ringSubLabel, { color: colors.outline }]}>MINUTES</Text>
      </View>
    </View>
  );
}

// ── Duration card ─────────────────────────────────────────────────────────────
function DurationCard({
  option,
  isActive,
  onPress,
  cardWidth,
}: {
  option: (typeof DURATION_OPTIONS)[0];
  isActive: boolean;
  onPress: () => void;
  cardWidth: number;
}) {
  const colors  = useColors();
  const scale   = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[animated, { width: cardWidth }]}>
      <TouchableOpacity
        style={[
          styles.durationCard,
          { backgroundColor: isActive ? colors.primary : colors.card },
        ]}
        onPressIn={() => { scale.value = withSpring(0.92, { damping: 12 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
        onPress={onPress}
        activeOpacity={1}
      >
        <Text style={[styles.durationMins, { color: isActive ? "#fff" : colors.onSurface }]}>
          {option.minutes}
        </Text>
        <Text style={[styles.durationLabel, { color: isActive ? "rgba(255,255,255,0.9)" : colors.outline }]}>
          {option.label}
        </Text>
        <Text style={[styles.durationHint, { color: isActive ? "rgba(255,255,255,0.55)" : colors.outlineVariant }]}>
          {option.hint}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── App picker modal ──────────────────────────────────────────────────────────
function AppPickerModal({
  visible,
  blockedApps,
  onToggle,
  onClose,
}: {
  visible: boolean;
  blockedApps: string[];
  onToggle: (name: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose} />
      <View
        style={[
          styles.modalSheet,
          { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={[styles.modalHandle, { backgroundColor: colors.surfaceContainerHighest }]} />
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.onSurface }]}>App Blocker</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <MaterialIcons name="close" size={22} color={colors.outline} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.modalSub, { color: colors.outline }]}>
          Toggle apps to block during your session
        </Text>
        <ScrollView style={{ marginTop: 12 }} showsVerticalScrollIndicator={false}>
          {ALL_APPS.map((app, i) => {
            const isBlocked = blockedApps.includes(app.name);
            return (
              <TouchableOpacity
                key={app.name}
                style={[
                  styles.appPickerRow,
                  i < ALL_APPS.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.surfaceContainerHigh,
                  },
                ]}
                onPress={() => { Haptics.selectionAsync(); onToggle(app.name); }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.appPickerIcon,
                    { backgroundColor: isBlocked ? colors.primary : colors.surfaceContainerHigh },
                  ]}
                >
                  <MaterialIcons
                    name={app.icon}
                    size={18}
                    color={isBlocked ? "#fff" : colors.outline}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.appPickerName, { color: colors.onSurface }]}>{app.name}</Text>
                  <Text style={[styles.appPickerCategory, { color: colors.outline }]}>{app.category}</Text>
                </View>
                <View
                  style={[
                    styles.appPickerToggle,
                    { backgroundColor: isBlocked ? colors.primary : colors.surfaceContainerHigh },
                  ]}
                >
                  <MaterialIcons
                    name={isBlocked ? "check" : "add"}
                    size={14}
                    color={isBlocked ? "#fff" : colors.outline}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function FocusScreen() {
  const colors    = useColors();
  const insets    = useSafeAreaInsets();
  const topPad    = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const [duration,    setDuration]    = useState(30);
  const [intention,   setIntention]   = useState("");
  const [blockedApps, setBlockedApps] = useState<string[]>(["Instagram", "TikTok", "YouTube"]);
  const [showPicker,  setShowPicker]  = useState(false);
  const [showCustom,  setShowCustom]  = useState(false);
  const [customInput, setCustomInput] = useState("");
  const customRef = useRef<TextInput>(null);

  const cardW = (SCREEN_W - 40 - 12 * 3) / 4;

  const toggleApp = (name: string) => {
    setBlockedApps((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  };

  const handleCustomConfirm = () => {
    const val = parseInt(customInput, 10);
    if (!isNaN(val) && val >= 1 && val <= 240) {
      setDuration(val);
    }
    setShowCustom(false);
    setCustomInput("");
  };

  // Scroll content — everything except the pinned start button
  const scrollContent = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topPad + 12, paddingBottom: bottomPad + 110 },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={isWeb ? undefined : FadeInDown.delay(0).springify()}>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>FOCUS MODE</Text>
      </Animated.View>

      {/* Timer ring */}
      <Animated.View
        entering={isWeb ? undefined : FadeInDown.delay(50).springify()}
        style={styles.ringWrapper}
      >
        <TimerRing duration={duration} />
      </Animated.View>

      {/* Intention */}
      <Animated.View
        entering={isWeb ? undefined : FadeInDown.delay(100).springify()}
        style={[styles.intentionCard, { backgroundColor: colors.card }]}
      >
        <View style={[styles.intentionAccent, { backgroundColor: colors.primary }]} />
        <View style={styles.intentionInner}>
          <View style={styles.intentionHeader}>
            <MaterialIcons name="lightbulb" size={16} color={colors.onSurface} />
            <Text style={[styles.intentionLabel, { color: colors.onSurface }]}>SET AN INTENTION</Text>
          </View>
          <TextInput
            style={[
              styles.intentionInput,
              { backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface },
            ]}
            placeholder="What are you working on?"
            placeholderTextColor={colors.outline}
            value={intention}
            onChangeText={setIntention}
            returnKeyType="done"
          />
        </View>
      </Animated.View>

      {/* Duration */}
      <Animated.View
        entering={isWeb ? undefined : FadeInDown.delay(150).springify()}
        style={styles.section}
      >
        <Text style={[styles.sectionLabel, { color: colors.outline }]}>DURATION</Text>

        <View style={styles.durationRow}>
          {DURATION_OPTIONS.map((opt) => (
            <DurationCard
              key={opt.minutes}
              option={opt}
              isActive={duration === opt.minutes && !showCustom}
              cardWidth={cardW}
              onPress={() => {
                Haptics.selectionAsync();
                setDuration(opt.minutes);
                setShowCustom(false);
                setCustomInput("");
              }}
            />
          ))}
        </View>

        {/* Custom duration toggle row */}
        <TouchableOpacity
          style={[
            styles.customRow,
            {
              backgroundColor: showCustom ? colors.primary : colors.card,
              borderColor: showCustom ? colors.primary : colors.surfaceContainerHigh,
            },
          ]}
          onPress={() => {
            Haptics.selectionAsync();
            setShowCustom((v) => !v);
            if (!showCustom) {
              setTimeout(() => customRef.current?.focus(), 80);
            }
          }}
          activeOpacity={0.8}
        >
          <MaterialIcons
            name="tune"
            size={16}
            color={showCustom ? "#fff" : colors.onSurface}
          />
          <Text style={[styles.customRowText, { color: showCustom ? "#fff" : colors.onSurface }]}>
            {showCustom ? "Custom — enter minutes" : "Set Custom Duration"}
          </Text>
          <MaterialIcons
            name={showCustom ? "expand-less" : "expand-more"}
            size={18}
            color={showCustom ? "#fff" : colors.outline}
          />
        </TouchableOpacity>

        {/* Custom input inline */}
        {showCustom && (
          <View style={[styles.customInputRow, { backgroundColor: colors.card }]}>
            <TextInput
              ref={customRef}
              style={[
                styles.customInputField,
                { color: colors.onSurface, borderColor: colors.surfaceContainerHighest },
              ]}
              keyboardType="number-pad"
              placeholder="e.g. 20"
              placeholderTextColor={colors.outline}
              value={customInput}
              onChangeText={setCustomInput}
              maxLength={3}
              returnKeyType="done"
              onSubmitEditing={handleCustomConfirm}
            />
            <Text style={[styles.customInputUnit, { color: colors.outline }]}>min</Text>
            <TouchableOpacity
              style={[styles.customConfirmBtn, { backgroundColor: colors.primary }]}
              onPress={handleCustomConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.customConfirmText}>Set</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      {/* Restricted access */}
      <Animated.View
        entering={isWeb ? undefined : FadeInDown.delay(200).springify()}
        style={styles.section}
      >
        <View style={styles.restrictedHeader}>
          <Text style={[styles.sectionLabel, { color: colors.outline }]}>RESTRICTED ACCESS</Text>
          <View style={styles.restrictedRight}>
            {blockedApps.length > 0 && (
              <View style={[styles.blockedBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
                <Text style={[styles.blockedBadgeText, { color: colors.onSurface }]}>
                  {blockedApps.length} BLOCKED
                </Text>
              </View>
            )}
            {blockedApps.length > 0 && (
              <TouchableOpacity
                style={[styles.addBtnSmall, { backgroundColor: colors.primary }]}
                onPress={() => { Haptics.selectionAsync(); setShowPicker(true); }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="add" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {blockedApps.length === 0 ? (
          <TouchableOpacity
            style={[
              styles.emptyAppsCard,
              { backgroundColor: colors.card, borderColor: colors.surfaceContainerHigh },
            ]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPicker(true); }}
            activeOpacity={0.8}
          >
            <View style={[styles.emptyAppsIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
              <MaterialIcons name="block" size={24} color={colors.outline} />
            </View>
            <Text style={[styles.emptyAppsTitle, { color: colors.onSurface }]}>No apps blocked</Text>
            <Text style={[styles.emptyAppsSub, { color: colors.outline }]}>
              Tap to choose apps to block during your session
            </Text>
            <View style={[styles.emptyAppsBtn, { backgroundColor: colors.primary }]}>
              <MaterialIcons name="add" size={16} color="#fff" />
              <Text style={styles.emptyAppsBtnText}>Choose Apps</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={[styles.appsCard, { backgroundColor: colors.card }]}>
            {ALL_APPS.filter((a) => blockedApps.includes(a.name)).map((app, i, arr) => (
              <View
                key={app.name}
                style={[styles.appRow, i < arr.length - 1 && { marginBottom: 14 }]}
              >
                <View style={[styles.appIconWrap, { backgroundColor: colors.primary }]}>
                  <MaterialIcons name={app.icon} size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.appName, { color: colors.onSurface }]}>{app.name}</Text>
                  <Text style={[styles.appCategory, { color: colors.outline }]}>{app.category}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); toggleApp(app.name); }}
                  hitSlop={8}
                >
                  <MaterialIcons name="remove-circle" size={24} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </Animated.View>
    </ScrollView>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />

      {/* Keyboard-aware scroll area */}
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {scrollContent}
      </KeyboardAvoidingView>

      {/* Sticky start button — always visible, never pushed by keyboard */}
      <View
        style={[
          styles.stickyBottom,
          { paddingBottom: bottomPad + 12, backgroundColor: colors.background },
        ]}
      >
        <TouchableOpacity
          style={[styles.startBtn, { backgroundColor: colors.primary }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); }}
          activeOpacity={0.85}
        >
          <MaterialIcons name="play-arrow" size={22} color="#fff" />
          <Text style={styles.startBtnText}>Start {duration} Min Session</Text>
        </TouchableOpacity>
      </View>

      {/* App picker modal */}
      <AppPickerModal
        visible={showPicker}
        blockedApps={blockedApps}
        onToggle={toggleApp}
        onClose={() => setShowPicker(false)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:  { flex: 1 },
  flex1: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },

  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },

  ringWrapper:   { alignItems: "center" },
  ringContainer: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  ringCenter:    { position: "absolute", alignItems: "center" },
  ringTime:      { fontSize: 48, fontFamily: "Inter_700Bold", letterSpacing: -2 },
  ringSubLabel:  { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 2.5, marginTop: 2 },

  intentionCard:   { borderRadius: 18, flexDirection: "row", overflow: "hidden", elevation: 2 },
  intentionAccent: { width: 4 },
  intentionInner:  { flex: 1, padding: 16, gap: 10 },
  intentionHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  intentionLabel:  { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  intentionInput:  {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  section:      { gap: 10 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.8 },

  durationRow: { flexDirection: "row", gap: 12 },
  durationCard: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    gap: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  durationMins:  { fontSize: 22, fontFamily: "Inter_700Bold" },
  durationLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  durationHint:  { fontSize: 9, fontFamily: "Inter_400Regular", letterSpacing: 0.2 },

  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
  },
  customRowText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },

  customInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  customInputField: {
    flex: 1,
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    borderBottomWidth: 2,
    paddingBottom: 2,
    textAlign: "center",
    minWidth: 70,
  },
  customInputUnit:   { fontSize: 14, fontFamily: "Inter_400Regular" },
  customConfirmBtn:  { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  customConfirmText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },

  restrictedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  restrictedRight:  { flexDirection: "row", alignItems: "center", gap: 8 },
  blockedBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  blockedBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  addBtnSmall:      { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },

  emptyAppsCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyAppsIcon:    { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  emptyAppsTitle:   { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyAppsSub:     { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  emptyAppsBtn:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 6 },
  emptyAppsBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },

  appsCard:    { borderRadius: 18, padding: 16, elevation: 2 },
  appRow:      { flexDirection: "row", alignItems: "center", gap: 12 },
  appIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  appName:     { fontSize: 14, fontFamily: "Inter_500Medium" },
  appCategory: { fontSize: 11, fontFamily: "Inter_400Regular" },

  stickyBottom: {
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  startBtn:     { height: 56, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  startBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "75%",
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHandle:       { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalHeader:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modalTitle:        { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSub:          { fontSize: 13, fontFamily: "Inter_400Regular" },
  appPickerRow:      { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13 },
  appPickerIcon:     { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  appPickerName:     { fontSize: 15, fontFamily: "Inter_500Medium" },
  appPickerCategory: { fontSize: 11, fontFamily: "Inter_400Regular" },
  appPickerToggle:   { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
