import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;

// ── Session states ─────────────────────────────────────────────────────────────
type SessionState = "idle" | "running" | "paused" | "done";

// ── Duration options ───────────────────────────────────────────────────────────
const DURATION_OPTIONS = [
  { minutes: 15, label: "Sprint", hint: "Quick burst", icon: "bolt" as const },
  { minutes: 25, label: "Pomodoro", hint: "Classic",  icon: "timer" as const },
  { minutes: 45, label: "Deep",   hint: "Flow state",  icon: "psychology" as const },
  { minutes: 60, label: "Flow",   hint: "Full hour",   icon: "self-improvement" as const },
];

// ── Mood options ───────────────────────────────────────────────────────────────
const MOODS = [
  { emoji: "😴", label: "Tired" },
  { emoji: "😕", label: "Meh" },
  { emoji: "🙂", label: "Okay" },
  { emoji: "😊", label: "Good" },
  { emoji: "🔥", label: "Flow" },
];

// ── Apps pool ──────────────────────────────────────────────────────────────────
type AppEntry = {
  name: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  category: string;
};

const ALL_APPS: AppEntry[] = [
  { name: "Instagram", icon: "photo-camera",       category: "Social"        },
  { name: "TikTok",    icon: "music-video",         category: "Entertainment" },
  { name: "YouTube",   icon: "play-circle-filled",  category: "Video"         },
  { name: "Twitter",   icon: "alternate-email",     category: "Social"        },
  { name: "Reddit",    icon: "forum",               category: "Social"        },
  { name: "Facebook",  icon: "people",              category: "Social"        },
  { name: "Snapchat",  icon: "camera-alt",          category: "Social"        },
  { name: "Netflix",   icon: "tv",                  category: "Video"         },
  { name: "Discord",   icon: "headset",             category: "Chat"          },
  { name: "Twitch",    icon: "videogame-asset",     category: "Gaming"        },
];

// ── Ring constants ─────────────────────────────────────────────────────────────
const RING_SIZE    = 220;
const STROKE_WIDTH = 12;
const RADIUS       = (RING_SIZE - STROKE_WIDTH) / 2;
const CENTER       = RING_SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_DEGREES  = 300;
const GAP_DEGREES  = 360 - ARC_DEGREES;
const ARC_LENGTH   = (ARC_DEGREES / 360) * CIRCUMFERENCE;
const GAP_LENGTH   = (GAP_DEGREES / 360) * CIRCUMFERENCE;
const RING_ROTATION = -90 + GAP_DEGREES / 2;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Format seconds ─────────────────────────────────────────────────────────────
function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Timer ring ─────────────────────────────────────────────────────────────────
function TimerRing({
  totalSecs,
  remainingSecs,
  sessionState,
  onPause,
  onResume,
}: {
  totalSecs: number;
  remainingSecs: number;
  sessionState: SessionState;
  onPause: () => void;
  onResume: () => void;
}) {
  const colors  = useColors();
  const fillPct = useSharedValue(0);

  useEffect(() => {
    const pct = totalSecs > 0 ? 1 - remainingSecs / totalSecs : 0;
    fillPct.value = withTiming(pct, { duration: 900 });
  }, [remainingSecs, totalSecs]);

  const animatedProps = useAnimatedProps(() => {
    const filled = fillPct.value * ARC_LENGTH;
    return {
      strokeDasharray: `${filled} ${CIRCUMFERENCE - filled}`,
    };
  });

  const isActive = sessionState === "running" || sessionState === "paused";
  const displayTime = sessionState === "idle"
    ? `${String(Math.floor(totalSecs / 60)).padStart(2, "0")}:00`
    : formatTime(remainingSecs);

  // Pulse ring when running
  const pulseScale = useSharedValue(1);
  useEffect(() => {
    if (sessionState === "running") {
      pulseScale.value = withSpring(1.015, { damping: 4, stiffness: 60 });
      const t = setTimeout(() => { pulseScale.value = withSpring(1, { damping: 4, stiffness: 60 }); }, 600);
      return () => clearTimeout(t);
    }
  }, [Math.floor((totalSecs - remainingSecs) / 10)]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));

  return (
    <View style={styles.ringWrapper}>
      <Animated.View style={pulseStyle}>
        <View style={styles.ringContainer}>
          <Svg
            width={RING_SIZE}
            height={RING_SIZE}
            style={{ transform: [{ rotate: `${RING_ROTATION}deg` }] }}
          >
            {/* Track */}
            <Circle
              cx={CENTER} cy={CENTER} r={RADIUS}
              fill="none"
              stroke={colors.surfaceContainerHighest}
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={`${ARC_LENGTH} ${GAP_LENGTH}`}
              strokeLinecap="round"
            />
            {/* Progress */}
            <AnimatedCircle
              cx={CENTER} cy={CENTER} r={RADIUS}
              fill="none"
              stroke={sessionState === "paused" ? colors.outline : colors.primary}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              animatedProps={animatedProps}
            />
          </Svg>

          {/* Center content */}
          <View style={styles.ringCenter} pointerEvents="none">
            <Text style={[styles.ringTime, { color: colors.onSurface }]}>{displayTime}</Text>
            <Text style={[styles.ringSubLabel, { color: colors.outline }]}>
              {sessionState === "idle"   ? "MINUTES"  :
               sessionState === "paused" ? "PAUSED"   :
               sessionState === "done"   ? "COMPLETE" : "REMAINING"}
            </Text>
          </View>

          {/* Pause / resume tap zone */}
          {isActive && (
            <TouchableOpacity
              style={styles.ringTapZone}
              onPress={sessionState === "running" ? onPause : onResume}
              activeOpacity={0.7}
            >
              <View style={[styles.ringPauseBtn, { backgroundColor: colors.primary }]}>
                <MaterialIcons
                  name={sessionState === "paused" ? "play-arrow" : "pause"}
                  size={26}
                  color="#fff"
                />
              </View>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Streak chip */}
      <View style={[styles.streakChip, { backgroundColor: colors.card }]}>
        <Text style={styles.streakFire}>🔥</Text>
        <Text style={[styles.streakText, { color: colors.onSurface }]}>12 sessions this week</Text>
      </View>
    </View>
  );
}

// ── Mood picker ────────────────────────────────────────────────────────────────
function MoodPicker({ selected, onSelect }: { selected: number | null; onSelect: (i: number) => void }) {
  const colors = useColors();
  return (
    <View style={[styles.moodCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.moodLabel, { color: colors.outline }]}>HOW ARE YOU FEELING?</Text>
      <View style={styles.moodRow}>
        {MOODS.map((m, i) => {
          const active = selected === i;
          return (
            <TouchableOpacity
              key={m.label}
              style={[
                styles.moodBtn,
                { backgroundColor: active ? colors.primary : colors.surfaceContainerHigh },
              ]}
              onPress={() => { Haptics.selectionAsync(); onSelect(i); }}
              activeOpacity={0.8}
            >
              <Text style={styles.moodEmoji}>{m.emoji}</Text>
              <Text style={[styles.moodBtnLabel, { color: active ? "#fff" : colors.outline }]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Duration card ──────────────────────────────────────────────────────────────
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
  const colors = useColors();
  const scale  = useSharedValue(1);
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
        <MaterialIcons
          name={option.icon}
          size={18}
          color={isActive ? "rgba(255,255,255,0.85)" : colors.outline}
        />
        <Text style={[styles.durationMins, { color: isActive ? "#fff" : colors.onSurface }]}>
          {option.minutes}
        </Text>
        <Text style={[styles.durationLabel, { color: isActive ? "rgba(255,255,255,0.85)" : colors.outline }]}>
          {option.label}
        </Text>
        <Text style={[styles.durationHint, { color: isActive ? "rgba(255,255,255,0.5)" : colors.outlineVariant }]}>
          {option.hint}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── App picker modal ───────────────────────────────────────────────────────────
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.modalHandle, { backgroundColor: colors.surfaceContainerHighest }]} />
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.onSurface }]}>App Blocker</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <MaterialIcons name="close" size={22} color={colors.outline} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.modalSub, { color: colors.outline }]}>
          Block distracting apps during your session
        </Text>
        <ScrollView style={{ marginTop: 12 }} showsVerticalScrollIndicator={false}>
          {ALL_APPS.map((app, i) => {
            const isBlocked = blockedApps.includes(app.name);
            return (
              <TouchableOpacity
                key={app.name}
                style={[
                  styles.appPickerRow,
                  i < ALL_APPS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerHigh },
                ]}
                onPress={() => { Haptics.selectionAsync(); onToggle(app.name); }}
                activeOpacity={0.7}
              >
                <View style={[styles.appPickerIcon, { backgroundColor: isBlocked ? colors.primary : colors.surfaceContainerHigh }]}>
                  <MaterialIcons name={app.icon} size={18} color={isBlocked ? "#fff" : colors.outline} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.appPickerName, { color: colors.onSurface }]}>{app.name}</Text>
                  <Text style={[styles.appPickerCategory, { color: colors.outline }]}>{app.category}</Text>
                </View>
                <View style={[styles.appPickerToggle, { backgroundColor: isBlocked ? colors.primary : colors.surfaceContainerHigh }]}>
                  <MaterialIcons name={isBlocked ? "check" : "add"} size={14} color={isBlocked ? "#fff" : colors.outline} />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Session complete overlay ───────────────────────────────────────────────────
function SessionCompleteOverlay({
  duration,
  intention,
  onDismiss,
}: {
  duration: number;
  intention: string;
  onDismiss: () => void;
}) {
  const colors = useColors();
  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      exiting={FadeOut.duration(300)}
      style={[styles.completeOverlay, { backgroundColor: colors.background }]}
    >
      <Text style={styles.completeEmoji}>🎉</Text>
      <Text style={[styles.completeTitle, { color: colors.onSurface }]}>Session Complete!</Text>
      <Text style={[styles.completeSub, { color: colors.outline }]}>
        You focused for {duration} minutes
        {intention ? ` on "${intention}"` : ""}.
      </Text>
      <View style={styles.completeStats}>
        <View style={[styles.completeStat, { backgroundColor: colors.card }]}>
          <Text style={[styles.completeStatVal, { color: colors.onSurface }]}>{duration}m</Text>
          <Text style={[styles.completeStatLabel, { color: colors.outline }]}>Duration</Text>
        </View>
        <View style={[styles.completeStat, { backgroundColor: colors.card }]}>
          <Text style={[styles.completeStatVal, { color: colors.onSurface }]}>+1</Text>
          <Text style={[styles.completeStatLabel, { color: colors.outline }]}>Session</Text>
        </View>
        <View style={[styles.completeStat, { backgroundColor: colors.card }]}>
          <Text style={[styles.completeStatVal, { color: "#16a34a" }]}>🔥 13</Text>
          <Text style={[styles.completeStatLabel, { color: colors.outline }]}>This Week</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.completeDoneBtn, { backgroundColor: colors.primary }]}
        onPress={onDismiss}
        activeOpacity={0.85}
      >
        <Text style={styles.completeDoneBtnText}>Done</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function FocusScreen() {
  const colors    = useColors();
  const insets    = useSafeAreaInsets();
  const topPad    = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  // Config state (editable only when idle)
  const [duration,    setDuration]    = useState(25);
  const [intention,   setIntention]   = useState("");
  const [mood,        setMood]        = useState<number | null>(null);
  const [blockedApps, setBlockedApps] = useState<string[]>(["Instagram", "TikTok", "YouTube"]);
  const [showPicker,  setShowPicker]  = useState(false);
  const [showCustom,  setShowCustom]  = useState(false);
  const [customInput, setCustomInput] = useState("");
  const customRef = useRef<TextInput>(null);

  // Timer state
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [remaining,    setRemaining]    = useState(duration * 60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSecs = duration * 60;

  // Sync remaining when duration changes (only when idle)
  useEffect(() => {
    if (sessionState === "idle") setRemaining(duration * 60);
  }, [duration, sessionState]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearTimer();
          setSessionState("done");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setRemaining(duration * 60);
    setSessionState("running");
    startTimer();
  };

  const handlePause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearTimer();
    setSessionState("paused");
  };

  const handleResume = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSessionState("running");
    startTimer();
  };

  const handleStop = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearTimer();
    setSessionState("idle");
    setRemaining(duration * 60);
  };

  const handleDone = () => {
    setSessionState("idle");
    setRemaining(duration * 60);
    setIntention("");
    setMood(null);
  };

  useEffect(() => () => clearTimer(), [clearTimer]);

  const cardW = (SCREEN_W - 40 - 12 * 3) / 4;
  const isActive = sessionState === "running" || sessionState === "paused";

  const toggleApp = (name: string) => {
    setBlockedApps((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  };

  const handleCustomConfirm = () => {
    const val = parseInt(customInput, 10);
    if (!isNaN(val) && val >= 1 && val <= 240) setDuration(val);
    setShowCustom(false);
    setCustomInput("");
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />

      {/* Session complete overlay */}
      {sessionState === "done" && (
        <SessionCompleteOverlay
          duration={duration}
          intention={intention}
          onDismiss={handleDone}
        />
      )}

      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: topPad + 12, paddingBottom: bottomPad + 140 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={isWeb ? undefined : FadeInDown.delay(0).springify()}>
            <View style={styles.headerRow}>
              <Text style={[styles.headerTitle, { color: colors.onSurface }]}>FOCUS MODE</Text>
              {isActive && (
                <TouchableOpacity
                  style={[styles.stopChip, { backgroundColor: colors.surfaceContainerHigh }]}
                  onPress={handleStop}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="stop" size={14} color={colors.onSurface} />
                  <Text style={[styles.stopChipText, { color: colors.onSurface }]}>End</Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>

          {/* Timer ring */}
          <Animated.View entering={isWeb ? undefined : FadeInDown.delay(50).springify()} style={styles.ringWrapper}>
            <TimerRing
              totalSecs={totalSecs}
              remainingSecs={remaining}
              sessionState={sessionState}
              onPause={handlePause}
              onResume={handleResume}
            />
          </Animated.View>

          {/* Only show config sections when idle */}
          {sessionState === "idle" && (
            <>
              {/* Mood check-in */}
              <Animated.View entering={isWeb ? undefined : FadeInDown.delay(80).springify()}>
                <MoodPicker selected={mood} onSelect={setMood} />
              </Animated.View>

              {/* Intention */}
              <Animated.View
                entering={isWeb ? undefined : FadeInDown.delay(110).springify()}
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
                entering={isWeb ? undefined : FadeInDown.delay(140).springify()}
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

                {/* Custom toggle */}
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
                    if (!showCustom) setTimeout(() => customRef.current?.focus(), 80);
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="tune" size={16} color={showCustom ? "#fff" : colors.onSurface} />
                  <Text style={[styles.customRowText, { color: showCustom ? "#fff" : colors.onSurface }]}>
                    {showCustom ? "Custom — enter minutes" : "Set Custom Duration"}
                  </Text>
                  <MaterialIcons
                    name={showCustom ? "expand-less" : "expand-more"}
                    size={18}
                    color={showCustom ? "#fff" : colors.outline}
                  />
                </TouchableOpacity>

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
                entering={isWeb ? undefined : FadeInDown.delay(170).springify()}
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
                    <TouchableOpacity
                      style={[styles.addBtnSmall, { backgroundColor: colors.primary }]}
                      onPress={() => { Haptics.selectionAsync(); setShowPicker(true); }}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="add" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>

                {blockedApps.length === 0 ? (
                  <TouchableOpacity
                    style={[styles.emptyAppsCard, { backgroundColor: colors.card, borderColor: colors.surfaceContainerHigh }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPicker(true); }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.emptyAppsIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
                      <MaterialIcons name="block" size={24} color={colors.outline} />
                    </View>
                    <Text style={[styles.emptyAppsTitle, { color: colors.onSurface }]}>No apps blocked</Text>
                    <Text style={[styles.emptyAppsSub, { color: colors.outline }]}>
                      Block distracting apps during your focus session
                    </Text>
                    <View style={[styles.emptyAppsBtn, { backgroundColor: colors.primary }]}>
                      <MaterialIcons name="add" size={16} color="#fff" />
                      <Text style={styles.emptyAppsBtnText}>Choose Apps</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  /* Pill row of blocked app icons */
                  <View style={[styles.blockedPillsCard, { backgroundColor: colors.card }]}>
                    <View style={styles.blockedPillsRow}>
                      {ALL_APPS.filter((a) => blockedApps.includes(a.name)).map((app) => (
                        <TouchableOpacity
                          key={app.name}
                          style={styles.blockedPill}
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); toggleApp(app.name); }}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.blockedPillIcon, { backgroundColor: colors.primary }]}>
                            <MaterialIcons name={app.icon} size={16} color="#fff" />
                          </View>
                          <Text style={[styles.blockedPillName, { color: colors.onSurface }]}>{app.name}</Text>
                          <View style={[styles.blockedPillRemove, { backgroundColor: colors.surfaceContainerHigh }]}>
                            <MaterialIcons name="close" size={10} color={colors.outline} />
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={[styles.blockedPillsHint, { color: colors.outline }]}>
                      Tap an app to unblock it
                    </Text>
                  </View>
                )}
              </Animated.View>
            </>
          )}

          {/* Running state: intention reminder pill */}
          {isActive && intention.length > 0 && (
            <Animated.View
              entering={isWeb ? undefined : FadeInDown.springify()}
              style={[styles.intentionPill, { backgroundColor: colors.card }]}
            >
              <MaterialIcons name="lightbulb" size={14} color={colors.outline} />
              <Text style={[styles.intentionPillText, { color: colors.outline }]} numberOfLines={1}>
                {intention}
              </Text>
            </Animated.View>
          )}

          {/* Running state: blocked apps reminder */}
          {isActive && blockedApps.length > 0 && (
            <Animated.View
              entering={isWeb ? undefined : FadeInDown.delay(50).springify()}
              style={[styles.blockedReminder, { backgroundColor: colors.card }]}
            >
              <MaterialIcons name="block" size={16} color={colors.outline} />
              <Text style={[styles.blockedReminderText, { color: colors.outline }]}>
                {blockedApps.length} app{blockedApps.length !== 1 ? "s" : ""} blocked for this session
              </Text>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky start / action button */}
      <View
        style={[
          styles.stickyBottom,
          { paddingBottom: bottomPad + 12, backgroundColor: colors.background },
        ]}
      >
        {sessionState === "idle" && (
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: colors.primary }]}
            onPress={handleStart}
            activeOpacity={0.85}
          >
            <MaterialIcons name="play-arrow" size={24} color="#fff" />
            <Text style={styles.startBtnText}>Start {duration} Min Session</Text>
          </TouchableOpacity>
        )}
        {sessionState === "running" && (
          <View style={styles.activeActions}>
            <TouchableOpacity
              style={[styles.actionBtnSecondary, { backgroundColor: colors.surfaceContainerHigh }]}
              onPress={handleStop}
              activeOpacity={0.8}
            >
              <MaterialIcons name="stop" size={20} color={colors.onSurface} />
              <Text style={[styles.actionBtnSecondaryText, { color: colors.onSurface }]}>End</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtnPrimary, { backgroundColor: colors.primary }]}
              onPress={handlePause}
              activeOpacity={0.85}
            >
              <MaterialIcons name="pause" size={24} color="#fff" />
              <Text style={styles.actionBtnPrimaryText}>Pause</Text>
            </TouchableOpacity>
          </View>
        )}
        {sessionState === "paused" && (
          <View style={styles.activeActions}>
            <TouchableOpacity
              style={[styles.actionBtnSecondary, { backgroundColor: colors.surfaceContainerHigh }]}
              onPress={handleStop}
              activeOpacity={0.8}
            >
              <MaterialIcons name="stop" size={20} color={colors.onSurface} />
              <Text style={[styles.actionBtnSecondaryText, { color: colors.onSurface }]}>End</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtnPrimary, { backgroundColor: colors.primary }]}
              onPress={handleResume}
              activeOpacity={0.85}
            >
              <MaterialIcons name="play-arrow" size={24} color="#fff" />
              <Text style={styles.actionBtnPrimaryText}>Resume</Text>
            </TouchableOpacity>
          </View>
        )}
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

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:  { flex: 1 },
  flex1: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },

  headerRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  stopChip:   { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  stopChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Ring
  ringWrapper:   { alignItems: "center", gap: 14 },
  ringContainer: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  ringCenter:    { position: "absolute", alignItems: "center" },
  ringTime:      { fontSize: 44, fontFamily: "Inter_700Bold", letterSpacing: -2 },
  ringSubLabel:  { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 2.5, marginTop: 2 },
  ringTapZone:   { position: "absolute", bottom: 6, alignSelf: "center" },
  ringPauseBtn:  { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  streakChip:    { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  streakFire:    { fontSize: 14 },
  streakText:    { fontSize: 12, fontFamily: "Inter_500Medium" },

  // Mood
  moodCard:   { borderRadius: 18, padding: 16, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  moodLabel:  { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.8 },
  moodRow:    { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  moodBtn:    { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 14, gap: 4 },
  moodEmoji:  { fontSize: 20 },
  moodBtnLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },

  // Intention
  intentionCard:   { borderRadius: 18, flexDirection: "row", overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  intentionAccent: { width: 4 },
  intentionInner:  { flex: 1, padding: 16, gap: 10 },
  intentionHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  intentionLabel:  { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  intentionInput:  { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },

  // Running state pills
  intentionPill:     { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  intentionPillText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  blockedReminder:   { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  blockedReminderText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  // Section
  section:      { gap: 10 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.8 },

  // Duration cards
  durationRow: { flexDirection: "row", gap: 12 },
  durationCard: { paddingVertical: 14, borderRadius: 16, alignItems: "center", gap: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  durationMins:  { fontSize: 22, fontFamily: "Inter_700Bold" },
  durationLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  durationHint:  { fontSize: 9, fontFamily: "Inter_400Regular", letterSpacing: 0.2 },

  // Custom duration
  customRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1 },
  customRowText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  customInputRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  customInputField: { width: 72, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  customInputUnit: { fontSize: 14, fontFamily: "Inter_400Regular" },
  customConfirmBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  customConfirmText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },

  // Restricted access
  restrictedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  restrictedRight:  { flexDirection: "row", alignItems: "center", gap: 8 },
  blockedBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  blockedBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  addBtnSmall:      { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },

  emptyAppsCard:   { borderRadius: 18, padding: 20, alignItems: "center", gap: 8, borderWidth: 1 },
  emptyAppsIcon:   { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyAppsTitle:  { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyAppsSub:    { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  emptyAppsBtn:    { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 6 },
  emptyAppsBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },

  // Blocked pills
  blockedPillsCard:  { borderRadius: 18, padding: 16, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  blockedPillsRow:   { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  blockedPill:       { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 7, paddingLeft: 8, paddingRight: 8, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.04)" },
  blockedPillIcon:   { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  blockedPillName:   { fontSize: 12, fontFamily: "Inter_500Medium" },
  blockedPillRemove: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  blockedPillsHint:  { fontSize: 10, fontFamily: "Inter_400Regular" },

  // Sticky bottom
  stickyBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  startBtn:     { height: 58, borderRadius: 29, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4 },
  startBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  activeActions:       { flexDirection: "row", gap: 12 },
  actionBtnSecondary:  { height: 58, flex: 0.38, borderRadius: 29, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionBtnSecondaryText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  actionBtnPrimary:    { height: 58, flex: 0.62, borderRadius: 29, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4 },
  actionBtnPrimaryText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  // App picker modal
  modalOverlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  modalSheet:    { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: "75%" },
  modalHandle:   { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modalTitle:    { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSub:      { fontSize: 13, fontFamily: "Inter_400Regular" },
  appPickerRow:  { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  appPickerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  appPickerName:     { fontSize: 14, fontFamily: "Inter_500Medium" },
  appPickerCategory: { fontSize: 11, fontFamily: "Inter_400Regular" },
  appPickerToggle:   { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },

  // Session complete
  completeOverlay:   { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, zIndex: 100 },
  completeEmoji:     { fontSize: 64, marginBottom: 12 },
  completeTitle:     { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 8, textAlign: "center" },
  completeSub:       { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 28 },
  completeStats:     { flexDirection: "row", gap: 12, marginBottom: 32 },
  completeStat:      { flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 16 },
  completeStatVal:   { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 4 },
  completeStatLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  completeDoneBtn:   { height: 58, borderRadius: 29, paddingHorizontal: 48, alignItems: "center", justifyContent: "center" },
  completeDoneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
