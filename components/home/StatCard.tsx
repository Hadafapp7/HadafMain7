import { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  useReducedMotion,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { Colors } from '@/constants/theme';
import { useCountUp } from '@/hooks/useCountUp';

const SURFACE_CONTAINER = '#eeeeee';

const CARD_SHADOW = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.04,
  shadowRadius: 24,
  elevation: 2,
} as const;

const LIFT_SPRING = { stiffness: 300, damping: 25 } as const;

interface ScreenTimeProps {
  variant: 'screenTime';
  hours: number;
  minutes: number;
  trendDirection: 'up' | 'down';
  trendPercent: number;
}

interface DoomscoreProps {
  variant: 'doomscore';
  score: number;
  change: number;
}

type StatCardProps = ScreenTimeProps | DoomscoreProps;

export function StatCard(props: StatCardProps) {
  const reduced = useReducedMotion() ?? false;

  // Press-lift animation
  const lift = useSharedValue(0);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(lift.value, [0, 1], [0, -4]) },
      { scale: interpolate(lift.value, [0, 1], [1, 1.015]) },
    ],
    shadowOpacity: interpolate(lift.value, [0, 1], [0.04, 0.12]),
    elevation: interpolate(lift.value, [0, 1], [2, 8]),
  }));

  // Count-up — always call hooks unconditionally
  const targetHours   = props.variant === 'screenTime' ? props.hours   : 0;
  const targetMinutes = props.variant === 'screenTime' ? props.minutes : 0;
  const targetScore   = props.variant === 'doomscore'  ? props.score   : 0;

  const animHours   = useCountUp(targetHours,   900, 120);
  const animMinutes = useCountUp(targetMinutes, 900, 220);
  const animScore   = useCountUp(targetScore,   1000, 150);

  // Animated doomscore progress bar (flex units 0 → score)
  const progressFlex = useSharedValue(0);

  useEffect(() => {
    if (props.variant !== 'doomscore') return;
    const target = props.score;
    if (reduced) {
      progressFlex.value = target;
    } else {
      progressFlex.value = withDelay(
        500,
        withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) }),
      );
    }
  }, [props.variant === 'doomscore' ? props.score : 0, reduced]);

  const progressFillStyle  = useAnimatedStyle(() => ({ flex: progressFlex.value }));
  const progressEmptyStyle = useAnimatedStyle(() => ({
    flex: Math.max(100 - progressFlex.value, 0),
  }));

  const displayHours   = reduced ? targetHours   : animHours;
  const displayMinutes = reduced ? targetMinutes : animMinutes;
  const displayScore   = reduced ? targetScore   : animScore;

  return (
    <Pressable
      style={styles.wrapper}
      onPressIn={reduced ? undefined : () => { lift.value = withSpring(1, LIFT_SPRING); }}
      onPressOut={reduced ? undefined : () => { lift.value = withSpring(0, LIFT_SPRING); }}
    >
      <Animated.View style={[styles.card, cardStyle]}>
        {/* Label + Primary Value */}
        <View>
          <Text style={styles.label}>
            {props.variant === 'screenTime' ? 'Screen Time' : 'Doomscore'}
          </Text>

          {props.variant === 'screenTime' ? (
            <View style={styles.timeRow}>
              <Text style={styles.timeValue}>{displayHours}h</Text>
              <Text style={styles.timeValue}>{displayMinutes}m</Text>
            </View>
          ) : (
            <Text style={styles.scoreValue}>{displayScore}</Text>
          )}
        </View>

        {/* Bottom section */}
        {props.variant === 'screenTime' ? (
          <View style={styles.screenTimeBottom}>
            <View style={styles.trendBadge}>
              <Text style={styles.trendArrow}>
                {props.trendDirection === 'down' ? '↘' : '↗'}
              </Text>
              <Text style={styles.trendText}>{props.trendPercent}%</Text>
            </View>
            <View style={styles.miniBarChart}>
              <View style={[styles.miniBar, { height: 24 }]} />
              <View style={[styles.miniBar, styles.miniBarDim, { height: 12 }]} />
            </View>
          </View>
        ) : (
          <View style={styles.doomBottom}>
            <View style={styles.doomLabels}>
              <Text style={[styles.label, { opacity: 0.5 }]}>Better</Text>
              <Text style={styles.doomChange}>+{props.change} pts</Text>
            </View>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, progressFillStyle]} />
              <Animated.View style={progressEmptyStyle} />
            </View>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 40,
    padding: 24,
    justifyContent: 'space-between',
    minHeight: 160,
    borderWidth: 1,
    borderColor: 'rgba(212, 212, 212, 0.3)',
    ...CARD_SHADOW,
  },
  label: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: Colors.onSurfaceVariant,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 4,
  },
  timeValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 30,
    letterSpacing: -1,
    color: Colors.onSurface,
  },
  scoreValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 40,
    letterSpacing: -1.5,
    color: Colors.onSurface,
    marginTop: 4,
  },
  screenTimeBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SURFACE_CONTAINER,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(212, 212, 212, 0.2)',
  },
  trendArrow: {
    fontSize: 10,
    color: Colors.onSurface,
  },
  trendText: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.onSurface,
  },
  miniBarChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingBottom: 4,
  },
  miniBar: {
    width: 4,
    backgroundColor: Colors.onSurface,
    borderRadius: 2,
  },
  miniBarDim: {
    backgroundColor: SURFACE_CONTAINER,
    opacity: 0.3,
  },
  doomBottom: {
    marginTop: 16,
    gap: 8,
  },
  doomLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  doomChange: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.onSurface,
  },
  progressTrack: {
    height: 6,
    backgroundColor: SURFACE_CONTAINER,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressFill: {
    height: 6,
    backgroundColor: Colors.onSurface,
    borderRadius: 3,
  },
});
