import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  withSequence,
  withRepeat,
  useReducedMotion,
  interpolate,
} from 'react-native-reanimated';
import { StatCard } from '@/components/home/StatCard';
import { AppUsageRow } from '@/components/home/AppUsageRow';
import { QuickActionTile } from '@/components/home/QuickActionTile';
import { useHomeStats, useMostUsedApps, useQuickActions } from '@/hooks/useHomeStats';
import { getGreeting } from '@/utils/formatters';
import { Colors } from '@/constants/theme';

const SURFACE_CONTAINER = '#eeeeee';

const SECTION_SHADOW = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.04,
  shadowRadius: 24,
  elevation: 2,
} as const;

const ENTRANCE_SPRING = { stiffness: 80, damping: 20 } as const;

// ─── AnimatedSection ──────────────────────────────────────────────────────────
// Wraps a section so it can replay its entrance animation when `triggerKey` changes.

interface AnimatedSectionProps {
  delay: number;
  triggerKey: number;
  reduced: boolean;
  children: React.ReactNode;
  style?: object;
}

function AnimatedSection({ delay, triggerKey, reduced, children, style }: AnimatedSectionProps) {
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(delay, withSpring(1, ENTRANCE_SPRING));
  }, [triggerKey, delay, reduced]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [30, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.97, 1]) },
    ],
  }));

  return <Animated.View style={[animStyle, style]}>{children}</Animated.View>;
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { data: stats, isLoading: statsLoading } = useHomeStats();
  const { data: apps } = useMostUsedApps();
  const { data: quickActions } = useQuickActions();
  const greeting = getGreeting();
  const reduced = useReducedMotion() ?? false;

  // animKey increments each time the tab is re-focused → all sections re-animate
  const [animKey, setAnimKey] = useState(0);
  const isFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      setAnimKey((k) => k + 1);
    }, []),
  );

  // Header slides in from the top
  const headerProgress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      headerProgress.value = 1;
      return;
    }
    headerProgress.value = 0;
    headerProgress.value = withSpring(1, ENTRANCE_SPRING);
  }, [animKey, reduced]);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerProgress.value,
    transform: [{ translateY: interpolate(headerProgress.value, [0, 1], [-20, 0]) }],
  }));

  // Skeleton shimmer: pulse opacity
  const shimmer = useSharedValue(1);

  useEffect(() => {
    if (statsLoading && !reduced) {
      shimmer.value = withRepeat(
        withSequence(
          withTiming(0.35, { duration: 750 }),
          withTiming(1, { duration: 750 }),
        ),
        -1,
        false,
      );
    } else {
      shimmer.value = 1;
    }
  }, [statsLoading, reduced]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  // Focus button spring press
  const focusPress = useSharedValue(0);
  const focusButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(focusPress.value, [0, 1], [1, 0.97]) }],
  }));

  return (
    <View style={styles.root}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Animated.View style={headerStyle}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <View>
              <View style={styles.greetingRow}>
                <Text style={styles.greetingText}>{greeting}, Alex</Text>
                <Text style={styles.wave}>👋</Text>
              </View>
              <Text style={styles.focusMode}>Focus Mode: Off</Text>
            </View>
            <View style={styles.avatarWrapper}>
              <Image
                source={{ uri: 'https://i.pravatar.cc/96?img=11' }}
                style={styles.avatar}
                resizeMode="cover"
              />
            </View>
          </View>
        </View>
      </Animated.View>

      {/* ── Scrollable Content ───────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Grid */}
        <AnimatedSection delay={80} triggerKey={animKey} reduced={reduced}>
          <View style={styles.statsGrid}>
            {statsLoading ? (
              <>
                <Animated.View style={[styles.skeletonCard, shimmerStyle]} />
                <Animated.View style={[styles.skeletonCard, shimmerStyle]} />
              </>
            ) : (
              <>
                <StatCard
                  variant="screenTime"
                  hours={stats.screenTimeHours}
                  minutes={stats.screenTimeMinutes}
                  trendDirection={stats.screenTimeChangeDirection}
                  trendPercent={stats.screenTimeChangePercent}
                />
                <StatCard
                  variant="doomscore"
                  score={stats.doomScore}
                  change={stats.doomScoreChange}
                />
              </>
            )}
          </View>
        </AnimatedSection>

        {/* Start Focus Session Button */}
        <AnimatedSection delay={160} triggerKey={animKey} reduced={reduced}>
          <Animated.View style={focusButtonStyle}>
            <Pressable
              onPressIn={() => {
                focusPress.value = withSpring(1, { stiffness: 400, damping: 15 });
              }}
              onPressOut={() => {
                focusPress.value = withSpring(0, { stiffness: 400, damping: 15 });
              }}
              style={({ pressed }) => [
                styles.focusButton,
                pressed && styles.focusButtonPressed,
              ]}
              android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: false }}
            >
              <View style={styles.focusIconCircle}>
                <MaterialIcons name="play-arrow" size={32} color="#ffffff" />
              </View>
              <Text style={styles.focusButtonText}>Start Focus Session</Text>
            </Pressable>
          </Animated.View>
        </AnimatedSection>

        {/* Most Used Apps */}
        <AnimatedSection delay={240} triggerKey={animKey} reduced={reduced}>
          <View style={[styles.appsCard, SECTION_SHADOW]}>
            <View style={styles.appsHeader}>
              <Text style={styles.appsTitle}>Most Used Apps</Text>
              <MaterialIcons name="more-horiz" size={20} color="rgba(71,71,71,0.4)" />
            </View>
            <View style={styles.appsList}>
              {apps.map((app, i) => (
                <AppUsageRow key={app.id} app={app} index={i} animKey={animKey} />
              ))}
            </View>
          </View>
        </AnimatedSection>

        {/* Quick Action Tiles */}
        <AnimatedSection delay={320} triggerKey={animKey} reduced={reduced}>
          <View style={styles.quickActions}>
            {quickActions.map((action, i) => (
              <QuickActionTile key={action.id} action={action} index={i} />
            ))}
          </View>
        </AnimatedSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  greetingText: {
    fontFamily: 'Inter-Bold',
    fontSize: 24,
    letterSpacing: -0.5,
    color: Colors.onSurface,
  },
  wave: {
    fontSize: 20,
  },
  focusMode: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: Colors.onSurfaceVariant,
    marginTop: 4,
  },
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(212,212,212,0.5)',
    overflow: 'hidden',
  },
  avatar: {
    width: 46,
    height: 46,
  },

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 160,
    rowGap: 16,
  },

  // ── Stats grid ──────────────────────────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  skeletonCard: {
    flex: 1,
    height: 160,
    backgroundColor: SURFACE_CONTAINER,
    borderRadius: 40,
  },

  // ── Focus button ────────────────────────────────────────────────────────────
  focusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    borderRadius: 9999,
    backgroundColor: Colors.primary,
    gap: 20,
  },
  focusButtonPressed: {
    backgroundColor: '#2a2a2a',
  },
  focusIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusButtonText: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
    letterSpacing: -0.5,
    color: '#ffffff',
  },

  // ── Most used apps ──────────────────────────────────────────────────────────
  appsCard: {
    backgroundColor: Colors.background,
    borderRadius: 48,
    padding: 32,
    borderWidth: 1,
    borderColor: 'rgba(212,212,212,0.3)',
  },
  appsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  appsTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: Colors.onSurfaceVariant,
    opacity: 0.6,
  },
  appsList: {
    gap: 20,
  },

  // ── Quick actions ───────────────────────────────────────────────────────────
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
});
