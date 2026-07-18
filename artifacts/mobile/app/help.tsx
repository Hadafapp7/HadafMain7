import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const isWeb = Platform.OS === "web";

const FAQS = [
  { q: "How does Focus Mode work?", a: "Set an intention and pick a duration. While a session is running, your blocked apps are logged so you can review discipline over time." },
  { q: "How do I log app usage?", a: "Use the manual usage entry flow to log time spent on an app. Your Home screen aggregates entries into daily totals." },
  { q: "Can I edit or delete a goal?", a: "Yes — tap any goal on the Goals tab to open the edit sheet, where you can update or delete it." },
  { q: "Is my data private?", a: "Yes. Your goals, sessions, and usage logs are tied only to your account. See Privacy & Security to manage data preferences." },
];

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 0 : insets.top;

  const handleContact = () => {
    Haptics.selectionAsync();
    Linking.openURL("mailto:support@hadaf.app");
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>HELP</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 72, paddingBottom: 48 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(0).springify()} style={styles.section}>
          <Text style={styles.sectionLabel}>FREQUENTLY ASKED</Text>
          <View style={styles.cardList}>
            {FAQS.map((f, i) => (
              <View key={f.q} style={[styles.faqRow, i < FAQS.length - 1 && styles.faqDivider]}>
                <Text style={styles.faqQ}>{f.q}</Text>
                <Text style={styles.faqA}>{f.a}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(120).springify()} style={styles.contactCard}>
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactBody}>Our support team typically replies within one business day.</Text>
          <TouchableOpacity style={styles.contactBtn} activeOpacity={0.85} onPress={handleContact}>
            <MaterialIcons name="mail-outline" size={18} color="#000" />
            <Text style={styles.contactBtnText}>Contact Support</Text>
          </TouchableOpacity>
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
  cardList: {
    backgroundColor: "#fff", borderRadius: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1,
  },
  faqRow: { paddingHorizontal: 20, paddingVertical: 18, gap: 6 },
  faqDivider: { borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  faqQ: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#000" },
  faqA: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#666", lineHeight: 19 },

  contactCard: { backgroundColor: "#fff", borderRadius: 22, padding: 24, gap: 10, alignItems: "flex-start" },
  contactTitle:{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#000" },
  contactBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#666", lineHeight: 19 },
  contactBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#f3f3f3", borderRadius: 999,
    paddingHorizontal: 18, paddingVertical: 10, marginTop: 4,
  },
  contactBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#000" },
});
