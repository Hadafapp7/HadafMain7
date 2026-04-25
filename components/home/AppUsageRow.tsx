import { useEffect } from 'react';
import type { ComponentProps } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  useReducedMotion,
  Easing,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import type { MostUsedApp } from '@/types/home';

const SURFACE_CONTAINER = '#eeeeee';

export interface AppUsageRowProps {
  app: MostUsedApp;
  /** Row index used to stagger the progress bar fill animation */
  index?: number;
  /** Increments when the parent screen re-focuses, re-triggering animations */
  animKey?: number;
}

export function AppUsageRow({ app, index = 0, animKey = 0 }: AppUsageRowProps) {
  const reduced = useReducedMotion() ?? false;
  const targetFill = Math.round(app.progressFraction * 100);

  // Animate fill flex from 0 → target, staggered by row index
  const fillFlex = useSharedValue(reduced ? targetFill : 0);

  useEffect(() => {
    if (reduced) {
      fillFlex.value = targetFill;
      return;
    }
    fillFlex.value = 0;
    fillFlex.value = withDelay(
      index * 80,
      withTiming(targetFill, { duration: 900, easing: Easing.out(Easing.cubic) }),
    );
  }, [animKey, targetFill, index, reduced]);

  const fillStyle  = useAnimatedStyle(() => ({ flex: fillFlex.value }));
  const emptyStyle = useAnimatedStyle(() => ({ flex: Math.max(100 - fillFlex.value, 0) }));

  return (
    <View style={styles.row}>
      {/* Left: icon + name */}
      <View style={styles.leftSection}>
        <View style={styles.iconFrame}>
          <MaterialIcons
            name={app.iconName as ComponentProps<typeof MaterialIcons>['name']}
            size={22}
            color={Colors.onSurface}
          />
        </View>
        <View>
          <Text style={styles.appName}>{app.name}</Text>
          <Text style={styles.appCategory}>{app.category}</Text>
        </View>
      </View>

      {/* Right: time + animated progress bar */}
      <View style={styles.rightSection}>
        <Text style={styles.timeText}>{app.timeDisplay}</Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, fillStyle]} />
          <Animated.View style={emptyStyle} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconFrame: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: SURFACE_CONTAINER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    letterSpacing: -0.3,
    color: Colors.onSurface,
  },
  appCategory: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.onSurfaceVariant,
    opacity: 0.6,
    marginTop: 2,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  timeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: Colors.onSurface,
  },
  progressTrack: {
    width: 64,
    height: 4,
    backgroundColor: SURFACE_CONTAINER,
    borderRadius: 2,
    overflow: 'hidden',
    flexDirection: 'row',
    marginTop: 4,
  },
  progressFill: {
    height: 4,
    backgroundColor: Colors.onSurface,
    borderRadius: 2,
  },
});
