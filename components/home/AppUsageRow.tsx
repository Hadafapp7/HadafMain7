import type { ComponentProps } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import type { MostUsedApp } from '@/types/home';

const SURFACE_CONTAINER = '#eeeeee';

interface AppUsageRowProps {
  app: MostUsedApp;
}

export function AppUsageRow({ app }: AppUsageRowProps) {
  // Convert 0–1 fraction to integer flex units (0–100).
  // Using flex instead of percentage strings avoids the Fabric
  // String → Boolean cast crash on Android.
  const fillFlex = Math.round(app.progressFraction * 100);
  const emptyFlex = 100 - fillFlex;

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

      {/* Right: time + progress bar */}
      <View style={styles.rightSection}>
        <Text style={styles.timeText}>{app.timeDisplay}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { flex: fillFlex }]} />
          <View style={{ flex: emptyFlex }} />
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
    flexDirection: 'row', // children fill horizontally via flex
    marginTop: 4,
  },
  progressFill: {
    height: 4,               // explicit number — never '100%' string on Fabric
    backgroundColor: Colors.onSurface,
    borderRadius: 2,
  },
});
