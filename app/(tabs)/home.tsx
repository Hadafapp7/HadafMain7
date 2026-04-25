import { StyleSheet, View, Text, ScrollView, Pressable, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { data: stats, isLoading: statsLoading } = useHomeStats();
  const { data: apps } = useMostUsedApps();
  const { data: quickActions } = useQuickActions();

  const greeting = getGreeting();

  return (
    <View style={styles.root}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          {/* Greeting */}
          <View>
            <View style={styles.greetingRow}>
              <Text style={styles.greetingText}>{greeting}, Alex</Text>
              <Text style={styles.wave}>👋</Text>
            </View>
            <Text style={styles.focusMode}>Focus Mode: Off</Text>
          </View>

          {/* Avatar */}
          <View style={styles.avatarWrapper}>
            <Image
              source={{ uri: 'https://i.pravatar.cc/96?img=11' }}
              style={styles.avatar}
              resizeMode="cover"
            />
          </View>
        </View>
      </View>

      {/* ── Scrollable Content ─────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {statsLoading ? (
            <>
              <View style={styles.skeletonCard} />
              <View style={styles.skeletonCard} />
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

        {/* Start Focus Session Button */}
        <Pressable
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

        {/* Most Used Apps */}
        <View style={[styles.appsCard, SECTION_SHADOW]}>
          <View style={styles.appsHeader}>
            <Text style={styles.appsTitle}>Most Used Apps</Text>
            <MaterialIcons
              name="more-horiz"
              size={20}
              color="rgba(71,71,71,0.4)"
            />
          </View>
          <View style={styles.appsList}>
            {apps.map((app) => (
              <AppUsageRow key={app.id} app={app} />
            ))}
          </View>
        </View>

        {/* Quick Action Tiles */}
        <View style={styles.quickActions}>
          {quickActions.map((action) => (
            <QuickActionTile key={action.id} action={action} />
          ))}
        </View>
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
  // Border lives on the wrapper View — never on the expo-image style
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
