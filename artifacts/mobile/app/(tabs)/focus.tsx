import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
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
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;

const DURATIONS = [15, 30, 45, 60];

// Ring constants
const RING_SIZE = 220;
const STROKE_WIDTH = 10;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CENTER = RING_SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Arc spans 300° (60° gap at top-right)
const ARC_DEGREES = 300;
const GAP_DEGREES = 360 - ARC_DEGREES;
const ARC_LENGTH = (ARC_DEGREES / 360) * CIRCUMFERENCE;
const GAP_LENGTH = (GAP_DEGREES / 360) * CIRCUMFERENCE;
// Rotate so the gap sits at the top-right (start arc at bottom-left)
const RING_ROTATION = -90 + GAP_DEGREES / 2; // positions gap centered at top

const BLOCKED_APPS = [
  { name: "Instagram",  icon: "photo-camera"     as const },
  { name: "TikTok",     icon: "music-video"       as const },
  { name: "YouTube",    icon: "play-circle-filled" as const },
];

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function TimerRing({ duration }: { duration: number }) {
  const colors = useColors();
  const progress = useSharedValue(0.5); // 0–1 fraction of ARC_LENGTH

  useEffect(() => {
    // Scale so 60 min = full 300° arc; add 0.35 base so ring always looks substantial
    const raw = duration / 60;
    progress.value = withSpring(Math.min(1, raw + 0.35), { damping: 18, stiffness: 80 });
  }, [duration]);

  // Track (full 300° arc, gray)
  const trackDash = `${ARC_LENGTH} ${GAP_LENGTH}`;

  // Fill arc (proportional to duration)
  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${progress.value * ARC_LENGTH} ${CIRCUMFERENCE - progress.value * ARC_LENGTH}`,
  }));

  const minutes = String(duration).padStart(2, "0");

  return (
    <View style={styles.ringContainer}>
      <Svg
        width={RING_SIZE}
        height={RING_SIZE}
        style={{ transform: [{ rotate: `${RING_ROTATION}deg` }] }}
      >
        {/* Track */}
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke={colors.surfaceContainerHighest}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={trackDash}
          strokeLinecap="round"
        />
        {/* Fill */}
        <AnimatedCircle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke={colors.primary}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          animatedProps={animatedProps}
        />
      </Svg>

      {/* Center label */}
      <View style={styles.ringCenter} pointerEvents="none">
        <Text style={[styles.ringTime, { color: colors.onSurface }]}>
          {minutes}:00
        </Text>
        <Text style={[styles.ringSubLabel, { color: colors.outline }]}>MINUTES</Text>
      </View>
    </View>
  );
}

export default function FocusScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [duration, setDuration] = useState(30);
  const [intention, setIntention] = useState("");
  const [removedApps, setRemovedApps] = useState<string[]>([]);
  const topPad = isWeb ? 67 : insets.top;

  const blockedApps = BLOCKED_APPS.filter((a) => !removedApps.includes(a.name));

  const removeApp = (name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRemovedApps((prev) => [...prev, name]);
  };

  const selectDuration = (d: number) => {
    Haptics.selectionAsync();
    setDuration(d);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 16, paddingBottom: isWeb ? 34 + 84 : 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(0).springify()}
        >
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>FOCUS MODE</Text>
        </Animated.View>

        {/* Circular timer */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(60).springify()}
          style={styles.ringWrapper}
        >
          <TimerRing duration={duration} />
        </Animated.View>

        {/* Set an Intention */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(120).springify()}
          style={[styles.intentionCard, { backgroundColor: colors.card }]}
        >
          {/* Left accent bar */}
          <View style={[styles.intentionAccent, { backgroundColor: colors.primary }]} />

          <View style={styles.intentionInner}>
            <View style={styles.intentionHeader}>
              <MaterialIcons name="lightbulb" size={18} color={colors.onSurface} />
              <Text style={[styles.intentionLabel, { color: colors.onSurface }]}>
                SET AN INTENTION
              </Text>
            </View>
            <TextInput
              style={[styles.intentionInput, { backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface }]}
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
          entering={isWeb ? undefined : FadeInDown.delay(180).springify()}
          style={styles.section}
        >
          <Text style={[styles.sectionLabel, { color: colors.outline }]}>DURATION</Text>

          {/* Duration pills */}
          <View style={styles.durationPills}>
            {DURATIONS.map((d) => (
              <DurationPill
                key={d}
                value={d}
                isActive={duration === d}
                onPress={() => selectDuration(d)}
              />
            ))}
          </View>

          {/* Custom duration row */}
          <TouchableOpacity
            style={[styles.customDurationRow, { backgroundColor: colors.card }]}
            activeOpacity={0.7}
            onPress={() => Haptics.selectionAsync()}
          >
            <Text style={[styles.customDurationText, { color: colors.onSurface }]}>
              SET CUSTOM DURATION
            </Text>
            <MaterialIcons name="edit" size={18} color={colors.onSurface} />
          </TouchableOpacity>
        </Animated.View>

        {/* Restricted Access */}
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(240).springify()}
          style={styles.section}
        >
          <View style={styles.restrictedHeader}>
            <Text style={[styles.sectionLabel, { color: colors.outline }]}>RESTRICTED ACCESS</Text>
            <View style={[styles.blockedBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
              <Text style={[styles.blockedBadgeText, { color: colors.onSurface }]}>
                {blockedApps.length} APPS BLOCKED
              </Text>
            </View>
          </View>

          <View style={[styles.appsCard, { backgroundColor: colors.card }]}>
            {blockedApps.length === 0 ? (
              <Text style={[styles.noAppsText, { color: colors.outline }]}>No apps blocked</Text>
            ) : (
              blockedApps.map((app, i) => (
                <AppBlockRow
                  key={app.name}
                  app={app}
                  isLast={i === blockedApps.length - 1}
                  onRemove={() => removeApp(app.name)}
                />
              ))
            )}
          </View>
        </Animated.View>

        {/* Start Button */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(300).springify()}>
          <StartButton duration={duration} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function DurationPill({
  value,
  isActive,
  onPress,
}: {
  value: number;
  isActive: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={pressStyle}>
      <TouchableOpacity
        style={[
          styles.durationPill,
          { backgroundColor: isActive ? colors.primary : colors.card },
        ]}
        onPressIn={() => { scale.value = withSpring(0.92, { damping: 12 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
        onPress={onPress}
        activeOpacity={1}
      >
        <Text
          style={[
            styles.durationPillText,
            { color: isActive ? "#fff" : colors.onSurface },
          ]}
        >
          {value}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function AppBlockRow({
  app,
  isLast,
  onRemove,
}: {
  app: { name: string; icon: React.ComponentProps<typeof MaterialIcons>["name"] };
  isLast: boolean;
  onRemove: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.appRow, !isLast && { marginBottom: 16 }]}>
      <View style={styles.appIconWrap}>
        <MaterialIcons name={app.icon} size={20} color={colors.onSurface} />
      </View>
      <Text style={[styles.appName, { color: colors.onSurface }]}>{app.name}</Text>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={onRemove}
        activeOpacity={0.7}
      >
        <MaterialIcons name="remove-circle" size={26} color="#ef4444" />
      </TouchableOpacity>
    </View>
  );
}

function StartButton({ duration }: { duration: number }) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={pressStyle}>
      <TouchableOpacity
        style={[styles.startBtn, { backgroundColor: colors.primary }]}
        onPressIn={() => {
          scale.value = withSpring(0.96, { damping: 12 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
        activeOpacity={1}
      >
        <MaterialIcons name="play-arrow" size={24} color="#fff" />
        <Text style={styles.startBtnText}>Start {duration} Min Session</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 24 },

  headerTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
    paddingTop: 4,
  },

  ringWrapper: {
    alignItems: "center",
    marginVertical: 4,
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ringTime: {
    fontSize: 56,
    fontFamily: "Inter_700Bold",
    letterSpacing: -2,
  },
  ringSubLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
    marginTop: 2,
  },

  intentionCard: {
    borderRadius: 20,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  intentionAccent: {
    width: 4,
    borderRadius: 0,
  },
  intentionInner: {
    flex: 1,
    padding: 18,
    gap: 12,
  },
  intentionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  intentionLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  intentionInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },

  section: { gap: 12 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },

  durationPills: {
    flexDirection: "row",
    gap: 10,
  },
  durationPill: {
    width: (SCREEN_W - 40 - 30) / 4,
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  durationPillText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },

  customDurationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  customDurationText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },

  restrictedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  blockedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  blockedBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },

  appsCard: {
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  noAppsText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 8,
  },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  appIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  removeBtn: {
    padding: 2,
  },

  startBtn: {
    height: 60,
    borderRadius: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  startBtnText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
