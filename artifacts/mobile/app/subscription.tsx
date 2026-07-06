import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
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

const PRO_FEATURES = [
  { icon: "all-inclusive",       label: "Unlimited focus sessions" },
  { icon: "insights",            label: "Advanced usage analytics" },
  { icon: "block",                label: "Unlimited app blocking rules" },
  { icon: "support-agent",       label: "Priority support" },
];

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 0 : insets.top;

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>SUBSCRIPTION</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 72, paddingBottom: 48 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(0).springify()} style={styles.currentPlanCard}>
          <Text style={styles.currentPlanLabel}>CURRENT PLAN</Text>
          <Text style={styles.currentPlanName}>Free</Text>
          <Text style={styles.currentPlanBody}>
            You're on the free plan. Upgrade to Pro for unlimited focus sessions and advanced analytics.
          </Text>
        </Animated.View>

        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(80).springify()} style={styles.section}>
          <Text style={styles.sectionLabel}>PRO INCLUDES</Text>
          <View style={styles.cardList}>
            {PRO_FEATURES.map((f, i) => (
              <View
                key={f.label}
                style={[styles.featureRow, i < PRO_FEATURES.length - 1 && styles.featureDivider]}
              >
                <MaterialIcons name={f.icon as any} size={20} color="#000" />
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(160).springify()}>
          <TouchableOpacity
            style={styles.upgradeBtn}
            activeOpacity={0.85}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
          >
            <Text style={styles.upgradeBtnText}>UPGRADE TO PRO</Text>
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

  currentPlanCard: { backgroundColor: "#000", borderRadius: 22, padding: 24, gap: 8 },
  currentPlanLabel:{ fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.6)", letterSpacing: 2 },
  currentPlanName: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
  currentPlanBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)", lineHeight: 20 },

  section:      { gap: 12 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 2.5 },
  cardList: {
    backgroundColor: "#fff", borderRadius: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1,
  },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 16 },
  featureDivider: { borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  featureLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#000" },

  upgradeBtn: { backgroundColor: "#000", borderRadius: 999, paddingVertical: 16, alignItems: "center" },
  upgradeBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1.2 },
});
