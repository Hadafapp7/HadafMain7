import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
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

import {
  useGetUserSettings,
  useUpdateUserSettings,
  UserSettingsUpdateAppearance,
  type UserSettingsAppearance,
} from "@workspace/api-client-react";

const isWeb = Platform.OS === "web";

const APPEARANCE_OPTIONS: { value: UserSettingsAppearance; label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"] }[] = [
  { value: "light",  label: "Light",         icon: "light-mode" },
  { value: "dark",   label: "Dark",          icon: "dark-mode"  },
  { value: "system", label: "Match System",  icon: "smartphone" },
];

export default function AppearanceScreen() {
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 0 : insets.top;

  const { data: settings, isLoading } = useGetUserSettings();
  const updateSettings = useUpdateUserSettings();

  const handleSelect = (value: UserSettingsAppearance) => {
    Haptics.selectionAsync();
    updateSettings.mutate({ data: { appearance: value as UserSettingsUpdateAppearance } });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>APPEARANCE</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 72, paddingBottom: 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color="#000" />
        ) : (
          <Animated.View entering={isWeb ? undefined : FadeInDown.delay(0).springify()} style={styles.section}>
            <Text style={styles.sectionLabel}>THEME</Text>
            <View style={styles.cardList}>
              {APPEARANCE_OPTIONS.map((opt) => {
                const active = settings?.appearance === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={styles.optionRow}
                    activeOpacity={0.85}
                    onPress={() => handleSelect(opt.value)}
                  >
                    <View style={styles.optionLeft}>
                      <MaterialIcons name={opt.icon} size={22} color="#000" />
                      <Text style={styles.optionLabel}>{opt.label}</Text>
                    </View>
                    {active && <MaterialIcons name="check-circle" size={22} color="#000" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        )}
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

  optionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff", borderRadius: 18,
    paddingHorizontal: 20, paddingVertical: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1,
  },
  optionLeft:  { flexDirection: "row", alignItems: "center", gap: 16 },
  optionLabel: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#000" },
});
