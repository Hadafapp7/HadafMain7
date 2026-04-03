import { ScrollView, View, Text, TouchableOpacity, Dimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PADDING = 24;
const CARD_GAP = 16;
const CARD_SIZE = (SCREEN_WIDTH - H_PADDING * 2 - CARD_GAP) / 2;

// ─── Editorial label style ────────────────────────────────────────────────────
const editorialLabel: object = {
  fontFamily: 'WorkSans-Bold',
  fontSize: 10,
  letterSpacing: 2,
  textTransform: 'uppercase' as const,
};

// ─── Quick action cards data ──────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: 'Focus', icon: 'filter-center-focus', lib: 'material' },
  { label: 'Mood', icon: 'mood', lib: 'material' },
  { label: 'Goals', icon: 'flag', lib: 'material' },
  { label: 'Stats', icon: 'insights', lib: 'material' },
] as const;

// ─── Top apps data ────────────────────────────────────────────────────────────
const TOP_APPS = [
  {
    name: 'Outlook',
    category: 'Productivity',
    time: '45m',
    progress: 0.75,
    icon: 'mail',
    iconLib: 'material',
  },
  {
    name: 'CodeEdit',
    category: 'Development',
    time: '38m',
    progress: 0.55,
    icon: 'code',
    iconLib: 'material',
  },
] as const;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#ffffff' }}
      contentContainerStyle={{
        paddingHorizontal: H_PADDING,
        paddingTop: insets.top + 32,
        paddingBottom: 140, // space for floating tab bar
        gap: 32,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={{ gap: 4 }}>
          <Text style={[editorialLabel, { color: '#a8a29e' }]}>THURSDAY, OCT 24</Text>
          <Text style={styles.greeting}>Good morning,{'\n'}Ahmad.</Text>
        </View>

        <View style={styles.avatarFrame}>
          <Image
            source="https://randomuser.me/api/portraits/men/32.jpg"
            style={styles.avatarImage}
            contentFit="cover"
          />
        </View>
      </View>

      {/* ── Hero Dark Card ─────────────────────────────────────────────────── */}
      <View style={styles.heroCard}>
        {/* Subtle radial shine overlay */}
        <View style={styles.heroShine} />

        <View style={{ gap: 6 }}>
          <Text style={[editorialLabel, { color: 'rgba(255,255,255,0.6)' }]}>
            TODAY'S SCREEN TIME
          </Text>
          <Text style={styles.heroMetric}>2h 14m</Text>
          <View style={styles.heroStatRow}>
            <MaterialIcons name="south-east" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.heroStatText}>↓ 8% VS LAST WEEK</Text>
          </View>
        </View>

        <View style={{ gap: 20 }}>
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '50%' }]} />
          </View>

          {/* Pill buttons */}
          <View style={styles.heroBtnRow}>
            <TouchableOpacity style={styles.heroBtn} activeOpacity={0.7}>
              <MaterialIcons name="settings" size={13} color="#ffffff" />
              <Text style={[editorialLabel, { color: '#ffffff', letterSpacing: 1.5 }]}>
                SETTINGS
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroBtn} activeOpacity={0.7}>
              <MaterialIcons name="analytics" size={13} color="#ffffff" />
              <Text style={[editorialLabel, { color: '#ffffff', letterSpacing: 1.5 }]}>
                ANALYTICS
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Quick Actions 2×2 Grid ──────────────────────────────────────────── */}
      <View style={styles.grid}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={[styles.actionCard, { width: CARD_SIZE, height: CARD_SIZE }]}
            activeOpacity={0.7}
          >
            <View style={styles.actionCardTop}>
              <MaterialIcons name={action.icon} size={28} color="#111111" />
              <MaterialIcons name="arrow-forward" size={20} color="#111111" />
            </View>
            <Text style={[editorialLabel, { color: '#111111' }]}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Top Apps Today ──────────────────────────────────────────────────── */}
      <View>
        <View style={styles.appsSection}>
          {/* Section header */}
          <View style={styles.appsSectionHeader}>
            <Text style={[editorialLabel, { color: '#111111' }]}>TOP APPS TODAY</Text>
          </View>

          {/* App rows */}
          {TOP_APPS.map((app, index) => (
            <View
              key={app.name}
              style={[
                styles.appRow,
                index > 0 && styles.appRowBorder,
              ]}
            >
              <View style={styles.appRowTop}>
                {/* App icon */}
                <View style={styles.appIconFrame}>
                  <MaterialIcons name={app.icon} size={20} color="#111111" />
                </View>

                {/* App info */}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.appName}>{app.name}</Text>
                  <Text style={[editorialLabel, { color: '#a8a29e' }]}>{app.category}</Text>
                </View>

                {/* Time */}
                <Text style={styles.appTime}>{app.time}</Text>
              </View>

              {/* Usage bar */}
              <View style={styles.appProgressTrack}>
                <View style={[styles.appProgressFill, { width: `${app.progress * 100}%` }]} />
              </View>
            </View>
          ))}
        </View>

        {/* View All button */}
        <TouchableOpacity style={styles.viewAllBtn} activeOpacity={0.7}>
          <Text style={[editorialLabel, { color: '#111111' }]}>View All Apps</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const BORDER = { borderWidth: 1.5, borderColor: '#111111' } as const;

const styles = StyleSheet.create({
  // ── Header ────────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    fontFamily: 'Manrope-Light',
    fontSize: 32,
    color: '#111111',
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  avatarFrame: {
    width: 48,
    height: 48,
    borderRadius: 24,
    ...BORDER,
    padding: 2,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },

  // ── Hero Card ─────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: '#111111',
    borderRadius: 24,
    padding: 24,
    height: 256,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  heroShine: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroMetric: {
    fontFamily: 'Manrope-ExtraLight',
    fontSize: 56,
    color: '#ffffff',
    letterSpacing: -1.5,
    lineHeight: 60,
  },
  heroStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroStatText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.8)',
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  heroBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  heroBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  // ── Quick Actions Grid ────────────────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  actionCard: {
    ...BORDER,
    borderRadius: 24,
    padding: 20,
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
  },
  actionCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  // ── Top Apps ──────────────────────────────────────────────────────────────
  appsSection: {
    ...BORDER,
    borderRadius: 24,
    overflow: 'hidden',
  },
  appsSectionHeader: {
    padding: 20,
    borderBottomWidth: 1.5,
    borderBottomColor: '#111111',
    backgroundColor: '#fafaf9',
  },
  appRow: {
    padding: 20,
    gap: 12,
    backgroundColor: '#ffffff',
  },
  appRowBorder: {
    borderTopWidth: 1.5,
    borderTopColor: '#111111',
  },
  appRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appIconFrame: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f3f4',
    ...BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: '#111111',
  },
  appTime: {
    fontFamily: 'Manrope-Light',
    fontSize: 20,
    color: '#111111',
    letterSpacing: -0.5,
  },
  appProgressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: '#f3f3f4',
    borderRadius: 2,
    overflow: 'hidden',
  },
  appProgressFill: {
    height: '100%',
    backgroundColor: '#111111',
    borderRadius: 2,
  },

  // ── View All button ───────────────────────────────────────────────────────
  viewAllBtn: {
    marginTop: 8,
    height: 56,
    ...BORDER,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
