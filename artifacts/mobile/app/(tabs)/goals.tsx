import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { MaterialIcons } from "@expo/vector-icons";
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
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  LinearTransition,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { useColors } from "@/hooks/useColors";

const isWeb    = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;
const SCREEN_H = Dimensions.get("window").height;
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
    name: "Finish project proposal",
    intent: "Review the final budget allocations and ensure the timeline matches the engineering roadmap for Q4.",
    type: "daily",
    activeFrom: "10:00 AM",
    activeTo: "11:30 AM",
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

// ── Drum picker constants ──────────────────────────────────────────────────────
const HOURS_12 = ["1","2","3","4","5","6","7","8","9","10","11","12"];
const MINUTES  = ["00","05","10","15","20","25","30","35","40","45","50","55"];
const PERIODS  = ["AM","PM"];
const DUR_HRS  = ["0","1","2","3","4","5","6","7","8"];
const DUR_MINS = ["00","15","30","45"];
const ITEM_H   = 46;

// ── DrumColumn ─────────────────────────────────────────────────────────────────
function DrumColumn({ items, selected, onSelect, width = 54 }: {
  items: string[]; selected: string; onSelect: (v: string) => void; width?: number;
}) {
  const scrollRef = useRef<Animated.ScrollView>(null);

  useEffect(() => {
    const idx = items.indexOf(selected);
    if (idx >= 0) setTimeout(() => (scrollRef.current as any)?.scrollTo({ y: idx * ITEM_H, animated: false }), 60);
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
          position: "absolute", top: ITEM_H, left: 4, right: 4, height: ITEM_H,
          borderTopWidth: 1, borderBottomWidth: 1,
          borderColor: "rgba(0,0,0,0.12)", borderRadius: 8,
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
                color: isSel ? "#000" : "#aaa",
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

// ── Inline drum time picker ────────────────────────────────────────────────────
function DrumTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed  = value.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  const [hour,   setHour]   = useState(parsed ? parsed[1] : "10");
  const [minute, setMinute] = useState(parsed ? parsed[2] : "00");
  const [period, setPeriod] = useState(parsed ? parsed[3].toUpperCase() : "AM");
  useEffect(() => { onChange(`${hour}:${minute} ${period}`); }, [hour, minute, period]);
  return (
    <View style={styles.drumContainer}>
      <DrumColumn items={HOURS_12} selected={hour}   onSelect={setHour}   width={52} />
      <Text style={styles.drumColon}>:</Text>
      <DrumColumn items={MINUTES}  selected={minute} onSelect={setMinute} width={44} />
      <View style={{ width: 12 }} />
      <DrumColumn items={PERIODS}  selected={period} onSelect={setPeriod} width={48} />
    </View>
  );
}

// ── Inline drum duration picker ────────────────────────────────────────────────
function DrumDurationPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = value.match(/^(\d+)h\s*(\d+)m$/);
  const [hrs,  setHrs]  = useState(parsed ? parsed[1] : "1");
  const [mins, setMins] = useState(parsed ? parsed[2] : "30");
  useEffect(() => { onChange(`${hrs}h ${mins}m`); }, [hrs, mins]);
  return (
    <View style={styles.drumContainer}>
      <DrumColumn items={DUR_HRS}  selected={hrs}  onSelect={setHrs}  width={52} />
      <Text style={[styles.drumColon, { fontSize: 13, color: "#777" }]}>hr</Text>
      <View style={{ width: 10 }} />
      <DrumColumn items={DUR_MINS} selected={mins} onSelect={setMins} width={44} />
      <Text style={[styles.drumColon, { fontSize: 13, color: "#777" }]}>min</Text>
    </View>
  );
}

// helper: parse "1h 30m" → "1.5 Hours"
function durLabel(raw: string) {
  const m = raw.match(/^(\d+)h\s*(\d+)m$/);
  if (!m) return raw;
  const h = parseInt(m[1]), mn = parseInt(m[2]);
  if (mn === 0) return `${h} Hour${h !== 1 ? "s" : ""}`;
  return `${h + mn / 60} Hours`;
}

// ── AddTaskModal ───────────────────────────────────────────────────────────────
function AddTaskModal({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void; onSave: (goal: Goal) => void;
}) {
  const insets = useSafeAreaInsets();

  const [name,      setName]      = useState("");
  const [duration,  setDuration]  = useState("1h 30m");
  const [startTime, setStartTime] = useState("10:00 AM");
  const [showDrumDur,  setShowDrumDur]  = useState(false);
  const [showDrumTime, setShowDrumTime] = useState(false);

  const scale   = useSharedValue(0.88);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value   = withSpring(1,   { damping: 18, stiffness: 180 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      scale.value   = withSpring(0.88, { damping: 18, stiffness: 180 });
      opacity.value = withTiming(0, { duration: 140 });
    }
  }, [visible]);

  const modalAnim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const reset = () => {
    setName(""); setDuration("1h 30m"); setStartTime("10:00 AM");
    setShowDrumDur(false); setShowDrumTime(false);
  };
  const handleClose = () => { reset(); onClose(); };
  const handleSave  = () => {
    if (!name.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({
      id: Date.now().toString(),
      name: name.trim(),
      intent: "",
      type: "daily",
      activeFrom: startTime,
      activeTo: startTime,
      scheduledDate: "",
      scheduledTime: "",
      progress: 0,
    });
    reset(); onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={StyleSheet.absoluteFill}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        </View>
      </TouchableWithoutFeedback>

      <View style={styles.addModalCentered} pointerEvents="box-none">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} pointerEvents="box-none">
          <Animated.View style={[styles.addModalCard, modalAnim]}>

            {/* Close button */}
            <TouchableOpacity style={styles.addModalClose} onPress={handleClose} hitSlop={12}>
              <MaterialIcons name="close" size={20} color="#000" />
            </TouchableOpacity>

            {/* Title */}
            <Text style={styles.addModalTitle}>ADD NEW TASK</Text>
            <Text style={styles.addModalSub}>ARCHITECT YOUR DAY</Text>

            {/* Task Identification */}
            <Text style={styles.formLabel}>TASK IDENTIFICATION</Text>
            <TextInput
              style={styles.addModalInput}
              placeholder="What needs attention?"
              placeholderTextColor="#b0b0b0"
              value={name}
              onChangeText={setName}
              returnKeyType="done"
            />

            {/* Scheduling Window */}
            <View style={styles.schedRow}>
              <Text style={styles.formLabel}>SCHEDULING WINDOW</Text>
              <Text style={styles.priorityBadge}>PRIORITY HIGH</Text>
            </View>

            <View style={styles.schedCols}>
              {/* Duration */}
              <View style={{ flex: 1 }}>
                <Text style={styles.schedColLabel}>DURATION</Text>
                <TouchableOpacity
                  style={styles.schedPill}
                  activeOpacity={0.75}
                  onPress={() => { Haptics.selectionAsync(); setShowDrumDur(v => !v); setShowDrumTime(false); }}
                >
                  <Text style={styles.schedPillText}>{durLabel(duration)}</Text>
                </TouchableOpacity>
              </View>
              {/* Start Time */}
              <View style={{ flex: 1 }}>
                <Text style={styles.schedColLabel}>START TIME</Text>
                <TouchableOpacity
                  style={styles.schedPill}
                  activeOpacity={0.75}
                  onPress={() => { Haptics.selectionAsync(); setShowDrumTime(v => !v); setShowDrumDur(false); }}
                >
                  <Text style={styles.schedPillText}>{startTime}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Inline drum pickers */}
            {showDrumDur && (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.drumBox}>
                <DrumDurationPicker value={duration} onChange={setDuration} />
              </Animated.View>
            )}
            {showDrumTime && (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.drumBox}>
                <DrumTimePicker value={startTime} onChange={setStartTime} />
              </Animated.View>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.commitBtn, !name.trim() && { opacity: 0.45 }]}
              onPress={handleSave}
              disabled={!name.trim()}
              activeOpacity={0.85}
            >
              <Text style={styles.commitBtnText}>COMMIT TASK</Text>
            </TouchableOpacity>

          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Goal Detail Bottom Sheet ───────────────────────────────────────────────────
function GoalDetailSheet({ goal, onClose, onDone }: {
  goal: Goal | null; onClose: () => void; onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SCREEN_H);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    if (goal) {
      translateY.value = withSpring(0,          { damping: 22, stiffness: 200 });
      opacity.value    = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withSpring(SCREEN_H,   { damping: 22, stiffness: 200 });
      opacity.value    = withTiming(0, { duration: 180 });
    }
  }, [goal]);

  const sheetAnim   = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const overlayAnim = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!goal) return null;

  const timeStr = goal.type === "daily"
    ? `${goal.activeFrom} - ${goal.activeTo}`
    : goal.scheduledDate ? `${goal.scheduledDate} · ${goal.scheduledTime}` : "No schedule set";

  const durStr = "1.5 Hours";

  return (
    <Modal visible={!!goal} transparent animationType="none" onRequestClose={onClose}>
      {/* Blur backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, overlayAnim]}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <Animated.View style={[styles.detailSheet, { paddingBottom: insets.bottom + 20 }, sheetAnim]}>
        {/* Drag handle */}
        <View style={styles.dragHandle} />

        {/* CURRENT FOCUS label */}
        <Text style={styles.detailFocusLabel}>CURRENT FOCUS</Text>

        {/* Goal title */}
        <Text style={styles.detailTitle}>{goal.name}</Text>

        {/* Time row */}
        <View style={styles.detailTimeRow}>
          <MaterialIcons name="schedule" size={16} color="#555" />
          <Text style={styles.detailTimeText}>{timeStr}</Text>
        </View>

        {/* Duration + Priority cards */}
        <View style={styles.detailCards}>
          <View style={styles.detailInfoCard}>
            <Text style={styles.detailCardLabel}>DURATION</Text>
            <Text style={styles.detailCardValue}>{durStr}</Text>
          </View>
          <View style={styles.detailInfoCard}>
            <Text style={styles.detailCardLabel}>PRIORITY</Text>
            <Text style={styles.detailCardValue}>Critical</Text>
          </View>
        </View>

        {/* Notes card */}
        {!!goal.intent && (
          <View style={styles.detailNotesCard}>
            <MaterialIcons name="menu" size={20} color="#999" style={{ marginTop: 2 }} />
            <Text style={styles.detailNotesText}>{goal.intent}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.detailActions}>
          <TouchableOpacity
            style={styles.doneBtn}
            activeOpacity={0.85}
            onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onDone(); }}
          >
            <Text style={styles.doneBtnText}>DONE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rescheduleBtn}
            activeOpacity={0.85}
            onPress={() => { Haptics.selectionAsync(); onClose(); }}
          >
            <Text style={styles.rescheduleBtnText}>RESCHEDULE</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ── Goal card ──────────────────────────────────────────────────────────────────
function GoalCard({ goal, delay = 0, onDelete, onPress }: {
  goal: Goal; delay?: number; onDelete: () => void; onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Animated.View
      entering={isWeb ? undefined : FadeInDown.delay(delay).springify()}
      exiting={isWeb ? undefined : FadeOut.duration(240)}
      layout={isWeb ? undefined : LinearTransition.springify()}
      style={[styles.goalCard, { backgroundColor: colors.card }]}
    >
      <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={{ flex: 1, flexDirection: "row" }}>
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
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function GoalsScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const topPad  = isWeb ? 67 : insets.top;
  const tabBarH = isWeb ? 84 : 62 + insets.bottom;

  const [goals,       setGoals]       = useState<Goal[]>(DEFAULT_GOALS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [detailGoal,  setDetailGoal]  = useState<Goal | null>(null);

  const scrollY       = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });

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

  const handleAddGoal = (goal: Goal) => setGoals((prev) => [...prev, goal]);

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
            onPress={() => {
              Haptics.selectionAsync();
              setDetailGoal(g);
            }}
          />
        ))}
      </Animated.ScrollView>

      {/* FAB */}
      <Animated.View style={[styles.floatingBtn, { bottom: tabBarH + 16, right: FAB_RIGHT }, fabContainerStyle]}>
        <TouchableOpacity
          style={[styles.addGoalBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowAddModal(true);
          }}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add" size={22} color="#fff" />
          <Animated.View style={fabLabelStyle}>
            <Text style={styles.addGoalBtnText} numberOfLines={1}>Add Goal</Text>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

      {/* Modal 1 — Add New Task */}
      <AddTaskModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddGoal}
      />

      {/* Modal 2 — Goal Detail Sheet */}
      <GoalDetailSheet
        goal={detailGoal}
        onClose={() => setDetailGoal(null)}
        onDone={() => setDetailGoal(null)}
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
  goalCard:       { borderRadius: 24, flexDirection: "row", overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 20, elevation: 2 },
  goalCardAccent: { width: 5 },
  goalCardInner:  { flex: 1, padding: 20, gap: 12 },
  deleteBtn:      { position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  typeBadge:      { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, alignSelf: "flex-start" },
  typeBadgeText:  { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  goalName:       { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  goalIntent:     { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  timeChip:       { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, alignSelf: "flex-start" },
  timeChipText:   { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Drum picker
  drumContainer: { flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 8, backgroundColor: "#f0f0f0" },
  drumColon:     { fontSize: 22, fontFamily: "Inter_700Bold", color: "#555", marginBottom: 2 },

  // FAB
  floatingBtn:    { position: "absolute", right: FAB_RIGHT, height: FAB_SIZE },
  addGoalBtn:     { flex: 1, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8 },
  addGoalBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  // ── Add Task Modal ──
  addModalCentered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  addModalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 28,
    gap: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 40,
    elevation: 16,
  },
  addModalClose: { position: "absolute", top: 22, right: 22, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  addModalTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: -0.5, marginBottom: 4 },
  addModalSub:   { fontSize: 10, fontFamily: "Inter_700Bold", color: "#aaa", letterSpacing: 3, marginBottom: 24 },

  formLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.8, color: "#333", marginBottom: 10 },

  addModalInput: {
    backgroundColor: "#f0f0f0",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#000",
    marginBottom: 22,
  },

  schedRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  priorityBadge: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#E07B00", letterSpacing: 1.5 },
  schedCols:     { flexDirection: "row", gap: 12, marginBottom: 0 },
  schedColLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.8, color: "#555", marginBottom: 8 },
  schedPill:     {
    backgroundColor: "#f0f0f0",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
  },
  schedPillText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#000" },

  drumBox: { marginTop: 14, borderRadius: 16, overflow: "hidden" },

  commitBtn: {
    marginTop: 22,
    backgroundColor: "#000",
    borderRadius: 999,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  commitBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 2 },

  // ── Goal Detail Sheet ──
  detailSheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 28,
    paddingTop: 14,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 16,
  },
  dragHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "#ddd",
    alignSelf: "center",
    marginBottom: 8,
  },
  detailFocusLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 2 },
  detailTitle:      { fontSize: 30, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: -0.5, lineHeight: 36 },
  detailTimeRow:    { flexDirection: "row", alignItems: "center", gap: 8 },
  detailTimeText:   { fontSize: 14, fontFamily: "Inter_500Medium", color: "#444" },

  detailCards:    { flexDirection: "row", gap: 12 },
  detailInfoCard: {
    flex: 1,
    backgroundColor: "#f2f2f2",
    borderRadius: 18,
    padding: 18,
    gap: 6,
  },
  detailCardLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 2 },
  detailCardValue: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#000" },

  detailNotesCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    backgroundColor: "#f2f2f2",
    borderRadius: 18,
    padding: 18,
  },
  detailNotesText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: "#444", lineHeight: 21 },

  detailActions: { gap: 10 },
  doneBtn: {
    backgroundColor: "#000",
    borderRadius: 999,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 2 },
  rescheduleBtn: {
    borderRadius: 999,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#000",
  },
  rescheduleBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 2 },
});
