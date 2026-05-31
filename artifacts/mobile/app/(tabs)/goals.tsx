import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb    = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;
const FAB_SIZE  = 56;
const FAB_RIGHT = 20;
const THRESHOLD = 60;

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

// ── Drum picker constants ───────────────────────────────────────────────────────
const HOURS   = ["1","2","3","4","5","6","7","8","9","10","11","12"];
const MINUTES = ["00","30"];
const PERIODS = ["AM","PM"];
const ITEM_H  = 46;

// ── DrumColumn ─────────────────────────────────────────────────────────────────
function DrumColumn({ items, selected, onSelect, width = 54 }: {
  items: string[]; selected: string; onSelect: (v: string) => void; width?: number;
}) {
  const colors    = useColors();
  const scrollRef = useRef<Animated.ScrollView>(null);

  useEffect(() => {
    const idx = items.indexOf(selected);
    if (idx >= 0) setTimeout(() => (scrollRef.current as any)?.scrollTo({ y: idx * ITEM_H, animated: false }), 50);
  }, []);

  const handleEnd = useCallback((e: any) => {
    const idx     = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    Haptics.selectionAsync();
    onSelect(items[clamped]);
  }, [items, onSelect]);

  return (
    <View style={{ width, height: ITEM_H * 3, overflow: "hidden" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute", top: ITEM_H, left: 6, right: 6, height: ITEM_H,
          borderTopWidth: 1, borderBottomWidth: 1,
          borderColor: colors.outline + "40", borderRadius: 8,
        }}
      />
      <Animated.ScrollView
        ref={scrollRef as any}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: ITEM_H }}
        onMomentumScrollEnd={handleEnd}
        onScrollEndDrag={handleEnd}
      >
        {items.map((item, i) => {
          const isSel = item === selected;
          return (
            <TouchableOpacity
              key={i}
              style={{ height: ITEM_H, alignItems: "center", justifyContent: "center" }}
              onPress={() => {
                (scrollRef.current as any)?.scrollTo({ y: i * ITEM_H, animated: true });
                Haptics.selectionAsync();
                onSelect(item);
              }}
              activeOpacity={0.6}
            >
              <Text style={{
                fontSize: isSel ? 18 : 14,
                fontFamily: isSel ? "Inter_700Bold" : "Inter_400Regular",
                color: isSel ? colors.onSurface : colors.outline,
                opacity: isSel ? 1 : 0.45,
              }}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

// ── DrumTimePicker ─────────────────────────────────────────────────────────────
function DrumTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colors  = useColors();
  const parsed  = value.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  const [hour,   setHour]   = useState(parsed ? parsed[1] : "9");
  const [minute, setMinute] = useState(parsed ? parsed[2] : "00");
  const [period, setPeriod] = useState(parsed ? parsed[3].toUpperCase() : "AM");

  useEffect(() => { onChange(`${hour}:${minute} ${period}`); }, [hour, minute, period]);

  return (
    <View style={[styles.drumContainer, { backgroundColor: colors.surfaceContainerHigh }]}>
      <DrumColumn items={HOURS}   selected={hour}   onSelect={setHour}   width={54} />
      <Text style={[styles.drumColon, { color: colors.outline }]}>:</Text>
      <DrumColumn items={MINUTES} selected={minute} onSelect={setMinute} width={46} />
      <View style={{ width: 14 }} />
      <DrumColumn items={PERIODS} selected={period} onSelect={setPeriod} width={50} />
    </View>
  );
}

// ── Goal card ─────────────────────────────────────────────────────────────────
function GoalCard({ goal, delay = 0, onDelete }: { goal: Goal; delay?: number; onDelete: () => void }) {
  const colors = useColors();
  return (
    <Animated.View
      entering={isWeb ? undefined : FadeInDown.delay(delay).springify()}
      exiting={isWeb ? undefined : FadeOut.duration(240)}
      layout={isWeb ? undefined : LinearTransition.springify()}
      style={[styles.goalCard, { backgroundColor: colors.card }]}
    >
      <View style={[styles.goalCardAccent, { backgroundColor: colors.primary }]} />
      <View style={styles.goalCardInner}>
        {/* Delete button */}
        <TouchableOpacity
          style={[styles.deleteBtn, { backgroundColor: colors.surfaceContainerHigh }]}
          onPress={onDelete}
          hitSlop={8}
        >
          <MaterialIcons name="delete-outline" size={16} color="#ef4444" />
        </TouchableOpacity>

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

        <Text style={[styles.goalName,   { color: colors.onSurface }]}>{goal.name}</Text>
        <Text style={[styles.goalIntent, { color: colors.outline }]}>{goal.intent}</Text>

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
      </View>
    </Animated.View>
  );
}

// ── Add Goal modal ─────────────────────────────────────────────────────────────
function AddGoalModal({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void; onSave: (goal: Goal) => void;
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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKAV}>
        <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
          <View style={[styles.modalHandle, { backgroundColor: colors.surfaceContainerHighest }]} />

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Add Goal</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={12}>
              <MaterialIcons name="close" size={22} color={colors.outline} />
            </TouchableOpacity>
          </View>

          <Animated.ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

            {type === "daily" && (
              <View style={styles.drumFieldRow}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.outline }]}>ACTIVE FROM</Text>
                  <DrumTimePicker value={activeFrom} onChange={setActiveFrom} />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.outline }]}>ACTIVE TO</Text>
                  <DrumTimePicker value={activeTo} onChange={setActiveTo} />
                </View>
              </View>
            )}

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
                  <DrumTimePicker value={scheduledTime} onChange={setScheduledTime} />
                </View>
              </>
            )}
          </Animated.ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: canSave ? colors.primary : colors.surfaceContainerHigh }]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.85}
          >
            <MaterialIcons name="check" size={20} color={canSave ? "#fff" : colors.outline} />
            <Text style={[styles.saveBtnText, { color: canSave ? "#fff" : colors.outline }]}>Save Goal</Text>
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

  const [goals,     setGoals]     = useState<Goal[]>(DEFAULT_GOALS);
  const [showModal, setShowModal] = useState(false);

  const scrollY       = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });

  // Scroll-reactive FAB: at top → circle (right=20, width=56); scrolled → full pill (left=20, right=20)
  const fabContainerStyle = useAnimatedStyle(() => ({
    left: withSpring(
      scrollY.value > THRESHOLD ? 20 : SCREEN_W - FAB_SIZE - FAB_RIGHT,
      { damping: 18, stiffness: 90 }
    ),
  }));

  const fabLabelStyle = useAnimatedStyle(() => ({
    opacity:  withSpring(scrollY.value > THRESHOLD ? 1 : 0, { damping: 18, stiffness: 90 }),
    maxWidth: withSpring(scrollY.value > THRESHOLD ? 120 : 0, { damping: 18, stiffness: 90 }),
    overflow: "hidden" as const,
  }));

  const handleDeleteGoal = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const handleAddGoal = (goal: Goal) => {
    setGoals((prev) => [...prev, goal]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AnimatedBackground />

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 12, paddingBottom: tabBarH + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(0).springify()}>
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>GOALS</Text>
        </Animated.View>

        {goals.map((g, i) => (
          <GoalCard
            key={g.id}
            goal={g}
            delay={60 + i * 80}
            onDelete={() => handleDeleteGoal(g.id)}
          />
        ))}
      </Animated.ScrollView>

      {/* Scroll-reactive Add Goal button */}
      <Animated.View style={[styles.floatingBtn, { bottom: tabBarH + 16, right: FAB_RIGHT }, fabContainerStyle]}>
        <TouchableOpacity
          style={[styles.addGoalBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowModal(true);
          }}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add" size={22} color="#fff" />
          <Animated.View style={fabLabelStyle}>
            <Text style={styles.addGoalBtnText} numberOfLines={1}>Add Goal</Text>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

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
  root:   { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 16 },

  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },

  // Goal card
  goalCard: {
    borderRadius: 24, flexDirection: "row", overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 20, elevation: 2,
  },
  goalCardAccent: { width: 5 },
  goalCardInner:  { flex: 1, padding: 20, gap: 12 },

  deleteBtn: { position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },

  typeBadge:     { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, alignSelf: "flex-start" },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },

  goalName:   { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  goalIntent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },

  timeChip:     { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, alignSelf: "flex-start" },
  timeChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Drum picker
  drumContainer: { flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 10 },
  drumColon:     { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 2 },

  // Floating button
  floatingBtn: { position: "absolute", right: FAB_RIGHT, height: FAB_SIZE },
  addGoalBtn:  { flex: 1, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8 },
  addGoalBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  modalKAV:     { justifyContent: "flex-end" },
  modalSheet:   { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 16, maxHeight: "92%" },
  modalHandle:  { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle:   { fontSize: 20, fontFamily: "Inter_700Bold" },

  fieldGroup:     { marginBottom: 16 },
  fieldLabel:     { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5, marginBottom: 8 },
  textInput:      { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, fontFamily: "Inter_400Regular" },
  textInputMulti: { minHeight: 72, paddingTop: 13 },
  drumFieldRow:   { flexDirection: "row", gap: 12 },

  typeToggle:  { flexDirection: "row", borderRadius: 14, padding: 4, gap: 4 },
  typeBtn:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  typeBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  saveBtn:     { height: 56, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
