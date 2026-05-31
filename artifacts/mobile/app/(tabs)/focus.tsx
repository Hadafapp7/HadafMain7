import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
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
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb    = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;

// ── Session states ─────────────────────────────────────────────────────────────
type SessionState = "idle" | "running" | "paused" | "done";

// ── Duration options ───────────────────────────────────────────────────────────
const DURATION_OPTIONS = [
  { minutes: 15, label: "Sprint" },
  { minutes: 30, label: "Focus"  },
  { minutes: 45, label: "Deep"   },
  { minutes: 60, label: "Flow"   },
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
const RING_SIZE     = 240;
const STROKE_WIDTH  = 14;
const RADIUS        = (RING_SIZE - STROKE_WIDTH) / 2;
const CENTER        = RING_SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_DEGREES   = 300;
const GAP_DEGREES   = 360 - ARC_DEGREES;
const ARC_LENGTH    = (ARC_DEGREES / 360) * CIRCUMFERENCE;
const GAP_LENGTH    = (GAP_DEGREES  / 360) * CIRCUMFERENCE;
const RING_ROTATION = -90 + GAP_DEGREES / 2;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Format time ────────────────────────────────────────────────────────────────
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
  duration,
}: {
  totalSecs: number;
  remainingSecs: number;
  sessionState: SessionState;
  duration: number;
}) {
  const colors  = useColors();
  const fillPct = useSharedValue(0);

  useEffect(() => {
    const pct = totalSecs > 0 ? 1 - remainingSecs / totalSecs : 0;
    fillPct.value = withTiming(pct, { duration: 800 });
  }, [remainingSecs, totalSecs]);

  const animatedProps = useAnimatedProps(() => {
    const filled = fillPct.value * ARC_LENGTH;
    return { strokeDasharray: `${filled} ${CIRCUMFERENCE - filled}` };
  });

  const displayTime = sessionState === "idle"
    ? `${String(duration).padStart(2, "0")}:00`
    : formatTime(remainingSecs);

  return (
    <View style={styles.ringWrapper}>
      <View style={styles.ringContainer}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={{ transform: [{ rotate: `${RING_ROTATION}deg` }] }}>
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
            stroke={sessionState === "paused" ? colors.outline : colors.primary}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            animatedProps={animatedProps}
          />
        </Svg>
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={[styles.ringTime, { color: colors.onSurface }]}>{displayTime}</Text>
          <Text style={[styles.ringSubLabel, { color: colors.outline }]}>
            {sessionState === "idle"   ? "MINUTES"  :
             sessionState === "paused" ? "PAUSED"   :
             sessionState === "done"   ? "COMPLETE" : "REMAINING"}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── App picker modal ───────────────────────────────────────────────────────────
function AppPickerModal({
  visible, blockedApps, onToggle, onClose,
}: {
  visible: boolean; blockedApps: string[];
  onToggle: (name: string) => void; onClose: () => void;
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
        <Text style={[styles.modalSub, { color: colors.outline }]}>Block distracting apps during your session</Text>
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
                  <Text style={[styles.appPickerName,     { color: colors.onSurface }]}>{app.name}</Text>
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
function SessionCompleteOverlay({ duration, intention, onDismiss }: {
  duration: number; intention: string; onDismiss: () => void;
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
        You focused for {duration} minutes{intention ? ` on "${intention}"` : ""}.
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

// ── Duration card ─────────────────────────────────────────────────────────────
function DurationCard({ option, isActive, cardWidth, onPress }: {
  option: (typeof DURATION_OPTIONS)[0]; isActive: boolean; cardWidth: number; onPress: () => void;
}) {
  const colors = useColors();
  const scale  = useSharedValue(1);
  const anim   = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[anim, { width: cardWidth }]}>
      <TouchableOpacity
        style={[styles.durationCard, { backgroundColor: isActive ? colors.primary : colors.card }]}
        onPressIn={() => { scale.value = withSpring(0.92, { damping: 12 }); }}
        onPressOut={() => { scale.value = withSpring(1,    { damping: 12 }); }}
        onPress={onPress}
        activeOpacity={1}
      >
        <Text style={[styles.durationMins, { color: isActive ? "#fff" : colors.onSurface }]}>{option.minutes}</Text>
        <Text style={[styles.durationLabel, { color: isActive ? "rgba(255,255,255,0.7)" : colors.outline }]}>{option.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ visible, duration, onConfirm, onClose }: {
  visible: boolean; duration: number; onConfirm: () => void; onClose: () => void;
}) {
  const colors  = useColors();
  const scale   = useSharedValue(0.85);
  const opacity = useSharedValue(0);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (visible) {
      scale.value   = withSpring(1, { damping: 16, stiffness: 120 });
      opacity.value = withTiming(1, { duration: 200 });
      setChecked(false);
    } else {
      scale.value   = 0.85;
      opacity.value = 0;
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.confirmOuter}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <Animated.View
          style={[styles.confirmSheet, { backgroundColor: colors.card }, sheetStyle]}
          onStartShouldSetResponder={() => true}
        >
          <View style={[styles.confirmIconRing, { backgroundColor: colors.surfaceContainerHigh }]}>
            <MaterialIcons name="bolt" size={32} color={colors.onSurface} />
          </View>
          <Text style={[styles.confirmTitle, { color: colors.onSurface }]}>Ready to Focus?</Text>
          <Text style={[styles.confirmSub, { color: colors.outline }]}>
            You're starting a {duration}-minute focused session.{"\n"}Apps will be blocked. Notifications silenced.
          </Text>

          <TouchableOpacity
            style={[styles.checkRow, { backgroundColor: colors.surfaceContainerHigh }]}
            onPress={() => { Haptics.selectionAsync(); setChecked((v) => !v); }}
            activeOpacity={0.8}
          >
            <View style={[
              styles.checkbox,
              { borderColor: checked ? colors.primary : colors.outline },
              checked && { backgroundColor: colors.primary },
            ]}>
              {checked && <MaterialIcons name="check" size={13} color="#fff" />}
            </View>
            <Text style={[styles.checkLabel, { color: colors.onSurface }]}>I'm ready to focus</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.confirmBtn,
              { backgroundColor: checked ? colors.primary : colors.surfaceContainerHighest },
            ]}
            onPress={() => { if (checked) onConfirm(); }}
            disabled={!checked}
            activeOpacity={0.85}
          >
            <MaterialIcons name="play-arrow" size={22} color={checked ? "#fff" : colors.outline} />
            <Text style={[styles.confirmBtnText, { color: checked ? "#fff" : colors.outline }]}>Start Session</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function FocusScreen() {
  const colors    = useColors();
  const insets    = useSafeAreaInsets();
  const topPad    = isWeb ? 67 : insets.top;
  const tabBarH   = isWeb ? 84 : 62 + insets.bottom;

  const [duration,    setDuration]    = useState(30);
  const [intention,   setIntention]   = useState("");
  const [blockedApps, setBlockedApps] = useState<string[]>(["Instagram", "TikTok", "YouTube"]);
  const [showPicker,  setShowPicker]  = useState(false);
  const [showCustom,  setShowCustom]  = useState(false);
  const [customInput, setCustomInput] = useState("");
  const customRef = useRef<TextInput>(null);

  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [remaining,    setRemaining]    = useState(duration * 60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalSecs   = duration * 60;

  // Validation errors + shake
  const [errors,      setErrors]      = useState({ intention: false, blockedApps: false });
  const [showConfirm, setShowConfirm] = useState(false);
  const shakeIntentionX = useSharedValue(0);
  const shakeAppsX      = useSharedValue(0);

  const intentionShakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeIntentionX.value }] }));
  const appsShakeStyle      = useAnimatedStyle(() => ({ transform: [{ translateX: shakeAppsX.value      }] }));

  useEffect(() => {
    if (sessionState === "idle") setRemaining(duration * 60);
  }, [duration, sessionState]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startTick = useCallback(() => {
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
    setShowConfirm(false);
    setRemaining(duration * 60);
    setSessionState("running");
    startTick();
  };

  // Attempt to start: validate first
  const handleAttemptStart = () => {
    const intentionOk = intention.trim().length > 0;
    const appsOk      = blockedApps.length > 0;
    const newErrors   = { intention: !intentionOk, blockedApps: !appsOk };
    setErrors(newErrors);

    if (!intentionOk) {
      shakeIntentionX.value = withSequence(
        withTiming(-10, { duration: 60 }), withTiming(10, { duration: 60 }),
        withTiming(-8,  { duration: 60 }), withTiming(8,  { duration: 60 }),
        withTiming(0,   { duration: 60 })
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    if (!appsOk) {
      shakeAppsX.value = withSequence(
        withTiming(-10, { duration: 60 }), withTiming(10, { duration: 60 }),
        withTiming(-8,  { duration: 60 }), withTiming(8,  { duration: 60 }),
        withTiming(0,   { duration: 60 })
      );
      if (intentionOk) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    if (intentionOk && appsOk) setShowConfirm(true);
  };

  const handlePause  = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); clearTimer(); setSessionState("paused"); };
  const handleResume = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSessionState("running"); startTick(); };
  const handleStop   = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); clearTimer(); setSessionState("idle"); setRemaining(duration * 60); };
  const handleDone   = () => { setSessionState("idle"); setRemaining(duration * 60); setIntention(""); };

  useEffect(() => () => clearTimer(), [clearTimer]);

  const isActive = sessionState === "running" || sessionState === "paused";
  const cardW    = (SCREEN_W - 40 - 9 * 3) / 4;

  const toggleApp = (name: string) => {
    setBlockedApps((prev) => {
      const next = prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name];
      if (next.length > 0 && errors.blockedApps) setErrors((e) => ({ ...e, blockedApps: false }));
      return next;
    });
  };

  const handleIntentionChange = (text: string) => {
    setIntention(text);
    if (text.trim().length > 0 && errors.intention) setErrors((e) => ({ ...e, intention: false }));
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

      {sessionState === "done" && (
        <SessionCompleteOverlay duration={duration} intention={intention} onDismiss={handleDone} />
      )}

      <ConfirmModal
        visible={showConfirm}
        duration={duration}
        onConfirm={handleStart}
        onClose={() => setShowConfirm(false)}
      />

      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Animated.ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: topPad + 12, paddingBottom: tabBarH + 90 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={isWeb ? undefined : FadeInDown.delay(0).springify()}>
            <View style={styles.headerRow}>
              <Text style={[styles.headerTitle, { color: colors.onSurface }]}>FOCUS MODE</Text>
            </View>
          </Animated.View>

          {/* Timer ring */}
          <Animated.View entering={isWeb ? undefined : FadeInDown.delay(40).springify()}>
            <TimerRing
              totalSecs={totalSecs}
              remainingSecs={remaining}
              sessionState={sessionState}
              duration={duration}
            />
          </Animated.View>

          {/* Config — hidden while active */}
          {!isActive && (
            <>
              {/* Intention — shake + red border on error */}
              <Animated.View entering={isWeb ? undefined : FadeInDown.delay(80).springify()}>
                <Animated.View style={intentionShakeStyle}>
                  <View style={[
                    styles.intentionCard,
                    { backgroundColor: colors.card },
                    errors.intention && { borderWidth: 1.5, borderColor: "#ef4444" },
                  ]}>
                    <View style={[styles.intentionAccent, { backgroundColor: errors.intention ? "#ef4444" : colors.primary }]} />
                    <View style={styles.intentionInner}>
                      <View style={styles.intentionHeader}>
                        <MaterialIcons
                          name="lightbulb"
                          size={16}
                          color={errors.intention ? "#ef4444" : colors.onSurface}
                        />
                        <Text style={[
                          styles.intentionLabel,
                          { color: errors.intention ? "#ef4444" : colors.onSurface },
                        ]}>
                          {errors.intention ? "INTENTION REQUIRED" : "SET AN INTENTION"}
                        </Text>
                      </View>
                      <TextInput
                        style={[
                          styles.intentionInput,
                          { backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface },
                          errors.intention && { borderWidth: 1, borderColor: "#ef444440" },
                        ]}
                        placeholder="What are you working on?"
                        placeholderTextColor={errors.intention ? "#ef444480" : colors.outline}
                        value={intention}
                        onChangeText={handleIntentionChange}
                        returnKeyType="done"
                      />
                    </View>
                  </View>
                </Animated.View>
              </Animated.View>

              {/* Duration */}
              <Animated.View
                entering={isWeb ? undefined : FadeInDown.delay(120).springify()}
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

                <TouchableOpacity
                  style={[styles.customRow, { backgroundColor: colors.card }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowCustom((v) => !v);
                    if (!showCustom) setTimeout(() => customRef.current?.focus(), 80);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.customRowText, { color: colors.onSurface }]}>
                    {showCustom ? "CUSTOM DURATION" : "SET CUSTOM DURATION"}
                  </Text>
                  <MaterialIcons name="edit" size={18} color={colors.outline} />
                </TouchableOpacity>

                {showCustom && (
                  <View style={[styles.customInputRow, { backgroundColor: colors.card }]}>
                    <TextInput
                      ref={customRef}
                      style={[styles.customInputField, { color: colors.onSurface, borderColor: colors.surfaceContainerHighest }]}
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

              {/* Restricted access — shake + red border on error */}
              <Animated.View entering={isWeb ? undefined : FadeInDown.delay(160).springify()}>
                <Animated.View style={[styles.section, appsShakeStyle]}>
                  <View style={styles.restrictedHeader}>
                    <Text style={[
                      styles.sectionLabel,
                      { color: errors.blockedApps ? "#ef4444" : colors.outline },
                    ]}>
                      {errors.blockedApps ? "SELECT AT LEAST 1 APP" : "RESTRICTED ACCESS"}
                    </Text>
                    <View style={styles.restrictedRight}>
                      {blockedApps.length > 0 && (
                        <View style={[styles.blockedBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
                          <Text style={[styles.blockedBadgeText, { color: colors.onSurface }]}>
                            {blockedApps.length} APPS BLOCKED
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
                      style={[
                        styles.emptyAppsCard,
                        { backgroundColor: colors.card, borderColor: errors.blockedApps ? "#ef4444" : colors.surfaceContainerHigh },
                        errors.blockedApps && { borderWidth: 1.5 },
                      ]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPicker(true); }}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.emptyAppsIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
                        <MaterialIcons name="block" size={24} color={errors.blockedApps ? "#ef4444" : colors.outline} />
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
                    <View style={[styles.appsCard, { backgroundColor: colors.card }]}>
                      {ALL_APPS.filter((a) => blockedApps.includes(a.name)).map((app, i, arr) => (
                        <View
                          key={app.name}
                          style={[
                            styles.appRow,
                            i < arr.length - 1 && {
                              borderBottomWidth: 1,
                              borderBottomColor: colors.surfaceContainerHigh,
                              paddingBottom: 14,
                              marginBottom: 14,
                            },
                          ]}
                        >
                          <View style={[styles.appIconWrap, { backgroundColor: colors.primary }]}>
                            <MaterialIcons name={app.icon} size={18} color="#fff" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.appName,     { color: colors.onSurface }]}>{app.name}</Text>
                            <Text style={[styles.appCategory, { color: colors.outline }]}>{app.category}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); toggleApp(app.name); }}
                            hitSlop={8}
                          >
                            <MaterialIcons name="remove-circle" size={26} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </Animated.View>
              </Animated.View>
            </>
          )}

          {/* During session — intention + blocked reminder */}
          {isActive && intention.length > 0 && (
            <Animated.View
              entering={isWeb ? undefined : FadeInDown.springify()}
              style={[styles.intentionPill, { backgroundColor: colors.card }]}
            >
              <MaterialIcons name="lightbulb" size={14} color={colors.outline} />
              <Text style={[styles.intentionPillText, { color: colors.outline }]} numberOfLines={1}>{intention}</Text>
            </Animated.View>
          )}
          {isActive && blockedApps.length > 0 && (
            <Animated.View
              entering={isWeb ? undefined : FadeInDown.delay(40).springify()}
              style={[styles.blockedReminder, { backgroundColor: colors.card }]}
            >
              <MaterialIcons name="block" size={16} color={colors.outline} />
              <Text style={[styles.blockedReminderText, { color: colors.outline }]}>
                {blockedApps.length} app{blockedApps.length !== 1 ? "s" : ""} blocked
              </Text>
            </Animated.View>
          )}
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      {/* Floating Start / active buttons */}
      <View style={[styles.stickyBottom, { bottom: tabBarH + 16, left: 20, right: 20 }]}>
        {sessionState === "idle" && (
          <View style={[styles.startBtn, { backgroundColor: colors.primary, height: 58, borderRadius: 29 }]}>
            <TouchableOpacity
              style={styles.startBtnInner}
              onPress={handleAttemptStart}
              activeOpacity={0.85}
            >
              <MaterialIcons name="play-arrow" size={24} color="#fff" />
              <Text style={styles.startBtnText}>Start {duration} Min Session</Text>
            </TouchableOpacity>
          </View>
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
  content: { paddingHorizontal: 20, gap: 22 },

  headerRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },

  // Ring
  ringWrapper:   { alignItems: "center" },
  ringContainer: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  ringCenter:    { position: "absolute", alignItems: "center" },
  ringTime:      { fontSize: 48, fontFamily: "Inter_700Bold", letterSpacing: -2 },
  ringSubLabel:  { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 2.5, marginTop: 2 },

  // Floating button
  stickyBottom:  { position: "absolute" },
  startBtn:      { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8, overflow: "hidden" },
  startBtnInner: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  startBtnText:  { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  activeActions:        { flexDirection: "row", gap: 12 },
  actionBtnSecondary:   { height: 58, flex: 0.38, borderRadius: 29, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionBtnSecondaryText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  actionBtnPrimary:     { height: 58, flex: 0.62, borderRadius: 29, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4 },
  actionBtnPrimaryText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  // Intention
  intentionCard:   { borderRadius: 18, flexDirection: "row", overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  intentionAccent: { width: 4 },
  intentionInner:  { flex: 1, padding: 16, gap: 10 },
  intentionHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  intentionLabel:  { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  intentionInput:  { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },

  // Session pills
  intentionPill:      { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14 },
  intentionPillText:  { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  blockedReminder:    { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14 },
  blockedReminderText:{ fontSize: 13, fontFamily: "Inter_400Regular" },

  // Section
  section:      { gap: 12 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.8 },

  // Duration
  durationRow: { flexDirection: "row", gap: 9 },
  durationCard: { paddingVertical: 16, borderRadius: 18, alignItems: "center", gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  durationMins:  { fontSize: 24, fontFamily: "Inter_700Bold" },
  durationLabel: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 0.2 },

  // Custom duration
  customRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  customRowText:   { fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  customInputRow:  { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  customInputField:  { width: 72, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  customInputUnit:   { fontSize: 14, fontFamily: "Inter_400Regular" },
  customConfirmBtn:  { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  customConfirmText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },

  // Restricted
  restrictedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  restrictedRight:  { flexDirection: "row", alignItems: "center", gap: 8 },
  blockedBadge:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  blockedBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  addBtnSmall:      { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },

  emptyAppsCard:    { borderRadius: 18, padding: 20, alignItems: "center", gap: 8, borderWidth: 1 },
  emptyAppsIcon:    { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyAppsTitle:   { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyAppsSub:     { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  emptyAppsBtn:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 6 },
  emptyAppsBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },

  appsCard:    { borderRadius: 18, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  appRow:      { flexDirection: "row", alignItems: "center", gap: 12 },
  appIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  appName:     { fontSize: 14, fontFamily: "Inter_500Medium" },
  appCategory: { fontSize: 11, fontFamily: "Inter_400Regular" },

  // App picker modal
  modalOverlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  modalSheet:        { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: "75%" },
  modalHandle:       { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalHeader:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modalTitle:        { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSub:          { fontSize: 13, fontFamily: "Inter_400Regular" },
  appPickerRow:      { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  appPickerIcon:     { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  appPickerName:     { fontSize: 14, fontFamily: "Inter_500Medium" },
  appPickerCategory: { fontSize: 11, fontFamily: "Inter_400Regular" },
  appPickerToggle:   { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },

  // Confirm modal
  confirmOuter: { flex: 1, alignItems: "center", justifyContent: "center" },
  confirmSheet: { width: SCREEN_W * 0.88, borderRadius: 28, padding: 28, alignItems: "center", gap: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.20, shadowRadius: 32, elevation: 16 },
  confirmIconRing: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  confirmTitle:    { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  confirmSub:      { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  checkRow:        { flexDirection: "row", alignItems: "center", gap: 12, width: "100%", paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16 },
  checkbox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  checkLabel:      { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  confirmBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 56, width: "100%", borderRadius: 28 },
  confirmBtnText:  { fontSize: 16, fontFamily: "Inter_700Bold" },

  // Session complete
  completeOverlay:     { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, zIndex: 100 },
  completeEmoji:       { fontSize: 64, marginBottom: 12 },
  completeTitle:       { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 8, textAlign: "center" },
  completeSub:         { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 28 },
  completeStats:       { flexDirection: "row", gap: 12, marginBottom: 32 },
  completeStat:        { flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 16 },
  completeStatVal:     { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 4 },
  completeStatLabel:   { fontSize: 11, fontFamily: "Inter_400Regular" },
  completeDoneBtn:     { height: 58, borderRadius: 29, paddingHorizontal: 48, alignItems: "center", justifyContent: "center" },
  completeDoneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
