import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  SharedValue,
  interpolate,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import BrandLogo from "@/components/BrandLogo";
import ServerConfigModal from "@/components/ServerConfigModal";
import { useOnboarding } from "@/lib/onboarding";

const INK = "#0a0a0a";
const BG = "#f9f9f9";
const MUTED = "#6b6b70";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// ───────────────────────────── Illustrations ─────────────────────────────

/** 1 · Welcome: logo with ripples. */
function WelcomeArt({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {[0, 1, 2].map((i) => (
        <Ripple key={i} index={i} size={size} />
      ))}
      <BrandLogo size={size * 0.42} />
    </View>
  );
}

function Ripple({ index, size }: { index: number; size: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      index * 750,
      withRepeat(withTiming(1, { duration: 2250, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: (1 - t.value) * 0.35,
    transform: [{ scale: 0.5 + t.value * 0.5 }],
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: INK,
        },
        style,
      ]}
    />
  );
}

/** 2 · Focus: progress ring + blocked app chips. */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function FocusArt({ size, active }: { size: number; active: boolean }) {
  const R = size * 0.34;
  const C = 2 * Math.PI * R;
  const p = useSharedValue(0);
  const lock = useSharedValue(0);

  useEffect(() => {
    if (active) {
      p.value = 0;
      lock.value = 0;
      p.value = withDelay(250, withTiming(0.72, { duration: 1700, easing: Easing.out(Easing.cubic) }));
      lock.value = withDelay(900, withSpring(1, { damping: 9, stiffness: 160 }));
    }
  }, [active]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - p.value) }));
  const lockStyle = useAnimatedStyle(() => ({ transform: [{ scale: lock.value }], opacity: lock.value }));

  const chips: { icon: IconName; x: number; y: number; delay: number }[] = [
    { icon: "group", x: 0.02, y: 0.18, delay: 0 },
    { icon: "movie", x: 0.78, y: 0.1, delay: 400 },
    { icon: "sports-esports", x: 0.8, y: 0.72, delay: 800 },
  ];

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={R} stroke="#e4e4e7" strokeWidth={14} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke={INK}
          strokeWidth={14}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={C}
          animatedProps={ringProps}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={styles.artTimer}>25:00</Text>
        <Text style={styles.artTimerLabel}>FOCUS SESSION</Text>
      </View>
      {chips.map((c) => (
        <FloatingChip key={c.icon} {...c} size={size} lock={lockStyle} />
      ))}
    </View>
  );
}

function FloatingChip({ icon, x, y, delay, size, lock }: {
  icon: IconName; x: number; y: number; delay: number; size: number; lock: any;
}) {
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(-7, { duration: 1100 }), withTiming(7, { duration: 1100 })), -1, true),
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  return (
    <Animated.View style={[styles.chip, { left: size * x, top: size * y }, style]}>
      <MaterialIcons name={icon} size={24} color={INK} />
      <Animated.View style={[styles.chipLock, lock]}>
        <MaterialIcons name="lock" size={11} color="#fff" />
      </Animated.View>
    </Animated.View>
  );
}

/** 3 · Insights: bars rising against a target line. */
const BAR_VALUES = [0.5, 0.74, 0.42, 0.95, 0.6, 0.36, 0.52];
const BAR_DAYS = ["M", "T", "W", "T", "F", "S", "S"];

function InsightsArt({ size, active }: { size: number; active: boolean }) {
  const chartH = size * 0.5;
  const badge = useSharedValue(0);
  useEffect(() => {
    if (active) {
      badge.value = 0;
      badge.value = withDelay(1100, withSpring(1, { damping: 9, stiffness: 150 }));
    }
  }, [active]);
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ scale: 0.6 + badge.value * 0.4 }, { translateY: (1 - badge.value) * 10 }],
  }));

  return (
    <View style={[styles.insightCard, { width: size, height: size * 0.82 }]}>
      <View style={styles.insightHead}>
        <Text style={styles.insightTitle}>THIS WEEK</Text>
        <Animated.View style={[styles.insightBadge, badgeStyle]}>
          <MaterialIcons name="trending-down" size={14} color="#15803d" />
          <Text style={styles.insightBadgeText}>32% less</Text>
        </Animated.View>
      </View>
      <View style={{ height: chartH, justifyContent: "flex-end" }}>
        <View style={[styles.targetLine, { bottom: chartH * 0.62 }]} />
        <View style={styles.barRow}>
          {BAR_VALUES.map((v, i) => (
            <ArtBar key={i} value={v} index={i} maxH={chartH} active={active} over={v > 0.8} />
          ))}
        </View>
      </View>
      <View style={styles.barRow}>
        {BAR_DAYS.map((d, i) => (
          <Text key={i} style={styles.barDay}>{d}</Text>
        ))}
      </View>
    </View>
  );
}

function ArtBar({ value, index, maxH, active, over }: {
  value: number; index: number; maxH: number; active: boolean; over: boolean;
}) {
  const h = useSharedValue(0);
  useEffect(() => {
    if (active) {
      h.value = 0;
      h.value = withDelay(250 + index * 90, withTiming(value, { duration: 650, easing: Easing.out(Easing.cubic) }));
    }
  }, [active]);
  const style = useAnimatedStyle(() => ({ height: h.value * maxH }));
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
      <Animated.View style={[styles.bar, { backgroundColor: over ? "#ba1a1a" : INK }, style]} />
    </View>
  );
}

/** 4 · Habits: flame, XP bar and a streak row. */
function HabitsArt({ size, active }: { size: number; active: boolean }) {
  const glow = useSharedValue(0);
  const xp = useSharedValue(0);
  const flame = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1, false);
  }, []);
  useEffect(() => {
    if (active) {
      xp.value = 0;
      flame.value = 0;
      flame.value = withSpring(1, { damping: 7, stiffness: 140 });
      xp.value = withDelay(500, withTiming(0.68, { duration: 1300, easing: Easing.out(Easing.cubic) }));
    }
  }, [active]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + glow.value * 0.25,
    transform: [{ scale: 1 + glow.value * 0.18 }],
  }));
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flame.value }] }));
  const xpStyle = useAnimatedStyle(() => ({ width: `${xp.value * 100}%` }));

  const flameSize = size * 0.4;
  return (
    <View style={{ width: size, alignItems: "center" }}>
      <View style={{ width: flameSize * 1.5, height: flameSize * 1.5, alignItems: "center", justifyContent: "center" }}>
        <Animated.View
          style={[
            { position: "absolute", width: flameSize * 1.5, height: flameSize * 1.5, borderRadius: flameSize, backgroundColor: "#f97316" },
            glowStyle,
          ]}
        />
        <Animated.View style={[styles.flameCircle, { width: flameSize, height: flameSize, borderRadius: flameSize / 2 }, flameStyle]}>
          <MaterialIcons name="local-fire-department" size={flameSize * 0.62} color="#f97316" />
        </Animated.View>
      </View>

      <View style={styles.xpCard}>
        <View style={styles.xpHead}>
          <Text style={styles.xpLevel}>LEVEL 4</Text>
          <Text style={styles.xpValue}>340 / 500 XP</Text>
        </View>
        <View style={styles.xpTrack}>
          <Animated.View style={[styles.xpFill, xpStyle]} />
        </View>
        <View style={styles.streakRow}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <StreakDot key={i} index={i} active={active} />
          ))}
        </View>
      </View>
    </View>
  );
}

function StreakDot({ index, active }: { index: number; active: boolean }) {
  const s = useSharedValue(0);
  const filled = index < 5;
  useEffect(() => {
    if (active) {
      s.value = 0;
      s.value = withDelay(700 + index * 110, withSpring(1, { damping: 8, stiffness: 180 }));
    }
  }, [active]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.streakDot, filled ? { backgroundColor: INK } : { backgroundColor: "#e4e4e7" }, style]}>
      {filled ? <MaterialIcons name="check" size={13} color="#fff" /> : null}
    </Animated.View>
  );
}

// ───────────────────────────── Slides ─────────────────────────────

interface Slide {
  key: string;
  title: string;
  body: string;
  render: (size: number, active: boolean) => React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    key: "welcome",
    title: "Reclaim your\nattention",
    body: "Hadaf helps you spend less time scrolling and more time on the things that actually matter.",
    render: (size) => <WelcomeArt size={size} />,
  },
  {
    key: "focus",
    title: "Deep focus,\nprotected",
    body: "Start a focus session and we block the apps that pull you away, right until your timer ends.",
    render: (size, active) => <FocusArt size={size} active={active} />,
  },
  {
    key: "insights",
    title: "See where your\ntime really goes",
    body: "Clear charts reveal your screen time, your biggest time sinks and exactly where you are slipping.",
    render: (size, active) => <InsightsArt size={size} active={active} />,
  },
  {
    key: "habits",
    title: "Build streaks.\nLevel up.",
    body: "Set goals, keep your streak alive and earn XP for every focused minute. Small wins add up fast.",
    render: (size, active) => <HabitsArt size={size} active={active} />,
  },
];

function Page({ slide, index, scrollX, width, active }: {
  slide: Slide; index: number; scrollX: SharedValue<number>; width: number; active: boolean;
}) {
  const input = [(index - 1) * width, index * width, (index + 1) * width];
  const artSize = Math.min(width * 0.78, 320);

  const artStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, input, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(scrollX.value, input, [width * 0.35, 0, -width * 0.35], Extrapolation.CLAMP) },
      { scale: interpolate(scrollX.value, input, [0.78, 1, 0.78], Extrapolation.CLAMP) },
    ],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, input, [0, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(scrollX.value, input, [width * 0.55, 0, -width * 0.55], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={{ width, flex: 1, paddingHorizontal: 28 }}>
      <Animated.View style={[styles.artWrap, artStyle]}>{slide.render(artSize, active)}</Animated.View>
      <Animated.View style={[styles.textWrap, textStyle]}>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </Animated.View>
    </View>
  );
}

function Dot({ index, scrollX, width }: { index: number; scrollX: SharedValue<number>; width: number }) {
  const input = [(index - 1) * width, index * width, (index + 1) * width];
  const style = useAnimatedStyle(() => ({
    width: interpolate(scrollX.value, input, [8, 28, 8], Extrapolation.CLAMP),
    opacity: interpolate(scrollX.value, input, [0.28, 1, 0.28], Extrapolation.CLAMP),
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { complete } = useOnboarding();

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const [showServerModal, setShowServerModal] = useState(false);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      if (i !== index) {
        setIndex(i);
        if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
      }
    },
    [index, width],
  );

  const next = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (last) {
      complete();
      return;
    }
    const target = index + 1;
    setIndex(target);
    scrollRef.current?.scrollTo({ x: target * width, animated: true });
  }, [index, last, width, complete, scrollRef]);

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.decoTop} />
      <View style={styles.decoBottom} />

      <View style={styles.header}>
        <View style={styles.brandRow}>
          <BrandLogo size={34} />
          <Text style={styles.brandText}>Hadaf</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity
            onPress={() => setShowServerModal(true)}
            hitSlop={8}
            activeOpacity={0.7}
            style={styles.serverPill}
          >
            <MaterialIcons name="dns" size={13} color={MUTED} />
            <Text style={styles.serverPillText}>Server</Text>
          </TouchableOpacity>
          {!last ? (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)}>
              <TouchableOpacity onPress={() => complete()} hitSlop={12} activeOpacity={0.7}>
                <Text style={styles.skip}>Skip</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <View style={{ height: 20 }} />
          )}
        </View>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <Page key={s.key} slide={s} index={i} scrollX={scrollX} width={width} active={i === index} />
        ))}
      </Animated.ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <Dot key={s.key} index={i} scrollX={scrollX} width={width} />
          ))}
        </View>

        <Animated.View style={btnStyle}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.cta}
            onPress={next}
            onPressIn={() => (btnScale.value = withSpring(0.96, { damping: 14 }))}
            onPressOut={() => (btnScale.value = withSpring(1, { damping: 14 }))}
          >
            <Text style={styles.ctaText}>{last ? "GET STARTED" : "NEXT"}</Text>
            <MaterialIcons name={last ? "rocket-launch" : "arrow-forward"} size={20} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      </View>
      <ServerConfigModal visible={showServerModal} onClose={() => setShowServerModal(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, overflow: "hidden" },
  decoTop: {
    position: "absolute", top: -120, right: -100, width: 320, height: 320, borderRadius: 160,
    backgroundColor: "#ececec",
  },
  decoBottom: {
    position: "absolute", bottom: -140, left: -120, width: 320, height: 320, borderRadius: 160,
    backgroundColor: "#f0f0f0",
  },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 24, paddingTop: 4, paddingBottom: 8,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandText: { fontSize: 19, fontFamily: "Inter_700Bold", color: INK, letterSpacing: -0.4 },
  skip: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: MUTED },
  serverPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#ececec",
  },
  serverPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: MUTED,
  },

  artWrap: { flex: 1.15, alignItems: "center", justifyContent: "center" },
  textWrap: { flex: 0.85, alignItems: "center", paddingTop: 8 },
  title: {
    fontSize: 32, lineHeight: 38, fontFamily: "Inter_700Bold", color: INK,
    textAlign: "center", letterSpacing: -1,
  },
  body: {
    marginTop: 14, fontSize: 15, lineHeight: 23, fontFamily: "Inter_400Regular",
    color: MUTED, textAlign: "center", maxWidth: 330,
  },

  footer: { paddingHorizontal: 24, gap: 22 },
  dots: { flexDirection: "row", alignSelf: "center", alignItems: "center", gap: 6 },
  dot: { height: 8, borderRadius: 4, backgroundColor: INK },
  cta: {
    height: 58, borderRadius: 29, backgroundColor: INK,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 6,
  },
  ctaText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 1.6 },

  // Focus art
  artTimer: { fontSize: 40, fontFamily: "Inter_700Bold", color: INK, letterSpacing: -1 },
  artTimerLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: MUTED, letterSpacing: 2, marginTop: 2 },
  chip: {
    position: "absolute", width: 52, height: 52, borderRadius: 16, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 5,
  },
  chipLock: {
    position: "absolute", right: -5, bottom: -5, width: 20, height: 20, borderRadius: 10,
    backgroundColor: INK, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: BG,
  },

  // Insights art
  insightCard: {
    backgroundColor: "#fff", borderRadius: 28, padding: 20, justifyContent: "space-between",
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 5,
  },
  insightHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  insightTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: MUTED, letterSpacing: 1.6 },
  insightBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#e8f7ee",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  insightBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#15803d" },
  targetLine: {
    position: "absolute", left: 0, right: 0, height: 0, borderTopWidth: 1.5, borderStyle: "dashed",
    borderColor: "#a1a1aa",
  },
  barRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, flex: undefined },
  bar: { width: "100%", borderRadius: 8, minHeight: 4 },
  barDay: { flex: 1, textAlign: "center", fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#a1a1aa" },

  // Habits art
  flameCircle: {
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    shadowColor: "#f97316", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  xpCard: {
    alignSelf: "stretch", marginTop: 22, backgroundColor: "#fff", borderRadius: 24, padding: 18, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 20, elevation: 4,
  },
  xpHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  xpLevel: { fontSize: 12, fontFamily: "Inter_700Bold", color: INK, letterSpacing: 1.4 },
  xpValue: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: MUTED },
  xpTrack: { height: 10, borderRadius: 5, backgroundColor: "#ececec", overflow: "hidden" },
  xpFill: { height: 10, borderRadius: 5, backgroundColor: INK },
  streakRow: { flexDirection: "row", justifyContent: "space-between" },
  streakDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});

