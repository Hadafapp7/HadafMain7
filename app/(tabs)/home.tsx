import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Border, Radius } from '@/constants/theme';
import { getGreeting } from '@/utils/formatters';

// On web the app lives inside a 390-wide frame; on native use real screen width
const FRAME_W    = Platform.OS === 'web' ? 390 : Dimensions.get('window').width;
const H_PADDING  = 24;
const CARD_GAP   = 16;
const CARD_SIZE  = (FRAME_W - H_PADDING * 2 - CARD_GAP) / 2;
const HERO_BAR_W = FRAME_W - H_PADDING * 2 - 48;   // inside hero card padding
const APP_BAR_W  = FRAME_W - H_PADDING * 2 - 40;   // inside app row padding

const S_LABEL = Typography.label;

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
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[S_LABEL, { color: Colors.muted }]}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}
          </Text>
          <Text style={styles.greeting}>
            {getGreeting()},{'\n'}Ahmad.
          </Text>
        </View>

        <View style={styles.avatarFrame}>
          <Image
            source={{ uri: 'https://randomuser.me/api/portraits/men/32.jpg' }}
            style={styles.avatarImage}
            resizeMode="cover"
          />
        </View>
      </View>

      {/* ── Hero Dark Card ───────────────────────────────────────────────────── */}
      <View style={styles.heroCard}>
        <View style={styles.heroShine} />

        <View>
          <Text style={[S_LABEL, { color: 'rgba(255,255,255,0.6)' }]}>
            TODAY'S SCREEN TIME
          </Text>
          <Text style={styles.heroMetric}>2h 14m</Text>
          <View style={styles.heroStatRow}>
            <MaterialIcons name="south-east" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.heroStatText}>↓ 8% VS LAST WEEK</Text>
          </View>
        </View>

        <View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: HERO_BAR_W * 0.5 }]} />
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

      {/* ── Quick Actions 2×2 ────────────────────────────────────────────────── */}
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
                color={Colors.primary}
              />
              <MaterialIcons name="arrow-forward" size={20} color={Colors.primary} />
            </View>
            <Text style={[S_LABEL, { color: Colors.primary }]}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Top Apps Today ────────────────────────────────────────────────────── */}
      <View>
        <View style={styles.appsSection}>
          <View style={styles.appsSectionHeader}>
            <Text style={[S_LABEL, { color: Colors.primary }]}>TOP APPS TODAY</Text>
          </View>

          {TOP_APPS.map((app, index) => (
            <View key={app.name} style={[styles.appRow, index > 0 && styles.appRowBorder]}>
              <View style={styles.appRowTop}>
                <View style={styles.appIconFrame}>
                  <MaterialIcons
                    name={app.icon as React.ComponentProps<typeof MaterialIcons>['name']}
                    size={20}
                    color={Colors.primary}
                  />
                </View>
                <View style={styles.appInfo}>
                  <Text style={styles.appName}>{app.name}</Text>
                  <Text style={[S_LABEL, { color: Colors.muted }]}>{app.category}</Text>
                </View>
                <Text style={styles.appTime}>{app.time}</Text>
              </View>
              <View style={styles.appProgressTrack}>
                <View style={[styles.appProgressFill, { width: APP_BAR_W * app.progress }]} />
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.viewAllBtn} activeOpacity={0.7}>
          <Text style={[S_LABEL, { color: Colors.primary }]}>View All Apps</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: H_PADDING, paddingBottom: 140, rowGap: 32 },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting:  { ...Typography.pageTitle, color: Colors.primary, marginTop: 4 },
  avatarFrame: { width: 48, height: 48, borderRadius: 24, ...Border.signature, padding: 2, overflow: 'hidden' },
  avatarImage: { width: 42, height: 42, borderRadius: 21 },

  // Hero card
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    padding: 24,
    height: 256,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  heroShine: {
    position: 'absolute', top: 0, right: 0,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroMetric:   { ...Typography.heroMetric, color: '#ffffff', marginTop: 4 },
  heroStatRow:  { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  heroStatText: { fontFamily: 'Inter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.8)', marginLeft: 4 },
  progressTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden', marginBottom: 20 },
  progressFill:  { height: 4, backgroundColor: '#ffffff', borderRadius: 2 },
  heroBtnRow:    { flexDirection: 'row' },
  heroBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },

  // Grid
  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  actionCard:  { ...Border.signature, borderRadius: Radius.lg, padding: 20, justifyContent: 'space-between', backgroundColor: Colors.background },
  actionCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },

  // Top apps
  appsSection:       { ...Border.signature, borderRadius: Radius.lg, overflow: 'hidden' },
  appsSectionHeader: { padding: 20, borderBottomWidth: 1.5, borderBottomColor: Colors.primary, backgroundColor: Colors.surfaceLow },
  appRow:            { padding: 20, backgroundColor: Colors.background },
  appRowBorder:      { borderTopWidth: 1.5, borderTopColor: Colors.primary },
  appRowTop:         { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  appIconFrame:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceLow, ...Border.signature, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  appInfo:           { flex: 1 },
  appName:           { ...Typography.bodyBold, color: Colors.primary, marginBottom: 2 },
  appTime:           { fontFamily: 'Manrope-Light', fontSize: 20, color: Colors.primary, letterSpacing: -0.5 },
  appProgressTrack:  { height: 4, backgroundColor: Colors.surfaceLow, borderRadius: 2, overflow: 'hidden' },
  appProgressFill:   { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },

  // View All
  viewAllBtn: { marginTop: 8, height: 56, ...Border.signature, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
