import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const isWeb = Platform.OS === "web";

function ToggleRow({
  icon,
  label,
  value,
  onToggle,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity style={styles.toggleCard} activeOpacity={0.85} onPress={onToggle}>
      <View style={styles.toggleLeft}>
        <MaterialIcons name={icon} size={22} color="#000" />
        <Text style={styles.toggleLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: "#e0e0e0", true: "#000" }}
        thumbColor="#fff"
        ios_backgroundColor="#e0e0e0"
      />
    </TouchableOpacity>
  );
}

export default function NotificationsSettingsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 0 : insets.top;

  const [daily,      setDaily]      = useState(true);
  const [goalProg,   setGoalProg]   = useState(true);
  const [achAlerts,  setAchAlerts]  = useState(false);
  const [appUpdates, setAppUpdates] = useState(true);
  const [perfReport, setPerfReport] = useState(false);

  const toggle = (fn: () => void) => () => { Haptics.selectionAsync(); fn(); };

  return (
    <View style={styles.root}>
      {/* Top App Bar */}
      <View style={[styles.topBar, { paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>NOTIFICATIONS</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 72, paddingBottom: 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Push Notifications */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(0).springify()} style={styles.section}>
          <Text style={styles.sectionLabel}>PUSH NOTIFICATIONS</Text>
          <View style={styles.cardList}>
            <ToggleRow icon="alarm"       label="Daily Reminders"   value={daily}     onToggle={toggle(() => setDaily(v => !v))} />
            <ToggleRow icon="trending-up" label="Goal Progress"     value={goalProg}  onToggle={toggle(() => setGoalProg(v => !v))} />
            <ToggleRow icon="emoji-events" label="Achievement Alerts" value={achAlerts} onToggle={toggle(() => setAchAlerts(v => !v))} />
          </View>
        </Animated.View>

        {/* Email Notifications */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(80).springify()} style={styles.section}>
          <Text style={styles.sectionLabel}>EMAIL NOTIFICATIONS</Text>
          <View style={styles.cardList}>
            <ToggleRow icon="system-update" label="App Updates"         value={appUpdates} onToggle={toggle(() => setAppUpdates(v => !v))} />
            <ToggleRow icon="insights"      label="Performance Reports" value={perfReport}  onToggle={toggle(() => setPerfReport(v => !v))} />
          </View>
        </Animated.View>

        {/* Focus Mode Info Card */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(160).springify()} style={styles.focusModeCard}>
          <Text style={styles.focusModeTitle}>Focus Mode</Text>
          <Text style={styles.focusModeBody}>
            System-wide notifications are silenced during active focus sessions to maintain peak cognitive clarity.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#f9f9f9" },
  scroll: { flex: 1 },
  content:{ paddingHorizontal: 20, gap: 24 },

  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: "#f3f3f3",
  },
  backBtn:     { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  topBarTitle: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.5, color: "#000" },

  section:      { gap: 12 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 2.5 },
  cardList:     { gap: 10 },

  toggleCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff", borderRadius: 18,
    paddingHorizontal: 20, paddingVertical: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1,
  },
  toggleLeft:  { flexDirection: "row", alignItems: "center", gap: 16 },
  toggleLabel: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#000" },

  focusModeCard: {
    backgroundColor: "#000", borderRadius: 22,
    padding: 24, gap: 10,
  },
  focusModeTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  focusModeBody:  { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)", lineHeight: 22 },
});
