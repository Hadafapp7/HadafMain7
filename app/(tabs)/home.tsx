import { ScrollView, View, Text, TouchableOpacity, Dimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PADDING = 24;          // horizontal padding of the scroll container
const CARD_GAP  = 16;          // gap between grid cards
const CARD_SIZE = (SCREEN_WIDTH - H_PADDING * 2 - CARD_GAP) / 2;

// Hero card inner width: screen - scrollview H_PADDING×2 - card padding×2
const HERO_INNER_W = SCREEN_WIDTH - H_PADDING * 2 - 48;
// App row inner width: screen - scrollview padding×2 - row padding×2
const APP_ROW_W = SCREEN_WIDTH - H_PADDING * 2 - 40;

// ─── Shared editorial label style (Work Sans Bold, 10px, uppercase, tracked) ──
const S_LABEL = {
  fontFamily: 'WorkSans-Bold',
  fontSize: 10,
  letterSpacing: 2,
  textTransform: 'uppercase' as const,
};

const QUICK_ACTIONS = [
  { label: 'Focus', icon: 'filter-center-focus' },
  { label: 'Mood',  icon: 'mood'                },
  { label: 'Goals', icon: 'flag'                },
  { label: 'Stats', icon: 'insights'            },
] as const;

const TOP_APPS = [
  { name: 'Outlook',  category: 'Productivity', time: '45m', progress: 0.75, icon: 'mail' },
  { name: 'CodeEdit', category: 'Development',  time: '38m', progress: 0.55, icon: 'code' },
] as const;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 32 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[S_LABEL, { color: '#a8a29e' }]}>THURSDAY, OCT 24</Text>
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
        <View style={styles.heroShine} />

        {/* Top: label + metric + stat */}
        <View style={{ rowGap: 6 }}>
          <Text style={[S_LABEL, { color: 'rgba(255,255,255,0.6)' }]}>
            TODAY'S SCREEN TIME
          </Text>
          <Text style={styles.heroMetric}>2h 14m</Text>
          <View style={styles.heroStatRow}>
            <MaterialIcons name="south-east" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.heroStatText}>↓ 8% VS LAST WEEK</Text>
          </View>
        </View>

        {/* Bottom: progress bar + buttons */}
        <View style={{ rowGap: 20 }}>
          {/* Progress bar — numeric pixel width, no string percentages */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: HERO_INNER_W * 0.5 }]} />
          </View>

          <View style={styles.heroBtnRow}>
            <TouchableOpacity style={styles.heroBtn} activeOpacity={0.7}>
              <MaterialIcons name="settings"  size={13} color="#ffffff" />
              <Text style={[S_LABEL, { color: '#ffffff', letterSpacing: 1.5 }]}>SETTINGS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroBtn} activeOpacity={0.7}>
              <MaterialIcons name="analytics" size={13} color="#ffffff" />
              <Text style={[S_LABEL, { color: '#ffffff', letterSpacing: 1.5 }]}>ANALYTICS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Quick Actions 2 × 2 Grid ────────────────────────────────────────── */}
      <View style={styles.grid}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={[styles.actionCard, { width: CARD_SIZE, height: CARD_SIZE }]}
            activeOpacity={0.7}
          >
            <View style={styles.actionCardTop}>
              <MaterialIcons
                name={action.icon as React.ComponentProps<typeof MaterialIcons>['name']}
                size={28}
                color="#111111"
              />
              <MaterialIcons name="arrow-forward" size={20} color="#111111" />
            </View>
            <Text style={[S_LABEL, { color: '#111111' }]}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Top Apps Today ──────────────────────────────────────────────────── */}
      <View>
        <View style={styles.appsSection}>
          {/* Section header */}
          <View style={styles.appsSectionHeader}>
            <Text style={[S_LABEL, { color: '#111111' }]}>TOP APPS TODAY</Text>
          </View>

          {TOP_APPS.map((app, index) => (
            <View
              key={app.name}
              style={[styles.appRow, index > 0 && styles.appRowBorder]}
            >
              <View style={styles.appRowTop}>
                <View style={styles.appIconFrame}>
                  <MaterialIcons
                    name={app.icon as React.ComponentProps<typeof MaterialIcons>['name']}
                    size={20}
                    color="#111111"
                  />
                </View>

                <View style={styles.appInfo}>
                  <Text style={styles.appName}>{app.name}</Text>
                  <Text style={[S_LABEL, { color: '#a8a29e' }]}>{app.category}</Text>
                </View>

                <Text style={styles.appTime}>{app.time}</Text>
              </View>

              {/* Progress bar — numeric pixel width, no template-literal strings */}
              <View style={styles.appProgressTrack}>
                <View
                  style={[
                    styles.appProgressFill,
                    { width: APP_ROW_W * app.progress },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.viewAllBtn} activeOpacity={0.7}>
          <Text style={[S_LABEL, { color: '#111111' }]}>View All Apps</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const BORDER = { borderWidth: 1.5, borderColor: '#111111' } as const;

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 140,
    rowGap: 32,
  },

  // ── Header ─────────────────────────────────────────────────────────────────
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
    marginTop: 4,
  },
  avatarFrame: {
    width: 48,
    height: 48,
    borderRadius: 24,
    ...BORDER,
    padding: 2,
    overflow: 'hidden',
  },
  // Explicit pixel dimensions — avoids string '100%' on Android
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },

  // ── Hero Card ───────────────────────────────────────────────────────────────
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
    columnGap: 4,
  },
  heroStatText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.8)',
  },
  // Track: overflow hidden clips the fill at exact pixel width
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  // Fill: height is an explicit integer, not a % string
  progressFill: {
    height: 4,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  heroBtnRow: {
    flexDirection: 'row',
    columnGap: 12,
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
    columnGap: 6,
  },

  // ── Quick Actions Grid ──────────────────────────────────────────────────────
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

  // ── Top Apps ────────────────────────────────────────────────────────────────
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
    rowGap: 12,
    backgroundColor: '#ffffff',
  },
  appRowBorder: {
    borderTopWidth: 1.5,
    borderTopColor: '#111111',
  },
  appRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 12,
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
  appInfo: {
    flex: 1,
    rowGap: 2,
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
  // Track: overflow hidden clips the fill at exact pixel width
  appProgressTrack: {
    height: 4,
    backgroundColor: '#f3f3f4',
    borderRadius: 2,
    overflow: 'hidden',
  },
  // Fill: height is explicit integer, width passed as calculated pixel value
  appProgressFill: {
    height: 4,
    backgroundColor: '#111111',
    borderRadius: 2,
  },

  // ── View All ────────────────────────────────────────────────────────────────
  viewAllBtn: {
    marginTop: 8,
    height: 56,
    ...BORDER,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
