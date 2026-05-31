import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb = Platform.OS === "web";

// ── Types ──────────────────────────────────────────────────────────────────────
type GoalType = "daily" | "scheduled";

interface Goal {
  id: string;
  name: string;
  intent: string;
  type: GoalType;
  activeFrom: string;
  activeTo: string;
  scheduledDate: string;
  scheduledTime: string;
  progress: number;
}

const DEFAULT_GOALS: Goal[] = [
  {
    id: "1",
    name: "Deep Work",
    intent: "Complete project deliverables without distractions and stay in flow state.",
    type: "daily",
    activeFrom: "9:00 AM",
    activeTo: "11:00 AM",
    scheduledDate: "",
    scheduledTime: "",
    progress: 0.68,
  },
  {
    id: "2",
    name: "Morning Reading",
    intent: "Read 30 pages to grow knowledge and expand thinking every day.",
    type: "daily",
    activeFrom: "7:00 AM",
    activeTo: "8:00 AM",
    scheduledDate: "",
    scheduledTime: "",
    progress: 1.0,
  },
  {
    id: "3",
    name: "Evening Journal",
    intent: "Reflect on the day, celebrate wins, and plan tomorrow's priorities.",
    type: "daily",
    activeFrom: "9:00 PM",
    activeTo: "9:30 PM",
    scheduledDate: "",
    scheduledTime: "",
    progress: 0.0,
  },
];

// ── Animated progress bar ──────────────────────────────────────────────────────
function GoalProgressBar({ progress, delay = 0 }: { progress: number; delay?: number }) {
  const colors = useColors();
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(delay, withSpring(progress, { damping: 20, stiffness: 80 }));
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%` as any,
  }));

  const pct = Math.round(progress * 100);
  const statusColor = progress >= 1 ? "#16a34a" : progress > 0 ? colors.primary : colors.outline;

  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainerHighest }]}>
        <Animated.View style={[styles.progressFill, { backgroundColor: statusColor }, barStyle]} />
      </View>
      <View style={styles.progressFooter}>
        <Text style={[styles.progressPct, { color: statusColor }]}>
          {pct === 100 ? "✓ Complete" : pct === 0 ? "Not started" : `${pct}% complete`}
        </Text>
        <Text style={[styles.progressPct, { color: colors.outline }]}>{pct}%</Text>
      </View>
    </View>
  );
}

// ── Goal card ──────────────────────────────────────────────────────────────────
function GoalCard({ goal }: { goal: Goal }) {
  const colors = useColors();

  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      style={[styles.goalCard, { backgroundColor: colors.card }]}
    >
      <View style={[styles.goalCardAccent, { backgroundColor: colors.primary }]} />
      <View style={styles.goalCardInner}>
        {/* Type badge */}
        <View style={[styles.typeBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
          <MaterialIcons
            name={goal.type === "daily" ? "repeat" : "event"}
            size={12}
            color={colors.outline}
          />
          <Text style={[styles.typeBadgeText, { color: colors.outline }]}>
            {goal.type === "daily" ? "DAILY" : "SCHEDULED"}
          </Text>
        </View>

        {/* Name */}
        <Text style={[styles.goalName, { color: colors.onSurface }]}>{goal.name}</Text>

        {/* Intent */}
        <Text style={[styles.goalIntent, { color: colors.outline }]}>{goal.intent}</Text>

        {/* Time window */}
        <View style={[styles.timeChip, { backgroundColor: colors.surfaceContainerHigh }]}>
          <MaterialIcons name="schedule" size={15} color={colors.onSurface} />
          <Text style={[styles.timeChipText, { color: colors.onSurface }]}>
            {goal.type === "daily"
              ? `${goal.activeFrom} – ${goal.activeTo}`
              : goal.scheduledDate
                ? `${goal.scheduledDate}  ·  ${goal.scheduledTime}`
                : "No schedule set"}
          </Text>
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.surfaceContainerHigh }]} />

        {/* Progress */}
        <View style={styles.progressSection}>
          <Text style={[styles.progressLabel, { color: colors.outline }]}>TODAY'S PROGRESS</Text>
          <GoalProgressBar progress={goal.progress} delay={120} />
        </View>
      </View>
    </Animated.View>
  );
}

// ── Add Goal modal ─────────────────────────────────────────────────────────────
function AddGoalModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (goal: Goal) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [name,          setName]          = useState("");
  const [intent,        setIntent]        = useState("");
  const [type,          setType]          = useState<GoalType>("daily");
  const [activeFrom,    setActiveFrom]    = useState("9:00 AM");
  const [activeTo,      setActiveTo]      = useState("10:00 AM");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("9:00 AM");

  const reset = () => {
    setName(""); setIntent(""); setType("daily");
    setActiveFrom("9:00 AM"); setActiveTo("10:00 AM");
    setScheduledDate(""); setScheduledTime("9:00 AM");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = () => {
    if (!name.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({
      id: Date.now().toString(),
      name: name.trim(),
      intent: intent.trim(),
      type,
      activeFrom,
      activeTo,
      scheduledDate,
      scheduledTime,
      progress: 0,
    });
    reset();
    onClose();
  };

  const canSave = name.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalKAV}
      >
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 },
          ]}
        >
          <View style={[styles.modalHandle, { backgroundColor: colors.surfaceContainerHighest }]} />

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Add Goal</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={12}>
              <MaterialIcons name="close" size={22} color={colors.outline} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Goal Name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.outline }]}>GOAL NAME</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface }]}
                placeholder="e.g. Deep Work"
                placeholderTextColor={colors.outline}
                value={name}
                onChangeText={setName}
                returnKeyType="next"
              />
            </View>

            {/* Intent */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.outline }]}>INTENT</Text>
              <TextInput
                style={[styles.textInput, styles.textInputMulti, { backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface }]}
                placeholder="What's the purpose of this goal?"
                placeholderTextColor={colors.outline}
                value={intent}
                onChangeText={setIntent}
                multiline
                returnKeyType="next"
                textAlignVertical="top"
              />
            </View>

            {/* Type toggle */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.outline }]}>TYPE</Text>
              <View style={[styles.typeToggle, { backgroundColor: colors.surfaceContainerHigh }]}>
                <TouchableOpacity
                  style={[styles.typeBtn, type === "daily" && { backgroundColor: colors.primary }]}
                  onPress={() => { Haptics.selectionAsync(); setType("daily"); }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="repeat" size={14} color={type === "daily" ? "#fff" : colors.outline} />
                  <Text style={[styles.typeBtnText, { color: type === "daily" ? "#fff" : colors.outline }]}>Daily</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, type === "scheduled" && { backgroundColor: colors.primary }]}
                  onPress={() => { Haptics.selectionAsync(); setType("scheduled"); }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="event" size={14} color={type === "scheduled" ? "#fff" : colors.outline} />
                  <Text style={[styles.typeBtnText, { color: type === "scheduled" ? "#fff" : colors.outline }]}>Scheduled</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Daily: from / to */}
            {type === "daily" && (
              <View style={styles.timeFieldRow}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.outline }]}>ACTIVE FROM</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface }]}
                    placeholder="9:00 AM"
                    placeholderTextColor={colors.outline}
                    value={activeFrom}
                    onChangeText={setActiveFrom}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.outline }]}>ACTIVE TO</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface }]}
                    placeholder="11:00 AM"
                    placeholderTextColor={colors.outline}
                    value={activeTo}
                    onChangeText={setActiveTo}
                  />
                </View>
              </View>
            )}

            {/* Scheduled: date + time */}
            {type === "scheduled" && (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.outline }]}>DATE</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface }]}
                    placeholder="e.g. Dec 25, 2025"
                    placeholderTextColor={colors.outline}
                    value={scheduledDate}
                    onChangeText={setScheduledDate}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.outline }]}>TIME</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface }]}
                    placeholder="9:00 AM"
                    placeholderTextColor={colors.outline}
                    value={scheduledTime}
                    onChangeText={setScheduledTime}
                  />
                </View>
              </>
            )}
          </ScrollView>

          {/* Save */}
          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: canSave ? colors.primary : colors.surfaceContainerHigh },
            ]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.85}
          >
            <MaterialIcons name="check" size={20} color={canSave ? "#fff" : colors.outline} />
            <Text style={[styles.saveBtnText, { color: canSave ? "#fff" : colors.outline }]}>
              Save Goal
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function GoalsScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const topPad  = isWeb ? 67 : insets.top;
  const tabBarH = isWeb ? 84 : 62 + insets.bottom;

  const [goals,      setGoals]      = useState<Goal[]>(DEFAULT_GOALS);
  const [activeIdx,  setActiveIdx]  = useState(0);
  const [showModal,  setShowModal]  = useState(false);

  const activeGoal = goals[activeIdx] || goals[0];

  const handleAddGoal = (goal: Goal) => {
    setGoals((prev) => [...prev, goal]);
    setActiveIdx(goals.length);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 12, paddingBottom: tabBarH + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(0).springify()}>
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>GOALS</Text>
        </Animated.View>

        {/* Goal tab pills */}
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(50).springify()}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
          >
            {goals.map((g, i) => (
              <TouchableOpacity
                key={g.id}
                style={[
                  styles.tabPill,
                  { backgroundColor: activeIdx === i ? colors.primary : colors.card },
                ]}
                onPress={() => { Haptics.selectionAsync(); setActiveIdx(i); }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabPillText,
                    { color: activeIdx === i ? "#fff" : colors.outline },
                  ]}
                >
                  {g.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Goal card — key triggers re-enter animation on tab change */}
        {activeGoal && <GoalCard key={activeGoal.id} goal={activeGoal} />}

        {/* All goals summary strip */}
        {goals.length > 1 && (
          <Animated.View
            entering={isWeb ? undefined : FadeInDown.delay(200).springify()}
            style={[styles.summaryCard, { backgroundColor: colors.card }]}
          >
            <Text style={[styles.summaryTitle, { color: colors.outline }]}>ALL GOALS</Text>
            {goals.map((g, i) => {
              const pct = Math.round(g.progress * 100);
              return (
                <TouchableOpacity
                  key={g.id}
                  style={[
                    styles.summaryRow,
                    i < goals.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerHigh },
                  ]}
                  onPress={() => { Haptics.selectionAsync(); setActiveIdx(i); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.summaryLeft}>
                    <Text style={[styles.summaryName, { color: colors.onSurface }]}>{g.name}</Text>
                    <Text style={[styles.summaryTime, { color: colors.outline }]}>
                      {g.type === "daily" ? `${g.activeFrom} – ${g.activeTo}` : g.scheduledDate || "Scheduled"}
                    </Text>
                  </View>
                  <Text style={[styles.summaryPct, { color: pct === 100 ? "#16a34a" : colors.outline }]}>
                    {pct}%
                  </Text>
                  <MaterialIcons name="chevron-right" size={18} color={colors.outlineVariant} />
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        )}
      </ScrollView>

      {/* Floating "Add Goal" button */}
      <View style={[styles.floatingBtn, { bottom: tabBarH + 16 }]}>
        <TouchableOpacity
          style={[styles.addGoalBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowModal(true);
          }}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add" size={22} color="#fff" />
          <Text style={styles.addGoalBtnText}>Add Goal</Text>
        </TouchableOpacity>
      </View>

      <AddGoalModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleAddGoal}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:  { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },

  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },

  // Tab pills
  tabsContent: { gap: 8, paddingRight: 4 },
  tabPill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  tabPillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Goal card
  goalCard: {
    borderRadius: 24,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 2,
  },
  goalCardAccent: { width: 5 },
  goalCardInner:  { flex: 1, padding: 20, gap: 14 },

  typeBadge:     { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, alignSelf: "flex-start" },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },

  goalName:   { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5, lineHeight: 36 },
  goalIntent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },

  timeChip:     { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, alignSelf: "flex-start" },
  timeChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  divider: { height: 1, marginVertical: 2 },

  progressSection: { gap: 10 },
  progressLabel:   { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  progressTrack:   { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill:    { height: "100%", borderRadius: 4 },
  progressFooter:  { flexDirection: "row", justifyContent: "space-between" },
  progressPct:     { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Summary strip
  summaryCard:  { borderRadius: 24, padding: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 },
  summaryTitle: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5, marginBottom: 12 },
  summaryRow:   { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 8 },
  summaryLeft:  { flex: 1 },
  summaryName:  { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  summaryTime:  { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  summaryPct:   { fontSize: 12, fontFamily: "Inter_700Bold", minWidth: 36, textAlign: "right" },

  // Floating button
  floatingBtn:   { position: "absolute", left: 20, right: 20 },
  addGoalBtn:    { height: 56, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8 },
  addGoalBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  modalKAV:     { justifyContent: "flex-end" },
  modalSheet:   { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 16, maxHeight: "88%" },
  modalHandle:  { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle:   { fontSize: 20, fontFamily: "Inter_700Bold" },

  fieldGroup:      { marginBottom: 16 },
  fieldLabel:      { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5, marginBottom: 8 },
  textInput:       { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, fontFamily: "Inter_400Regular" },
  textInputMulti:  { minHeight: 80, paddingTop: 13 },
  timeFieldRow:    { flexDirection: "row", gap: 12 },

  typeToggle:  { flexDirection: "row", borderRadius: 14, padding: 4, gap: 4 },
  typeBtn:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  typeBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  saveBtn:     { height: 56, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
