import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSubscription } from "@/hooks/useSubscription";

const isWeb = Platform.OS === "web";

const PRO_FEATURES = [
  { icon: "all-inclusive", label: "Unlimited focus sessions, any duration" },
  { icon: "flag",          label: "Unlimited goals & scheduling" },
  { icon: "insights",      label: "Full usage analytics & insights" },
  { icon: "block",         label: "Unlimited app blocking rules" },
  { icon: "support-agent", label: "Priority support" },
];

const FREE_LIMITS = [
  { icon: "timer",    label: "1 focus session per day, max 5 minutes" },
  { icon: "flag",     label: "No goals" },
  { icon: "lock",     label: "Analytics locked" },
];

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 0 : insets.top;
  const sub = useSubscription();

  const planName =
    sub.plan === "pro"
      ? "Hadaf Pro"
      : sub.plan === "limited"
        ? "Free (Limited)"
        : "Free Trial";
  const planBody =
    sub.plan === "pro"
      ? `You have unlimited access to every feature.${sub.proExpiresAt ? ` Renews / ends ${new Date(sub.proExpiresAt).toLocaleDateString()}.` : ""}`
      : sub.plan === "limited"
        ? "Your 5-day trial has ended. You're on the limited plan - upgrade to unlock everything again."
        : `${sub.trialDaysLeft || 5} days left of your free trial - every feature is unlocked. After that you'll move to the limited plan.`;

  const onUpgrade = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await sub.purchase();
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("You're Pro!", "Thank you - every feature is now unlocked.", [{ text: "Let's go", onPress: () => router.back() }]);
    } else if (!result.cancelled) {
      Alert.alert("Purchase not completed", result.error ?? "Something went wrong. You haven't been charged.");
    }
  };

  const onRestore = async () => {
    Haptics.selectionAsync();
    const result = await sub.restore();
    Alert.alert(
      result.success ? "Purchases restored" : "Nothing to restore",
      result.success ? "Hadaf Pro is active on your account." : result.error ?? "We couldn't find an active subscription for this account.",
    );
  };

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
          <Text style={styles.currentPlanName}>{planName}</Text>
          <Text style={styles.currentPlanBody}>{planBody}</Text>
        </Animated.View>

        {sub.plan !== "pro" && (
          <Animated.View entering={isWeb ? undefined : FadeInDown.delay(60).springify()} style={styles.priceCard}>
            <Text style={styles.priceLabel}>HADAF PRO</Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{sub.priceLabel}</Text>
              <Text style={styles.pricePer}> / month</Text>
            </View>
            <Text style={styles.priceNote}>Cancel anytime in Google Play.</Text>
          </Animated.View>
        )}

        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(100).springify()} style={styles.section}>
          <Text style={styles.sectionLabel}>PRO INCLUDES</Text>
          <View style={styles.cardList}>
            {PRO_FEATURES.map((f, i) => (
              <View key={f.label} style={[styles.featureRow, i < PRO_FEATURES.length - 1 && styles.featureDivider]}>
                <MaterialIcons name={f.icon as any} size={20} color="#000" />
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {sub.plan !== "pro" && (
          <Animated.View entering={isWeb ? undefined : FadeInDown.delay(140).springify()} style={styles.section}>
            <Text style={styles.sectionLabel}>FREE PLAN AFTER THE 5-DAY TRIAL</Text>
            <View style={styles.cardList}>
              {FREE_LIMITS.map((f, i) => (
                <View key={f.label} style={[styles.featureRow, i < FREE_LIMITS.length - 1 && styles.featureDivider]}>
                  <MaterialIcons name={f.icon as any} size={20} color="#888" />
                  <Text style={[styles.featureLabel, { color: "#666" }]}>{f.label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {sub.plan !== "pro" && (
          <Animated.View entering={isWeb ? undefined : FadeInDown.delay(180).springify()} style={{ gap: 14 }}>
            <TouchableOpacity
              style={[styles.upgradeBtn, sub.purchasing && { opacity: 0.6 }]}
              activeOpacity={0.85}
              disabled={sub.purchasing}
              onPress={onUpgrade}
            >
              {sub.purchasing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.upgradeBtnText}>UPGRADE TO PRO · {sub.priceLabel}/MO</Text>
              )}
            </TouchableOpacity>
            {!sub.purchasesReady && (
              <Text style={styles.hint}>
                {sub.purchasesIssue ?? "Subscriptions are still loading. If this doesn't go away, make sure you're running a build that includes in-app purchases."}
              </Text>
            )}
            <TouchableOpacity onPress={onRestore} disabled={sub.purchasing} hitSlop={10}>
              <Text style={styles.restore}>Restore purchases</Text>
            </TouchableOpacity>
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

  currentPlanCard: { backgroundColor: "#000", borderRadius: 22, padding: 24, gap: 8 },
  currentPlanLabel:{ fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.6)", letterSpacing: 2 },
  currentPlanName: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
  currentPlanBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)", lineHeight: 20 },

  priceCard: {
    backgroundColor: "#fff", borderRadius: 22, padding: 24, gap: 6, borderWidth: 2, borderColor: "#000",
  },
  priceLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 2.5 },
  priceRow: { flexDirection: "row", alignItems: "flex-end" },
  price: { fontSize: 38, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: -1 },
  pricePer: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#666", marginBottom: 7 },
  priceNote: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#888" },

  section:      { gap: 12 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 2.5 },
  cardList: {
    backgroundColor: "#fff", borderRadius: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1,
  },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 16 },
  featureDivider: { borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  featureLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#000", flexShrink: 1 },

  upgradeBtn: { backgroundColor: "#000", borderRadius: 999, paddingVertical: 16, alignItems: "center", minHeight: 52, justifyContent: "center" },
  upgradeBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1.2 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#888", textAlign: "center", lineHeight: 18 },
  restore: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#000", textAlign: "center", textDecorationLine: "underline" },
});
