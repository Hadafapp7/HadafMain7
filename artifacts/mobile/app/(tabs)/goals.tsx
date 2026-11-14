import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { MaterialIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { router } from "expo-router";

import { useSubscription } from "@/hooks/useSubscription";
import {
  getTopSocialApps,
  notifyGoalAdded,
  syncGoalAutomation,
  useGoalAutomation,
} from "@/lib/goalAutomation";
import { syncGuiltNotifications } from "@/lib/guiltNotifications";
import {
  getPermissionStatus,
  isNativeAppBlockerSupported,
  openAccessibilitySettings,
} from "../../modules/hadaf-native/src";
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBackground from "@/components/AnimatedBackground";
import { HadafInlineLoader } from "@/components/AppLoadingScreen";
import ForfeitModal from "@/components/ForfeitModal";
import KeyboardFloatingPreview from "@/components/KeyboardFloatingPreview";
import { useColors } from "@/hooks/useColors";
import {
  getListGoalsQueryKey,
  type Goal,
  type GoalInput,
  useCreateGoal,
  useDeleteGoal,
  useListGoals,
  useUpdateGoal,
} from "@workspace/api-client-react";

const isWeb    = Platform.OS === "web";
const SCREEN_W = Dimensions.get("window").width;
const SCREEN_H = Dimensions.get("window").height;
const FAB_SIZE  = 56;
const FAB_RIGHT = 20;
const THRESHOLD = 60;
const LOCAL_GOALS_CACHE_KEY = "@hadaf/local_goals_backup_v1";

// ── Types ──────────────────────────────────────────────────────────────────────
type GoalType = Goal["type"];
type Priority = Goal["priority"];
type GoalStatusValue = Goal["status"];

// Local draft shape used while composing the add/edit form (before hitting the API).
interface GoalDraft {
  title: string;
  intent: string;
  type: GoalType;
  priority: Priority;
  startTime: string;
  durationMinutes: number;
  scheduledDate?: string;
  blockApps: boolean;
}

const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};
const PRIORITY_COLOR: Record<Priority, string> = {
  low: "#4b8f4b", medium: "#3b74d1", high: "#E07B00", critical: "#d13b3b",
};

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function defaultStartTime15MinAhead(): string {
  const d = new Date(Date.now() + 20 * 60 * 1000);
  const snappedMin = Math.ceil(d.getMinutes() / 5) * 5;
  if (snappedMin === 60) {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  } else {
    d.setMinutes(snappedMin, 0, 0);
  }
  const h24 = d.getHours();
  const m = d.getMinutes();
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// ── Time helpers ────────────────────────────────────────────────────────────────
function addMinutesToTimeStr(time: string, minutes: number): string {
  const m = time.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return time;
  let hour = parseInt(m[1], 10) % 12;
  const min = parseInt(m[2], 10);
  const isPM = m[3].toUpperCase() === "PM";
  let total = (isPM ? hour + 12 : hour) * 60 + min + minutes;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const outHour24 = Math.floor(total / 60);
  const outMin = total % 60;
  const outPeriod = outHour24 >= 12 ? "PM" : "AM";
  const outHour12 = outHour24 % 12 === 0 ? 12 : outHour24 % 12;
  return `${outHour12}:${String(outMin).padStart(2, "0")} ${outPeriod}`;
}

function durationLabel(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} Min${m !== 1 ? "s" : ""}`;
  if (m === 0) return `${h} Hour${h !== 1 ? "s" : ""}`;
  return `${(h + m / 60).toFixed(1)} Hours`;
}

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
  const [period, setPeriod] = useState(parsed ? parsed[3]?.toUpperCase() ?? "AM" : "AM");
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
function DrumDurationPicker({ minutes, onChange }: { minutes: number; onChange: (v: number) => void }) {
  const hrs0  = String(Math.floor(minutes / 60));
  const mins0 = String(minutes % 60).padStart(2, "0");
  const [hrs,  setHrs]  = useState(DUR_HRS.includes(hrs0) ? hrs0 : "1");
  const [mins, setMins] = useState(DUR_MINS.includes(mins0) ? mins0 : "30");
  useEffect(() => { onChange(parseInt(hrs, 10) * 60 + parseInt(mins, 10)); }, [hrs, mins]);
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

// ── AddTaskModal ───────────────────────────────────────────────────────────────
function AddTaskModal({ visible, onClose, onSave, editingGoal, onUpdate }: {
  visible: boolean;
  onClose: () => void;
  onSave: (draft: GoalDraft) => void;
  editingGoal?: Goal | null;
  onUpdate?: (id: string, draft: GoalDraft) => void;
}) {
  const isEditMode = !!editingGoal;

  const [title,     setTitle]     = useState("");
  const [intent,    setIntent]    = useState("");
  const [goalType,  setGoalType]  = useState<GoalType>("daily");
  const [priority,  setPriority]  = useState<Priority>("medium");
  const [duration,  setDuration]  = useState(90);
  const [startTime, setStartTime] = useState(() => defaultStartTime15MinAhead());
  const [blockApps, setBlockApps] = useState(true);
  const [topSocialApps, setTopSocialApps] = useState<string[]>([
    "Instagram",
    "YouTube",
    "TikTok",
  ]);
  const [showDrumDur,  setShowDrumDur]  = useState(false);
  const [showDrumFrom, setShowDrumFrom] = useState(false);
  const [focusedField, setFocusedField] = useState<"title" | "intent" | null>(null);

  const detailsInputRef = useRef<TextInput>(null);

  const scale   = useSharedValue(0.88);
  const opacity = useSharedValue(0);

  // Load top 3 social media apps by screen time when modal opens
  useEffect(() => {
    if (visible) {
      getTopSocialApps()
        .then((apps) => {
          if (apps.names.length > 0) setTopSocialApps(apps.names.slice(0, 3));
        })
        .catch(() => {});
    }
  }, [visible]);

  // Sync fields when editing goal changes
  useEffect(() => {
    if (editingGoal) {
      setTitle(editingGoal.title);
      setIntent(editingGoal.intent ?? "");
      setGoalType(editingGoal.type);
      setPriority(editingGoal.priority);
      setStartTime(editingGoal.startTime || "10:00 AM");
      setDuration(editingGoal.durationMinutes || 90);
      setBlockApps(editingGoal.blockApps ?? true);
    } else if (visible) {
      setStartTime(defaultStartTime15MinAhead());
      setBlockApps(true);
    }
  }, [editingGoal?.id, visible]);

  useEffect(() => {
    if (visible) {
      scale.value   = withSpring(1,    { damping: 18, stiffness: 180 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      scale.value   = withSpring(0.88, { damping: 18, stiffness: 180 });
      opacity.value = withTiming(0, { duration: 140 });
      setFocusedField(null);
    }
  }, [visible]);

  const modalAnim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const reset = useCallback(() => {
    setTitle("");
    setIntent("");
    setGoalType("daily");
    setPriority("medium");
    setDuration(90);
    setStartTime(defaultStartTime15MinAhead());
    setBlockApps(true);
    setShowDrumDur(false);
    setShowDrumFrom(false);
    setFocusedField(null);
  }, []);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    reset();
    onClose();
  }, [reset, onClose]);

  const handleToggleBlockApps = async (nextVal: boolean) => {
    Haptics.selectionAsync();
    setBlockApps(nextVal);
    if (nextVal && Platform.OS === "android" && isNativeAppBlockerSupported) {
      try {
        const perms = getPermissionStatus();
        if (!perms.hasAccessibilityPermission) {
          Alert.alert(
            "Enable App Blocker",
            "To automatically block your top 3 social media apps when your goal window starts, please enable Hadaf in Accessibility Settings.",
            [
              { text: "Later", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => {
                  openAccessibilitySettings();
                },
              },
            ],
          );
        }
      } catch {}
    }
  };

  const handleSave = () => {
    const trimmedTitle  = title.trim();
    const trimmedIntent = intent.trim();
    if (!trimmedTitle) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Keyboard.dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const draft: GoalDraft = {
      title: trimmedTitle,
      intent: trimmedIntent,
      type: goalType,
      priority,
      startTime,
      durationMinutes: duration,
      scheduledDate:
        goalType === "scheduled"
          ? editingGoal?.scheduledDate || todayDateStr()
          : undefined,
      blockApps,
    };
    if (isEditMode && onUpdate && editingGoal) {
      onUpdate(editingGoal.id, draft);
    } else {
      onSave(draft);
    }
    reset();
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={StyleSheet.absoluteFill}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        </View>
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        style={styles.addModalCentered}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        pointerEvents="box-none"
      >
        <Animated.ScrollView
          style={styles.addModalScroll}
          contentContainerStyle={styles.addModalScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.addModalCard, modalAnim]}>

            {/* Close button */}
            <TouchableOpacity
              style={styles.addModalClose}
              onPress={handleClose}
              hitSlop={12}
              activeOpacity={0.6}
            >
              <MaterialIcons name="close" size={20} color="#000" />
            </TouchableOpacity>

            {/* Title */}
            <Text style={styles.addModalTitle}>
              {isEditMode ? "EDIT TASK" : "ADD NEW TASK"}
            </Text>
            <Text style={styles.addModalSub}>
              {isEditMode ? "UPDATE YOUR COMMITMENT" : "ARCHITECT YOUR DAY"}
            </Text>

            {/* Title field */}
            <Text
              style={[
                styles.formLabel,
                focusedField === "title" && { color: "#000" },
              ]}
            >
              TITLE
            </Text>
            <TextInput
              style={[
                styles.addModalInput,
                focusedField === "title" && styles.addModalInputFocused,
              ]}
              placeholder="What needs attention?"
              placeholderTextColor="#b0b0b0"
              value={title}
              onFocus={() => setFocusedField("title")}
              onChangeText={setTitle}
              onBlur={() => {
                setTitle((t) => t.trim());
                setFocusedField((prev) => (prev === "title" ? null : prev));
              }}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                if (detailsInputRef.current) {
                  detailsInputRef.current.focus();
                } else if (title.trim()) {
                  handleSave();
                }
              }}
            />

            {/* Details field */}
            <Text
              style={[
                styles.formLabel,
                focusedField === "intent" && { color: "#000" },
              ]}
            >
              DETAILS
            </Text>
            <TextInput
              ref={detailsInputRef}
              style={[
                styles.addModalInput,
                styles.addModalTextArea,
                focusedField === "intent" && styles.addModalInputFocused,
              ]}
              placeholder="Add notes or context (press Enter to commit)"
              placeholderTextColor="#b0b0b0"
              value={intent}
              onFocus={() => setFocusedField("intent")}
              onChangeText={setIntent}
              onBlur={() => {
                setIntent((t) => t.trim());
                setFocusedField((prev) => (prev === "intent" ? null : prev));
              }}
              multiline
              numberOfLines={3}
              blurOnSubmit={true}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (title.trim()) {
                  handleSave();
                }
              }}
            />

            {/* Type toggle */}
            <Text style={[styles.formLabel, { marginBottom: 10 }]}>TASK TYPE</Text>
            <View style={styles.typeToggleRow}>
              <TouchableOpacity
                style={[styles.typeToggleBtn, goalType === "daily" && styles.typeToggleBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setGoalType("daily"); }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="repeat" size={14} color={goalType === "daily" ? "#fff" : "#555"} />
                <Text style={[styles.typeToggleBtnText, goalType === "daily" && styles.typeToggleBtnTextActive]}>Daily</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeToggleBtn, goalType === "scheduled" && styles.typeToggleBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setGoalType("scheduled"); }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="event" size={14} color={goalType === "scheduled" ? "#fff" : "#555"} />
                <Text style={[styles.typeToggleBtnText, goalType === "scheduled" && styles.typeToggleBtnTextActive]}>Scheduled</Text>
              </TouchableOpacity>
            </View>

            {/* Priority selector */}
            <Text style={[styles.formLabel, { marginBottom: 10 }]}>PRIORITY</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityChip,
                    priority === p && { backgroundColor: PRIORITY_COLOR[p], borderColor: PRIORITY_COLOR[p] },
                  ]}
                  onPress={() => { Haptics.selectionAsync(); setPriority(p); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.priorityChipText, priority === p && { color: "#fff" }]}>
                    {PRIORITY_LABEL[p]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Scheduling Window */}
            <Text style={[styles.formLabel, { marginTop: 4 }]}>SCHEDULING WINDOW</Text>

            <View style={styles.schedCols}>
              {/* Start Time */}
              <View style={{ flex: 1 }}>
                <Text style={styles.schedColLabel}>START TIME</Text>
                <TouchableOpacity
                  style={styles.schedPill}
                  activeOpacity={0.75}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowDrumFrom(v => !v);
                    setShowDrumDur(false);
                  }}
                >
                  <Text style={styles.schedPillText}>{startTime}</Text>
                </TouchableOpacity>
              </View>
              {/* Duration */}
              <View style={{ flex: 1 }}>
                <Text style={styles.schedColLabel}>DURATION</Text>
                <TouchableOpacity
                  style={styles.schedPill}
                  activeOpacity={0.75}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowDrumDur(v => !v);
                    setShowDrumFrom(false);
                  }}
                >
                  <Text style={styles.schedPillText}>{durationLabel(duration)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Inline drum pickers */}
            {showDrumDur && (
              <Animated.View style={styles.drumBox}>
                <DrumDurationPicker minutes={duration} onChange={setDuration} />
              </Animated.View>
            )}
            {showDrumFrom && (
              <Animated.View style={styles.drumBox}>
                <DrumTimePicker value={startTime} onChange={setStartTime} />
              </Animated.View>
            )}

            {/* Block Top 3 Social Media Apps Toggle (like Focus Session) */}
            <View style={styles.blockAppsCard}>
              <View style={styles.blockAppsHeader}>
                <View style={styles.blockAppsIconWrap}>
                  <MaterialIcons
                    name="shield"
                    size={18}
                    color={blockApps ? "#fff" : "#555"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.blockAppsTitle}>
                    BLOCK TOP 3 SOCIAL APPS
                  </Text>
                  <Text style={styles.blockAppsSubtitle}>
                    Auto-blocks highest screen-time apps during goal window + 15m reminder
                  </Text>
                </View>
                <Switch
                  value={blockApps}
                  onValueChange={handleToggleBlockApps}
                  trackColor={{ false: "#d4d4d8", true: "#000000" }}
                  thumbColor="#ffffff"
                />
              </View>

              {blockApps && (
                <View style={styles.topAppsPillsRow}>
                  {topSocialApps.map((app) => (
                    <View key={app} style={styles.topAppPill}>
                      <MaterialIcons name="block" size={11} color="#ef4444" />
                      <Text style={styles.topAppPillText}>{app}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.commitBtn, !title.trim() && { opacity: 0.45 }]}
              onPress={handleSave}
              disabled={!title.trim()}
              activeOpacity={0.85}
            >
              <Text style={styles.commitBtnText}>
                {isEditMode ? "UPDATE GOAL" : "COMMIT TASK"}
              </Text>
            </TouchableOpacity>

          </Animated.View>
        </Animated.ScrollView>

        <KeyboardFloatingPreview
          label={
            focusedField === "title"
              ? "Goal Title"
              : focusedField === "intent"
                ? "Goal Details"
                : null
          }
          value={focusedField === "title" ? title : intent}
          placeholder={
            focusedField === "title"
              ? "What needs attention?"
              : "Add notes or context..."
          }
          actionLabel={title.trim() ? "Commit" : "Next"}
          onSubmit={() => {
            if (focusedField === "title" && !intent.trim()) {
              detailsInputRef.current?.focus();
            } else if (title.trim()) {
              handleSave();
            } else {
              Keyboard.dismiss();
            }
          }}
          insideKeyboardAvoiding
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Goal Detail Bottom Sheet ───────────────────────────────────────────────────
function GoalDetailSheet({ goal, onClose, onDone, onForfeit }: {
  goal: Goal | null; onClose: () => void; onDone: () => void; onForfeit?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SCREEN_H);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    if (goal) {
      translateY.value = withSpring(0,        { damping: 22, stiffness: 200 });
      opacity.value    = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withSpring(SCREEN_H, { damping: 22, stiffness: 200 });
      opacity.value    = withTiming(0, { duration: 180 });
    }
  }, [goal]);

  const sheetAnim   = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const overlayAnim = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!goal) return null;

  const activeTo = addMinutesToTimeStr(goal.startTime, goal.durationMinutes);
  const timeStr = goal.type === "daily"
    ? `${goal.startTime} - ${activeTo}`
    : goal.scheduledDate
      ? `${goal.scheduledDate} · ${goal.startTime} - ${activeTo}`
      : `${goal.startTime} - ${activeTo}`;

  return (
    <Modal visible={!!goal} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, overlayAnim]}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.detailSheet, { paddingBottom: insets.bottom + 20 }, sheetAnim]}>
        <View style={styles.dragHandle} />
        <Text style={styles.detailFocusLabel}>CURRENT FOCUS</Text>
        <Text style={styles.detailTitle}>{goal.title}</Text>
        <View style={styles.detailTimeRow}>
          <MaterialIcons name="schedule" size={16} color="#555" />
          <Text style={styles.detailTimeText}>{timeStr}</Text>
        </View>
        <View style={styles.detailCards}>
          <View style={styles.detailInfoCard}>
            <Text style={styles.detailCardLabel}>DURATION</Text>
            <Text style={styles.detailCardValue}>{durationLabel(goal.durationMinutes)}</Text>
          </View>
          <View style={styles.detailInfoCard}>
            <Text style={styles.detailCardLabel}>PRIORITY</Text>
            <Text style={[styles.detailCardValue, { color: PRIORITY_COLOR[goal.priority] }]}>
              {PRIORITY_LABEL[goal.priority]}
            </Text>
          </View>
        </View>
        {goal.blockApps !== false && (
          <View style={styles.detailBlockBadge}>
            <MaterialIcons name="shield" size={16} color="#000" />
            <Text style={styles.detailBlockBadgeText}>
              Top 3 social media apps blocked during this goal window
            </Text>
          </View>
        )}
        {!!goal.intent && (
          <View style={styles.detailNotesCard}>
            <MaterialIcons name="menu" size={20} color="#999" style={{ marginTop: 2 }} />
            <Text style={styles.detailNotesText}>{goal.intent}</Text>
          </View>
        )}
        <View style={styles.detailActions}>
          {goal.status === "done" ? (
            <View style={[styles.doneBtn, { backgroundColor: "#e8e8e8" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="check-circle" size={18} color="#666" />
                <Text style={[styles.doneBtnText, { color: "#666" }]}>DONE</Text>
              </View>
            </View>
          ) : (goal.status as string) === "forfeited" ? (
            <View style={[styles.doneBtn, { backgroundColor: "#fee2e2" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name="cancel" size={18} color="#ef4444" />
                <Text style={[styles.doneBtnText, { color: "#ef4444" }]}>FORFEITED</Text>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
              {onForfeit && (
                <TouchableOpacity
                  style={[styles.doneBtn, { flex: 0.38, backgroundColor: "transparent", borderWidth: 1, borderColor: "#ef4444" }]}
                  activeOpacity={0.8}
                  onPress={onForfeit}
                >
                  <Text style={[styles.doneBtnText, { color: "#ef4444" }]}>FORFEIT</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.doneBtn, { flex: onForfeit ? 0.62 : 1 }]}
                activeOpacity={0.85}
                onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onDone(); }}
              >
                <Text style={styles.doneBtnText}>DONE</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

// ── Goal card ──────────────────────────────────────────────────────────────────
function GoalCard({ goal, delay = 0, onDelete, onPress, onEdit }: {
  goal: Goal; delay?: number; onDelete: () => void; onPress: () => void; onEdit: () => void;
}) {
  const colors = useColors();
  const activeTo = addMinutesToTimeStr(goal.startTime, goal.durationMinutes);
  const isForfeited = (goal.status as string) === "forfeited";

  return (
    <Animated.View
      entering={isWeb ? undefined : FadeInDown.delay(delay).springify()}
      exiting={isWeb ? undefined : FadeOut.duration(240)}
      layout={isWeb ? undefined : LinearTransition.springify()}
      style={[
        styles.goalCard,
        { backgroundColor: colors.card },
        (goal.status === "done" || isForfeited) && { opacity: 0.62 },
      ]}
    >
      <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={{ flex: 1, flexDirection: "row" }}>
        <View style={[styles.goalCardAccent, { backgroundColor: PRIORITY_COLOR[goal.priority] }]} />
        <View style={styles.goalCardInner}>
          {/* Action buttons row */}
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.cardActionBtn, { backgroundColor: colors.surfaceContainerHigh }]}
              onPress={onEdit}
              hitSlop={8}
            >
              <MaterialIcons name="edit" size={15} color={colors.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cardActionBtn, { backgroundColor: colors.surfaceContainerHigh }]}
              onPress={onDelete}
              hitSlop={8}
            >
              <MaterialIcons
                name={goal.status === "pending" ? "flag" : "delete-outline"}
                size={15}
                color="#ef4444"
              />
            </TouchableOpacity>
          </View>

          {/* Badges row */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingRight: 68 }}>
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
            <View style={[styles.typeBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
              <Text style={[styles.typeBadgeText, { color: PRIORITY_COLOR[goal.priority] }]}>
                {PRIORITY_LABEL[goal.priority].toUpperCase()}
              </Text>
            </View>
            {goal.blockApps !== false && goal.status === "pending" && (
              <View style={[styles.typeBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
                <MaterialIcons name="shield" size={11} color={colors.onSurface} />
                <Text style={[styles.typeBadgeText, { color: colors.onSurface }]}>
                  APP LOCK
                </Text>
              </View>
            )}
            {isForfeited && (
              <View style={[styles.typeBadge, { backgroundColor: "#fee2e2" }]}>
                <Text style={[styles.typeBadgeText, { color: "#ef4444" }]}>
                  FORFEITED
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.goalName,   { color: colors.onSurface }]}>{goal.title}</Text>
          {!!goal.intent && <Text style={[styles.goalIntent, { color: colors.outline }]}>{goal.intent}</Text>}

          <View style={[styles.timeChip, { backgroundColor: colors.surfaceContainerHigh }]}>
            <MaterialIcons name="schedule" size={15} color={colors.onSurface} />
            <Text style={[styles.timeChipText, { color: colors.onSurface }]}>
              {goal.type === "daily"
                ? `${goal.startTime} – ${activeTo}`
                : goal.scheduledDate
                  ? `${goal.scheduledDate}  ·  ${goal.startTime} – ${activeTo}`
                  : `${goal.startTime} – ${activeTo}`}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Filter bar ─────────────────────────────────────────────────────────────────
interface Filters {
  type: GoalType | "all";
  priority: Priority | "all";
  status: GoalStatusValue | "all";
}
const DEFAULT_FILTERS: Filters = { type: "all", priority: "all", status: "all" };

function FilterSheet({ visible, filters, onApply, onClose }: {
  visible: boolean; filters: Filters; onApply: (f: Filters) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Filters>(filters);
  useEffect(() => { if (visible) setDraft(filters); }, [visible, filters]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={StyleSheet.absoluteFill}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        </View>
      </TouchableWithoutFeedback>
      <View style={styles.addModalCentered} pointerEvents="box-none">
        <View style={styles.filterCard}>
          <TouchableOpacity style={styles.addModalClose} onPress={onClose} hitSlop={12}>
            <MaterialIcons name="close" size={20} color="#000" />
          </TouchableOpacity>
          <Text style={styles.addModalTitle}>FILTER GOALS</Text>
          <Text style={styles.addModalSub}>NARROW YOUR LIST</Text>

          <Text style={styles.formLabel}>TYPE</Text>
          <View style={styles.priorityRow}>
            {(["all", "daily", "scheduled"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.priorityChip, draft.type === t && styles.priorityChipActiveBlack]}
                onPress={() => { Haptics.selectionAsync(); setDraft(d => ({ ...d, type: t })); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.priorityChipText, draft.type === t && { color: "#fff" }]}>
                  {t === "all" ? "All" : t === "daily" ? "Daily" : "Scheduled"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.formLabel, { marginTop: 18 }]}>PRIORITY</Text>
          <View style={styles.priorityRow}>
            {(["all", ...PRIORITIES] as const).map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.priorityChip,
                  draft.priority === p && (p === "all"
                    ? styles.priorityChipActiveBlack
                    : { backgroundColor: PRIORITY_COLOR[p as Priority], borderColor: PRIORITY_COLOR[p as Priority] }),
                ]}
                onPress={() => { Haptics.selectionAsync(); setDraft(d => ({ ...d, priority: p as Priority | "all" })); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.priorityChipText, draft.priority === p && { color: "#fff" }]}>
                  {p === "all" ? "All" : PRIORITY_LABEL[p as Priority]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.formLabel, { marginTop: 18 }]}>STATUS</Text>
          <View style={styles.priorityRow}>
            {(["all", "pending", "done"] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.priorityChip, draft.status === s && styles.priorityChipActiveBlack]}
                onPress={() => { Haptics.selectionAsync(); setDraft(d => ({ ...d, status: s })); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.priorityChipText, draft.status === s && { color: "#fff" }]}>
                  {s === "all" ? "All" : s === "pending" ? "Pending" : "Done"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
            <TouchableOpacity
              style={[styles.commitBtn, { flex: 1, backgroundColor: "#f0f0f0" }]}
              onPress={() => { Haptics.selectionAsync(); setDraft(DEFAULT_FILTERS); onApply(DEFAULT_FILTERS); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.commitBtnText, { color: "#000" }]}>RESET</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.commitBtn, { flex: 1 }]}
              onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onApply(draft); }}
              activeOpacity={0.85}
            >
              <Text style={styles.commitBtnText}>APPLY</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function GoalsScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const topPad  = isWeb ? 67 : insets.top;
  const tabBarH = isWeb ? 84 : 62 + insets.bottom;
  const queryClient = useQueryClient();

  const { data: rawGoals, isLoading, isError, refetch } = useListGoals();
  const [localGoals, setLocalGoals] = useState<Goal[]>([]);

  // Load locally persisted goals backup on mount
  useEffect(() => {
    AsyncStorage.getItem(LOCAL_GOALS_CACHE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Goal[];
          if (Array.isArray(parsed)) setLocalGoals(parsed);
        }
      })
      .catch(() => {});
  }, []);

  const saveLocalGoals = useCallback((nextGoals: Goal[]) => {
    setLocalGoals(nextGoals);
    AsyncStorage.setItem(LOCAL_GOALS_CACHE_KEY, JSON.stringify(nextGoals)).catch(
      () => {},
    );
  }, []);

  // Merge server goals + optimistic/local goals so newly created goals NEVER vanish
  const goals = useMemo(() => {
    const serverList = Array.isArray(rawGoals) ? rawGoals : [];
    const byId = new Map<string, Goal>();
    for (const g of serverList) {
      byId.set(g.id, g);
    }
    for (const lg of localGoals) {
      // Keep local goals that aren't on the server yet (or match by title+startTime)
      const matchedServer = serverList.find(
        (s) =>
          s.id === lg.id ||
          (s.title === lg.title && s.startTime === lg.startTime),
      );
      if (matchedServer) {
        byId.set(matchedServer.id, {
          ...matchedServer,
          blockApps: matchedServer.blockApps ?? lg.blockApps ?? true,
        });
      } else {
        byId.set(lg.id, lg);
      }
    }
    return Array.from(byId.values()).sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    );
  }, [rawGoals, localGoals]);

  // Keep goal notifications (15m reminder + start reminder) & top 3 social app blocker synced
  useGoalAutomation(goals);

  const createGoal = useCreateGoal();
  const sub = useSubscription();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGoal,  setEditingGoal]  = useState<Goal | null>(null);
  const [detailGoal,   setDetailGoal]   = useState<Goal | null>(null);
  const [forfeitingGoal, setForfeitingGoal] = useState<Goal | null>(null);
  const [showFilters,  setShowFilters]  = useState(false);
  const [filters,      setFilters]      = useState<Filters>(DEFAULT_FILTERS);

  const filtersActive = filters.type !== "all" || filters.priority !== "all" || filters.status !== "all";

  const visibleGoals = useMemo(() => {
    return goals.filter(g =>
      (filters.type === "all" || g.type === filters.type) &&
      (filters.priority === "all" || g.priority === filters.priority) &&
      (filters.status === "all" || g.status === filters.status)
    );
  }, [goals, filters]);

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

  const draftToInput = (draft: GoalDraft): GoalInput => ({
    title: draft.title,
    intent: draft.intent || undefined,
    type: draft.type,
    priority: draft.priority,
    startTime: draft.startTime,
    durationMinutes: draft.durationMinutes,
    scheduledDate: draft.scheduledDate,
    blockApps: draft.blockApps,
  });

  const handleDeleteGoal = (goal: Goal) => {
    if (goal.status === "done" || (goal.status as string) === "forfeited") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const filteredLocal = localGoals.filter((g) => g.id !== goal.id);
      saveLocalGoals(filteredLocal);
      if (!goal.id.startsWith("local-")) {
        deleteGoal.mutate({ id: goal.id }, { onSuccess: () => refetch() });
      }
    } else {
      // Pending goal: require a reason & trigger LLM reality check notification
      setForfeitingGoal(goal);
    }
  };

  const handleForfeitGoal = async (reason: string, roast: string) => {
    if (!forfeitingGoal) return;
    const targetId = forfeitingGoal.id;

    // Optimistically mark forfeited locally
    const nextLocal = goals.map((g) =>
      g.id === targetId
        ? {
            ...g,
            status: "forfeited" as GoalStatusValue,
            forfeitReason: reason,
            forfeitRoast: roast,
            updatedAt: new Date().toISOString(),
          }
        : g,
    );
    saveLocalGoals(nextLocal);
    queryClient.setQueryData(getListGoalsQueryKey(), nextLocal);

    try {
      if (!targetId.startsWith("local-")) {
        await updateGoal.mutateAsync({
          id: targetId,
          data: {
            status: "forfeited" as any,
            forfeitReason: reason,
            forfeitRoast: roast,
          } as any,
        });
        refetch();
      }
      void syncGuiltNotifications(true);
      void syncGoalAutomation(nextLocal);
    } catch (e) {
      console.warn("Failed to forfeit goal on server (kept locally):", e);
    } finally {
      setForfeitingGoal(null);
    }
  };

  const handleAddGoal = (draft: GoalDraft) => {
    const nowIso = new Date().toISOString();
    const optimisticGoal: Goal = {
      id: `local-${Date.now()}`,
      userId: "me",
      title: draft.title,
      intent: draft.intent || null,
      type: draft.type,
      priority: draft.priority,
      startTime: draft.startTime,
      durationMinutes: draft.durationMinutes,
      scheduledDate:
        draft.type === "scheduled"
          ? draft.scheduledDate || todayDateStr()
          : null,
      status: "pending",
      blockApps: draft.blockApps,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // 1. Reset any active filter that might hide the new pending goal
    if (filters.status === "done") {
      setFilters(DEFAULT_FILTERS);
    }

    // 2. Immediately add to local cache + React Query cache so card renders instantly
    const nextGoals = [optimisticGoal, ...goals];
    saveLocalGoals(nextGoals);
    queryClient.setQueryData(getListGoalsQueryKey(), nextGoals);

    // 3. Fire immediate "Goal Added" notification + schedule 15-min reminder & app blocker
    void notifyGoalAdded(optimisticGoal, draft.blockApps);
    void syncGoalAutomation(nextGoals);

    // 4. Persist to backend API
    createGoal.mutate(
      { data: draftToInput(draft) },
      {
        onSuccess: (created: any) => {
          if (created && created.id) {
            const synced = nextGoals.map((g) =>
              g.id === optimisticGoal.id
                ? { ...created, blockApps: draft.blockApps }
                : g,
            );
            saveLocalGoals(synced);
            queryClient.setQueryData(getListGoalsQueryKey(), synced);
          }
          refetch();
          void syncGuiltNotifications(true);
        },
        onError: (err: any) => {
          console.warn("Goal saved locally; server sync pending:", err?.message);
        },
      },
    );
  };

  const handleUpdateGoal = (id: string, draft: GoalDraft) => {
    const nextGoals = goals.map((g) =>
      g.id === id
        ? {
            ...g,
            title: draft.title,
            intent: draft.intent || null,
            type: draft.type,
            priority: draft.priority,
            startTime: draft.startTime,
            durationMinutes: draft.durationMinutes,
            scheduledDate:
              draft.type === "scheduled"
                ? draft.scheduledDate || g.scheduledDate || todayDateStr()
                : null,
            blockApps: draft.blockApps,
            updatedAt: new Date().toISOString(),
          }
        : g,
    );
    saveLocalGoals(nextGoals);
    queryClient.setQueryData(getListGoalsQueryKey(), nextGoals);
    void syncGoalAutomation(nextGoals);

    if (!id.startsWith("local-")) {
      updateGoal.mutate(
        { id, data: draftToInput(draft) },
        { onSuccess: () => refetch() },
      );
    }
  };

  const handleEditGoal = (goal: Goal) => {
    Haptics.selectionAsync();
    setEditingGoal(goal);
    setShowAddModal(true);
  };

  const handleModalClose = () => {
    setShowAddModal(false);
    setEditingGoal(null);
  };

  const handleToggleDone = (goal: Goal) => {
    const nextStatus: GoalStatusValue =
      goal.status === "done" ? "pending" : "done";
    const nextGoals = goals.map((g) =>
      g.id === goal.id
        ? { ...g, status: nextStatus, updatedAt: new Date().toISOString() }
        : g,
    );
    saveLocalGoals(nextGoals);
    queryClient.setQueryData(getListGoalsQueryKey(), nextGoals);
    void syncGoalAutomation(nextGoals);

    if (!goal.id.startsWith("local-")) {
      updateGoal.mutate(
        { id: goal.id, data: { status: nextStatus } },
        {
          onSuccess: () => {
            refetch();
            void syncGuiltNotifications(true);
          },
        },
      );
    }
    setDetailGoal(null);
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
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.delay(0).springify()}
          style={styles.headerRow}
        >
          <Text style={[styles.headerTitle, { color: colors.onSurface }]}>GOALS</Text>
          <TouchableOpacity
            style={[
              styles.filterBtn,
              { backgroundColor: colors.surfaceContainerHigh },
              filtersActive && { backgroundColor: colors.primary },
            ]}
            onPress={() => { Haptics.selectionAsync(); setShowFilters(true); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="tune" size={16} color={filtersActive ? "#fff" : colors.onSurface} />
            <Text style={[styles.filterBtnText, { color: filtersActive ? "#fff" : colors.onSurface }]}>
              {filtersActive ? "Filters active" : "Filter"}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {sub.isLimited && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/subscription" as any)}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.primary, borderRadius: 18, padding: 16, marginBottom: 14 }}
          >
            <MaterialIcons name="lock" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 }}>Goals are a Pro feature</Text>
              <Text style={{ color: "rgba(255,255,255,0.75)", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 }}>Your free trial ended. Upgrade to create and track goals.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color="#fff" />
          </TouchableOpacity>
        )}

        {isLoading && visibleGoals.length === 0 && (
          <HadafInlineLoader message="Loading your goals..." />
        )}

        {isError && !isLoading && visibleGoals.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.outline }]}>
            Couldn't load your goals from server. Tap + to add a new goal.
          </Text>
        )}

        {!isLoading && visibleGoals.length === 0 && !isError && (
          <Text style={[styles.emptyText, { color: colors.outline }]}>
            {filtersActive ? "No goals match your filters." : "No goals yet. Tap + to add one."}
          </Text>
        )}

        {visibleGoals.map((g, i) => (
          <GoalCard
            key={g.id}
            goal={g}
            delay={60 + i * 80}
            onDelete={() => handleDeleteGoal(g)}
            onPress={() => { Haptics.selectionAsync(); setDetailGoal(g); }}
            onEdit={() => handleEditGoal(g)}
          />
        ))}
      </Animated.ScrollView>

      {/* FAB */}
      <Animated.View style={[styles.floatingBtn, { bottom: tabBarH + 16, right: FAB_RIGHT }, fabContainerStyle]}>
        <TouchableOpacity
          style={[styles.addGoalBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (sub.isLimited) {
              router.push("/subscription" as any);
              return;
            }
            setEditingGoal(null);
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

      {/* Modal 1 — Add / Edit Task */}
      <AddTaskModal
        visible={showAddModal}
        onClose={handleModalClose}
        onSave={handleAddGoal}
        editingGoal={editingGoal}
        onUpdate={handleUpdateGoal}
      />

      {/* Modal 2 — Goal Detail Sheet */}
      <GoalDetailSheet
        goal={detailGoal}
        onClose={() => setDetailGoal(null)}
        onDone={() => detailGoal && handleToggleDone(detailGoal)}
        onForfeit={() => {
          if (detailGoal) {
            const g = detailGoal;
            setDetailGoal(null);
            setForfeitingGoal(g);
          }
        }}
      />

      <ForfeitModal
        visible={!!forfeitingGoal}
        type="goal"
        context={{
          title: forfeitingGoal?.title,
          plannedMinutes: forfeitingGoal?.durationMinutes,
        }}
        onClose={() => setForfeitingGoal(null)}
        onForfeited={handleForfeitGoal}
      />

      {/* Modal 3 — Filters */}
      <FilterSheet
        visible={showFilters}
        filters={filters}
        onApply={(f) => { setFilters(f); setShowFilters(false); }}
        onClose={() => setShowFilters(false)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  filterBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 40 },

  // Goal card
  goalCard:       { borderRadius: 24, flexDirection: "row", overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 20, elevation: 2 },
  goalCardAccent: { width: 5 },
  goalCardInner:  { flex: 1, padding: 20, gap: 12 },
  cardActions:    { position: "absolute", top: 12, right: 12, flexDirection: "row", gap: 8, zIndex: 5 },
  cardActionBtn:  { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
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

  // Type toggle
  typeToggleRow: { flexDirection: "row", backgroundColor: "#f0f0f0", borderRadius: 14, padding: 4, gap: 4, marginBottom: 18 },
  typeToggleBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  typeToggleBtnActive: { backgroundColor: "#000" },
  typeToggleBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#555" },
  typeToggleBtnTextActive: { color: "#fff" },

  // Priority chips
  priorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  priorityChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: "#e0e0e0", backgroundColor: "#f7f7f7" },
  priorityChipActiveBlack: { backgroundColor: "#000", borderColor: "#000" },
  priorityChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#444" },

  // ── Add Task Modal ──
  addModalCentered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  addModalScroll:   { width: "100%" },
  addModalScrollContent: { alignItems: "center", justifyContent: "center", flexGrow: 1, paddingVertical: 24 },
  addModalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 40,
    elevation: 16,
  },
  filterCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 40,
    elevation: 16,
  },
  addModalClose: { position: "absolute", top: 22, right: 22, width: 32, height: 32, alignItems: "center", justifyContent: "center", zIndex: 10 },
  addModalTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: -0.5, marginBottom: 4 },
  addModalSub:   { fontSize: 10, fontFamily: "Inter_700Bold", color: "#aaa", letterSpacing: 3, marginBottom: 20 },

  formLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.8, color: "#333", marginBottom: 8 },

  addModalInput: {
    backgroundColor: "#f0f0f0",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#000",
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  addModalInputFocused: {
    backgroundColor: "#ffffff",
    borderColor: "#000000",
  },
  addModalTextArea: {
    borderRadius: 18,
    minHeight: 74,
    textAlignVertical: "top",
  },

  schedCols:     { flexDirection: "row", gap: 12, marginBottom: 0, marginTop: 4 },
  schedColLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.8, color: "#555", marginBottom: 8 },
  schedPill:     { backgroundColor: "#f0f0f0", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14, alignItems: "center" },
  schedPillText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#000" },

  drumBox: { marginTop: 14, borderRadius: 16, overflow: "hidden" },

  blockAppsCard: {
    marginTop: 18,
    backgroundColor: "#f7f7f8",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e4e4e7",
    gap: 10,
  },
  blockAppsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  blockAppsIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  blockAppsTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    color: "#0a0a0a",
  },
  blockAppsSubtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#71717a",
    marginTop: 2,
  },
  topAppsPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 2,
  },
  topAppPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e4e4e7",
  },
  topAppPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#18181b",
  },

  commitBtn: {
    marginTop: 20,
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
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ddd", alignSelf: "center", marginBottom: 8 },
  detailFocusLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 2 },
  detailTitle:      { fontSize: 30, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: -0.5, lineHeight: 36 },
  detailTimeRow:    { flexDirection: "row", alignItems: "center", gap: 8 },
  detailTimeText:   { fontSize: 14, fontFamily: "Inter_500Medium", color: "#444" },
  detailCards:      { flexDirection: "row", gap: 12 },
  detailInfoCard:   { flex: 1, backgroundColor: "#f2f2f2", borderRadius: 18, padding: 18, gap: 6 },
  detailCardLabel:  { fontSize: 9, fontFamily: "Inter_700Bold", color: "#888", letterSpacing: 2 },
  detailCardValue:  { fontSize: 16, fontFamily: "Inter_700Bold", color: "#000" },
  detailBlockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f4f4f5",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  detailBlockBadgeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#18181b",
  },
  detailNotesCard:  { flexDirection: "row", alignItems: "flex-start", gap: 14, backgroundColor: "#f2f2f2", borderRadius: 18, padding: 18 },
  detailNotesText:  { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: "#444", lineHeight: 21 },
  detailActions:    { gap: 10 },
  doneBtn:          { backgroundColor: "#000", borderRadius: 999, height: 54, alignItems: "center", justifyContent: "center" },
  doneBtnText:      { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 2 },
});
