import { StyleSheet, View, Text } from 'react-native';
import { Colors } from '@/constants/theme';

const SURFACE_CONTAINER = '#eeeeee';

const CARD_SHADOW = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.04,
  shadowRadius: 24,
  elevation: 2,
} as const;

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
  return (
    <View style={styles.card}>
      {/* Label + Primary Value */}
      <View>
        <Text style={styles.label}>
          {props.variant === 'screenTime' ? 'Screen Time' : 'Doomscore'}
        </Text>

        {props.variant === 'screenTime' ? (
          <View style={styles.timeRow}>
            <Text style={styles.timeValue}>{props.hours}h</Text>
            <Text style={styles.timeValue}>{props.minutes}m</Text>
          </View>
        ) : (
          <Text style={styles.scoreValue}>{props.score}</Text>
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
          {/*
           * Progress bar uses flex children instead of percentage-string width.
           * "width: '68%'" is a string dimension that Fabric's Android ViewManager
           * can fail to cast on some devices (String → Boolean exception).
           * Using flex avoids any string-based dimension on Fabric.
           */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { flex: props.score }]} />
            <View style={{ flex: 100 - props.score }} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    flexDirection: 'row', // children fill proportionally via flex
  },
  progressFill: {
    height: 6,               // explicit number — never '100%' string on Fabric
    backgroundColor: Colors.onSurface,
    borderRadius: 3,
  },
});
