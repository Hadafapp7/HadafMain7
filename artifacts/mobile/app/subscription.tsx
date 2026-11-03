import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDialog } from "@/components/AppDialog";
import { type BillingPeriod, useSubscription } from "@/hooks/useSubscription";

const isWeb = Platform.OS === "web";
const INK = "#0a0a0a";
const TRIAL_DAYS = 5;

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

const COMPARE_ROWS: { label: string; free: string | false; pro: string | true }[] = [
  { label: "Focus sessions", free: "1 per day", pro: "Unlimited" },
  { label: "Session length", free: "Up to 5 min", pro: "Any duration" },
  { label: "Goals & scheduling", free: false, pro: true },
  { label: "Usage analytics", free: "Locked", pro: "Full insights" },
];

const PRO_EXTRAS: { icon: IconName; label: string }[] = [
  { icon: "block", label: "Unlimited app blocking rules" },
  { icon: "support-agent", label: "Priority support" },
];

const STAGES: { icon: IconName; title: string; body: string; plan: "trial" | "limited" | "pro" }[] = [
  { icon: "card-giftcard", title: "Free Trial", body: `Days 1-${TRIAL_DAYS} · everything unlocked`, plan: "trial" },
  { icon: "lock", title: "Free Plan", body: "After 5-day trial · limited features", plan: "limited" },
  { icon: "bolt", title: "Hadaf Pro", body: "Anytime · unlimited focus, goals & insights", plan: "pro" },
];

function formatMoney(value: number, currency: string | null): string {
  try {
    if (currency) return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    /* fall through */
  }
  return `${currency ?? ""} ${value.toFixed(2)}`.trim();
}

// ───────────────────────────── Pieces ─────────────────────────────

function PlanCard({
  selected,
  onPress,
  title,
  price,
  period,
  caption,
  badge,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  price: string;
  period: string;
  caption: string;
  badge?: string;
}) {
  const scale = useSharedValue(1);
  const sel = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    sel.value = withTiming(selected ? 1 : 0, { duration: 220, easing: Easing.out(Easing.quad) });
    if (selected) {
      scale.value = withSpring(1.02, { damping: 10, stiffness: 220 }, () => {
        scale.value = withSpring(1, { damping: 12 });
      });
    }
  }, [selected]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor: sel.value > 0.5 ? INK : "#e4e4e7",
    backgroundColor: sel.value > 0.5 ? "#fff" : "#fafafa",
  }));
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: sel.value }], opacity: sel.value }));

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <Animated.View style={[styles.planCard, style]}>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
        <View style={styles.radioOuter}>
          <Animated.View style={[styles.radioInner, dotStyle]} />
        </View>
        <Text style={styles.planTitle}>{title}</Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <Text style={styles.planPrice}>{price}</Text>
          <Text style={styles.planPer}>{period}</Text>
        </View>
        <Text style={styles.planCaption}>{caption}</Text>
      </Animated.View>
    </Pressable>
  );
}

function TrialBar({ daysLeft }: { daysLeft: number }) {
  const w = useSharedValue(0);
  const used = Math.min(1, Math.max(0, (TRIAL_DAYS - daysLeft) / TRIAL_DAYS));
  useEffect(() => {
    w.value = withTiming(Math.max(used, 0.06), { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [used]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={styles.trialTrack}>
      <Animated.View style={[styles.trialFill, style]} />
    </View>
  );
}

function Cell({ value, pro }: { value: string | boolean; pro?: boolean }) {
  if (value === true) return <MaterialIcons name="check-circle" size={20} color={INK} />;
  if (value === false) return <MaterialIcons name="cancel" size={20} color="#c4c4c8" />;
  return <Text style={[styles.cellText, pro && { color: INK, fontFamily: "Inter_700Bold" }]}>{value}</Text>;
}

// ───────────────────────────── Screen ─────────────────────────────

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 0 : insets.top;
  const sub = useSubscription();
  const dialog = useDialog();

  const monthly = sub.plans.monthly;
  const annual = sub.plans.annual;
  const [selected, setSelected] = useState<BillingPeriod>("monthly");
  useEffect(() => {
    // Default to the better-value plan once it is known.
    if (annual) setSelected("annual");
  }, [annual?.priceString]);

  const activePeriod: BillingPeriod = selected === "annual" && annual ? "annual" : "monthly";

  const savePct =
    monthly?.amount && annual?.amount && monthly.currency === annual.currency
      ? Math.round((1 - annual.amount / (monthly.amount * 12)) * 100)
      : null;
  const annualPerMonth = annual?.amount ? formatMoney(annual.amount / 12, annual.currency) : null;

  // Determine highlighted plan in "HOW IT WORKS":
  // New user / just logged in / trial period -> "trial"
  // After 5 days (limited) -> "limited"
  // Pro subscriber -> "pro"
  const highlightedPlan: "trial" | "limited" | "pro" =
    sub.isPro || sub.plan === "pro"
      ? "pro"
      : sub.isLimited || sub.plan === "limited"
        ? "limited"
        : "trial";

  const planName = sub.plan === "pro" ? "Hadaf Pro" : sub.plan === "limited" ? "Free plan" : "Free trial";
  const planBody =
    sub.plan === "pro"
      ? `Unlimited access to every feature.${sub.proExpiresAt ? ` Active until ${new Date(sub.proExpiresAt).toLocaleDateString()}.` : ""}`
      : sub.plan === "limited"
        ? "Your 5-day trial has ended. Upgrade to unlock everything again."
        : `${sub.trialDaysLeft || TRIAL_DAYS} day${(sub.trialDaysLeft || TRIAL_DAYS) === 1 ? "" : "s"} left. Every feature is unlocked until then.`;
  const chip = sub.plan === "pro" ? "ACTIVE" : sub.plan === "limited" ? "LIMITED" : "TRIAL";

  const ctaPrice =
    activePeriod === "annual"
      ? `${annual?.priceString ?? ""}/YR`
      : `${monthly?.priceString ?? sub.priceLabel}/MO`;

  const onUpgrade = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await sub.purchase(activePeriod);
    if (result.success) {
      dialog.show({
        title: "You're Pro!",
        message: "Thank you - every feature is now unlocked.",
        tone: "success",
        actions: [{ text: "Let's go", style: "primary", onPress: () => router.back() }],
      });
    } else if (!result.cancelled) {
      dialog.show({
        title: "Purchase not completed",
        message: result.error ?? "Something went wrong. You haven't been charged.",
        tone: "danger",
        actions: [{ text: "OK", style: "primary" }],
      });
    }
  };

  const onRestore = async () => {
    Haptics.selectionAsync();
    const result = await sub.restore();
    dialog.show({
      title: result.success ? "Purchases restored" : "Nothing to restore",
      message: result.success
        ? "Hadaf Pro is active on your account."
        : result.error ?? "We couldn't find an active subscription for this account.",
      tone: result.success ? "success" : "warning",
      actions: [{ text: "OK", style: "primary" }],
    });
  };

  const enter = (delay: number) => (isWeb ? undefined : FadeInDown.delay(delay).springify().damping(16));

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
        {/* Current plan */}
        <Animated.View entering={enter(0)} style={styles.currentPlanCard}>
          <View style={styles.currentTop}>
            <Text style={styles.currentPlanLabel}>YOUR PLAN</Text>
            <View style={styles.statusChip}>
              <View style={[styles.statusDot, sub.plan === "limited" && { backgroundColor: "#f59e0b" }]} />
              <Text style={styles.statusChipText}>{chip}</Text>
            </View>
          </View>
          <Text style={styles.currentPlanName}>{planName}</Text>
          <Text style={styles.currentPlanBody}>{planBody}</Text>
          {sub.plan === "trial" ? <TrialBar daysLeft={sub.trialDaysLeft || TRIAL_DAYS} /> : null}
        </Animated.View>

        {/* Plans */}
        {sub.plan !== "pro" && (
          <Animated.View entering={enter(60)} style={styles.section}>
            <Text style={styles.sectionLabel}>CHOOSE YOUR PLAN</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <PlanCard
                selected={activePeriod === "monthly"}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelected("monthly");
                }}
                title="Monthly"
                price={monthly?.priceString ?? sub.priceLabel}
                period=" / mo"
                caption="Billed every month"
              />
              {annual ? (
                <PlanCard
                  selected={activePeriod === "annual"}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelected("annual");
                  }}
                  title="Yearly"
                  price={annual.priceString}
                  period=" / yr"
                  caption={annualPerMonth ? `Just ${annualPerMonth} / month` : "Billed once a year"}
                  badge={savePct && savePct > 0 ? `SAVE ${savePct}%` : "BEST VALUE"}
                />
              ) : null}
            </View>
            <Text style={styles.finePrint}>Cancel anytime in Google Play. No hidden fees.</Text>
          </Animated.View>
        )}

        {/* How it works */}
        <Animated.View entering={enter(110)} style={styles.section}>
          <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
          <View style={styles.card}>
            {STAGES.map((s, i) => {
              const current = highlightedPlan === s.plan;
              return (
                <View
                  key={s.title}
                  style={[
                    styles.stageRow,
                    current && styles.stageRowActive,
                  ]}
                >
                  <View style={styles.stageRail}>
                    <View style={[styles.stageIcon, current && styles.stageIconActive]}>
                      <MaterialIcons name={s.icon} size={18} color={current ? "#fff" : "#71717a"} />
                    </View>
                    {i < STAGES.length - 1 ? (
                      <View style={[styles.stageLine, current && styles.stageLineActive]} />
                    ) : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: i < STAGES.length - 1 ? 14 : 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={[styles.stageTitle, current && styles.stageTitleActive]}>{s.title}</Text>
                      {current && (
                        <View style={[styles.nowPill, s.plan === "limited" && styles.nowPillLimited]}>
                          <View
                            style={[
                              styles.nowDot,
                              s.plan === "limited" ? { backgroundColor: "#f59e0b" } : { backgroundColor: "#22c55e" },
                            ]}
                          />
                          <Text style={styles.nowPillText}>
                            {s.plan === "trial" ? "CURRENT · FREE TRIAL" : s.plan === "limited" ? "CURRENT · FREE PLAN" : "CURRENT · PRO"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.stageBody, current && styles.stageBodyActive]}>{s.body}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.View>

        {/* Compare */}
        <Animated.View entering={enter(160)} style={styles.section}>
          <Text style={styles.sectionLabel}>COMPARE PLANS</Text>
          <View style={styles.card}>
            <View style={styles.tableHead}>
              <View style={{ flex: 1.25 }} />
              <Text style={[styles.colHead, { flex: 1 }]}>FREE</Text>
              <View style={[styles.proHead, { flex: 1 }]}>
                <Text style={[styles.colHead, { color: "#fff" }]}>PRO</Text>
              </View>
            </View>
            {COMPARE_ROWS.map((r, i) => (
              <View key={r.label} style={[styles.tableRow, i < COMPARE_ROWS.length - 1 && styles.rowDivider]}>
                <Text style={[styles.rowLabel, { flex: 1.25 }]}>{r.label}</Text>
                <View style={styles.cellWrap}>
                  <Cell value={r.free} />
                </View>
                <View style={styles.cellWrap}>
                  <Cell value={r.pro} pro />
                </View>
              </View>
            ))}
            <View style={styles.extrasBox}>
              <Text style={styles.extrasTitle}>ALSO WITH PRO</Text>
              {PRO_EXTRAS.map((e) => (
                <View key={e.label} style={styles.extraRow}>
                  <MaterialIcons name={e.icon} size={18} color={INK} />
                  <Text style={styles.extraText}>{e.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>

        {/* Actions */}
        {sub.plan !== "pro" ? (
          <Animated.View entering={enter(210)} style={{ gap: 14 }}>
            <TouchableOpacity
              style={[styles.upgradeBtn, sub.purchasing && { opacity: 0.6 }]}
              activeOpacity={0.85}
              disabled={sub.purchasing}
              onPress={onUpgrade}
            >
              {sub.purchasing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="bolt" size={18} color="#fff" />
                  <Text style={styles.upgradeBtnText}>UPGRADE TO PRO · {ctaPrice}</Text>
                </>
              )}
            </TouchableOpacity>
            {!sub.purchasesReady && (
              <Text style={styles.hint}>
                {sub.purchasesIssue ??
                  "Subscriptions are still loading. If this doesn't go away, make sure you're running a build that includes in-app purchases."}
              </Text>
            )}
            <TouchableOpacity onPress={onRestore} disabled={sub.purchasing} hitSlop={10}>
              <Text style={styles.restore}>Restore purchases</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <Animated.View entering={enter(210)} style={{ gap: 14 }}>
            <TouchableOpacity
              style={styles.manageBtn}
              activeOpacity={0.85}
              onPress={() => Linking.openURL("https://play.google.com/store/account/subscriptions").catch(() => {})}
            >
              <Text style={styles.manageBtnText}>MANAGE SUBSCRIPTION</Text>
              <MaterialIcons name="open-in-new" size={16} color={INK} />
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f9f9f9" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 26 },

  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: "#f3f3f3",
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  topBarTitle: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.5, color: "#000" },

  currentPlanCard: { backgroundColor: INK, borderRadius: 24, padding: 24, gap: 8 },
  currentTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  currentPlanLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.6)", letterSpacing: 2 },
  statusChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#22c55e" },
  statusChipText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1.4 },
  currentPlanName: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5 },
  currentPlanBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.68)", lineHeight: 20 },
  trialTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)", marginTop: 10, overflow: "hidden" },
  trialFill: { height: 6, borderRadius: 3, backgroundColor: "#fff" },

  section: { gap: 12 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 2.5 },
  card: {
    backgroundColor: "#fff", borderRadius: 22, padding: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },

  planCard: { borderRadius: 20, borderWidth: 2, padding: 16, gap: 6, minHeight: 152 },
  badge: {
    position: "absolute", top: -11, right: 12, backgroundColor: INK,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  badgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1 },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: INK,
    alignItems: "center", justifyContent: "center", marginBottom: 6,
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: INK },
  planTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#52525b", letterSpacing: 0.4 },
  planPrice: { fontSize: 28, fontFamily: "Inter_700Bold", color: INK, letterSpacing: -1 },
  planPer: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#71717a", marginBottom: 5 },
  planCaption: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#71717a", lineHeight: 17 },
  finePrint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#888", textAlign: "center" },

  stageRow: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
    opacity: 0.55,
  },
  stageRowActive: {
    backgroundColor: "#f4f4f5",
    borderColor: INK,
    opacity: 1,
  },
  stageRail: { alignItems: "center" },
  stageIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e4e4e7",
    alignItems: "center",
    justifyContent: "center",
  },
  stageIconActive: {
    backgroundColor: INK,
  },
  stageLine: { flex: 1, width: 2, backgroundColor: "#e4e4e7", marginVertical: 4 },
  stageLineActive: { backgroundColor: INK },
  stageTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#71717a" },
  stageTitleActive: { fontSize: 15, fontFamily: "Inter_700Bold", color: INK },
  stageBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#a1a1aa", marginTop: 2, lineHeight: 18 },
  stageBodyActive: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#3f3f46", marginTop: 2, lineHeight: 18 },
  nowPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: INK,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  nowPillLimited: {
    backgroundColor: "#27272a",
  },
  nowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  nowPillText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#ffffff", letterSpacing: 0.7 },

  tableHead: { flexDirection: "row", alignItems: "center", paddingBottom: 12 },
  colHead: { textAlign: "center", fontSize: 11, fontFamily: "Inter_700Bold", color: "#71717a", letterSpacing: 1.6 },
  proHead: { backgroundColor: INK, borderRadius: 10, paddingVertical: 6 },
  tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: "#f0f0f2" },
  rowLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: INK, paddingRight: 8 },
  cellWrap: { flex: 1, alignItems: "center" },
  cellText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#71717a", textAlign: "center" },

  extrasBox: { marginTop: 8, backgroundColor: "#f6f6f7", borderRadius: 14, padding: 14, gap: 10 },
  extrasTitle: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 2 },
  extraRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  extraText: { fontSize: 13, fontFamily: "Inter_500Medium", color: INK },

  upgradeBtn: {
    backgroundColor: INK, borderRadius: 999, paddingVertical: 16, minHeight: 56,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 6,
  },
  upgradeBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1.2 },
  manageBtn: {
    borderWidth: 2, borderColor: INK, borderRadius: 999, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  manageBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: INK, letterSpacing: 1.2 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#888", textAlign: "center", lineHeight: 18 },
  restore: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#000", textAlign: "center", textDecorationLine: "underline" },
});
