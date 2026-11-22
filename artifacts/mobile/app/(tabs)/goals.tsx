import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { MaterialIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Vibration,
  View,
} from "react-native";
import { router } from "expo-router";

import { focusSessionState } from "@/lib/focusSessionState";
import { useSubscription } from "@/hooks/useSubscription";
import {
  dismissNativeNotification,
  findActiveGoalSession,
  getTopSocialApps,
  goalWindows,
  notifyGoalAdded,
  playNativeCompletionAlarm,
  showNativeNotification,
  syncGoalAutomation,
  useGoalAutomation,
} from "@/lib/goalAutomation";
import { syncGuiltNotifications } from "@/lib/guiltNotifications";
import {
  getPermissionStatus,
  isNativeAppBlockerSupported,
  openAccessibilitySettings,
  stopNativeCompletionAlarm,
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

// ── Drum picker constants (Scrollable alarm/timer wheel) ───────────────────────
const HOURS_12 = ["1","2","3","4","5","6","7","8","9","10","11","12"];
const MINUTES  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const PERIODS  = ["AM","PM"];
const DUR_HRS  = ["0","1","2","3","4","5","6","7","8","9","10","11","12"];
const DUR_MINS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const ITEM_H   = 44;

function formatCountdown(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const remSecs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(remSecs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(remSecs).padStart(2, "0")}`;
}

// ── DrumColumn (Scrollable Wheel Column with nestedScrollEnabled) ──────────────
function DrumColumn({ items, selected, onSelect, width = 56 }: {
  items: string[]; selected: string; onSelect: (v: string) => void; width?: number;
}) {
  const scrollRef = useRef<Animated.ScrollView>(null);
  const lastIdxRef = useRef<number>(-1);

  useEffect(() => {
    const idx = items.indexOf(selected);
    if (idx >= 0) {
      lastIdxRef.current = idx;
      setTimeout(() => (scrollRef.current as any)?.scrollTo({ y: idx * ITEM_H, animated: false }), 60);
    }
  }, []);

  const handleScrollChange = useCallback((e: any) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const idx = Math.round(offsetY / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    if (clamped !== lastIdxRef.current) {
      lastIdxRef.current = clamped;
      Haptics.selectionAsync();
      onSelect(items[clamped]);
    }
  }, [items, onSelect]);

  return (
    <View style={{ width, height: ITEM_H * 3, overflow: "hidden" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute", top: ITEM_H, left: 4, right: 4, height: ITEM_H,
          backgroundColor: "rgba(0,0,0,0.06)",
          borderTopWidth: 1.5, borderBottomWidth: 1.5,
          borderColor: "rgba(0,0,0,0.18)", borderRadius: 10,
        }}
      />
      <Animated.ScrollView
        ref={scrollRef as any}
        nestedScrollEnabled={true}
        snapToInterval={ITEM_H}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: ITEM_H }}
        onScroll={handleScrollChange}
        onMomentumScrollEnd={handleScrollChange}
        onScrollEndDrag={handleScrollChange}
        scrollEventThrottle={16}
      >
        {items.map((item, i) => {
          const isSel = item === selected;
          return (
            <TouchableOpacity
              key={i}
              style={{ height: ITEM_H, alignItems: "center", justifyContent: "center" }}
              onPress={() => {
                lastIdxRef.current = i;
                (scrollRef.current as any)?.scrollTo({ y: i * ITEM_H, animated: true });
                Haptics.selectionAsync();
                onSelect(item);
              }}
              activeOpacity={0.7}
            >
              <Text style={{
                fontSize: isSel ? 19 : 14,
                fontFamily: isSel ? "Inter_700Bold" : "Inter_500Medium",
                color: isSel ? "#000" : "#9ca3af",
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
  const [minute, setMinute] = useState(parsed ? parsed[2].padStart(2, "0") : "00");
  const [period, setPeriod] = useState(parsed ? parsed[3]?.toUpperCase() ?? "AM" : "AM");
  useEffect(() => { onChange(`${hour}:${minute} ${period}`); }, [hour, minute, period]);
  return (
    <View style={styles.drumContainer}>
      <DrumColumn items={HOURS_12} selected={hour}   onSelect={setHour}   width={52} />
      <Text style={styles.drumColon}>:</Text>
      <DrumColumn items={MINUTES}  selected={minute} onSelect={setMinute} width={52} />
      <View style={{ width: 6 }} />
      <DrumColumn items={PERIODS}  selected={period} onSelect={setPeriod} width={52} />
    </View>
  );
}

// ── Inline drum duration picker ────────────────────────────────────────────────
function DrumDurationPicker({ minutes, onChange }: { minutes: number; onChange: (v: number) => void }) {
  const hrs0  = String(Math.floor(minutes / 60));
  const rawMin = minutes % 60;
  const snappedMin = String(Math.round(rawMin / 5) * 5 % 60).padStart(2, "0");
  const [hrs,  setHrs]  = useState(DUR_HRS.includes(hrs0) ? hrs0 : "1");
  const [mins, setMins] = useState(DUR_MINS.includes(snappedMin) ? snappedMin : "30");
  useEffect(() => {
    const total = Math.max(5, parseInt(hrs, 10) * 60 + parseInt(mins, 10));
    onChange(total);
  }, [hrs, mins]);
  return (
    <View style={styles.drumContainer}>
      <DrumColumn items={DUR_HRS}  selected={hrs}  onSelect={setHrs}  width={48} />
      <Text style={[styles.drumColon, { fontSize: 12, color: "#555" }]}>hr</Text>
      <View style={{ width: 6 }} />
      <DrumColumn items={DUR_MINS} selected={mins} onSelect={setMins} width={48} />
      <Text style={[styles.drumColon, { fontSize: 12, color: "#555" }]}>min</Text>
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
  const [topSocialApps, setTopSocialApps] = useState<string[]>([]);
  const [focusedField, setFocusedField] = useState<"title" | "intent" | null>(null);

  const detailsInputRef = useRef<TextInput>(null);

  const scale   = useSharedValue(0.88);
  const opacity = useSharedValue(0);

  // Load top 3 most-used apps by screen time when modal opens (never hardcoding uninstalled apps like TikTok)
  useEffect(() => {
    if (visible) {
      getTopSocialApps(true)
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        <Animated.ScrollView
          style={styles.addModalScroll}
          contentContainerStyle={styles.addModalScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={true}
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

            {/* Block Top 3 Social Media Apps Toggle (like Focus Session) */}
            <View style={[styles.blockAppsCard, { marginTop: 0, marginBottom: 18 }]}>
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

            {/* Scheduling Window — Always-Scrollable Alarm/Timer Wheel Pickers */}
            <Text style={[styles.formLabel, { marginTop: 4 }]}>
              SCHEDULING WINDOW (SCROLL TO SET)
            </Text>

            <View style={{ gap: 12 }}>
              {/* Start Time Wheel */}
              <View style={styles.wheelSectionCard}>
                <View style={styles.wheelHeaderRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <MaterialIcons name="alarm" size={16} color="#000" />
                    <Text style={styles.schedColLabel}>START TIME</Text>
                  </View>
                  <View style={styles.wheelValueBadge}>
                    <Text style={styles.wheelValueBadgeText}>{startTime}</Text>
                  </View>
                </View>
                <DrumTimePicker
                  key={editingGoal ? `edit-time-${editingGoal.id}` : "new-time"}
                  value={startTime}
                  onChange={setStartTime}
                />
              </View>

              {/* Duration Wheel */}
              <View style={styles.wheelSectionCard}>
                <View style={styles.wheelHeaderRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <MaterialIcons name="timer" size={16} color="#000" />
                    <Text style={styles.schedColLabel}>DURATION</Text>
                  </View>
                  <View style={styles.wheelValueBadge}>
                    <Text style={styles.wheelValueBadgeText}>{durationLabel(duration)}</Text>
                  </View>
                </View>
                <DrumDurationPicker
                  key={editingGoal ? `edit-dur-${editingGoal.id}` : "new-dur"}
                  minutes={duration}
                  onChange={setDuration}
                />
              </View>
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

// ── Strict Honesty & Regret Goal Completion Verification Modal ─────────────────
function GoalCompletionVerifyModal({
  goal,
  onConfirmTrulyDone,
  onAdmitNotCompleted,
  onClose,
}: {
  goal: Goal | null;
  onConfirmTrulyDone: (goal: Goal) => void;
  onAdmitNotCompleted: (goal: Goal) => void;
  onClose: () => void;
}) {
  if (!goal) return null;
  return (
    <Modal visible={!!goal} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.verifyOverlay}>
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.verifyCard}>
          <View style={styles.verifyWarningIconWrap}>
            <MaterialIcons name="gpp-maybe" size={32} color="#ef4444" />
          </View>

          <View style={styles.verifyStrictPill}>
            <MaterialIcons name="warning" size={12} color="#ef4444" />
            <Text style={styles.verifyStrictPillText}>STRICT ACCOUNTABILITY CHECK</Text>
          </View>

          <Text style={styles.verifyTitle}>
            Did You Actually Complete "{goal.title}"?
          </Text>

          <View style={styles.verifyRegretBox}>
            <Text style={styles.verifyRegretText}>
              Think twice before you tap. Falsely claiming a goal you didn't truly finish is lying to your own future.
              {"\n\n"}
              A fake green checkmark won't build your life — it only hides your weakness and guarantees deep regret when your dreams stay out of reach. Did you genuinely put in the work for the full {durationLabel(goal.durationMinutes)}, or did you cheat yourself?
            </Text>
          </View>

          <View style={{ width: "100%", gap: 10, marginTop: 4 }}>
            <TouchableOpacity
              style={styles.verifyConfirmBtn}
              activeOpacity={0.85}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onConfirmTrulyDone(goal);
              }}
            >
              <MaterialIcons name="verified" size={18} color="#fff" />
              <Text style={styles.verifyConfirmBtnText}>
                YES, I TRULY COMPLETED IT (100% HONEST)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.verifyForfeitBtn}
              activeOpacity={0.85}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onAdmitNotCompleted(goal);
              }}
            >
              <MaterialIcons name="cancel" size={18} color="#ef4444" />
              <Text style={styles.verifyForfeitBtnText}>
                NO, I DID NOT FINISH IT (FORFEIT)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Active Goal Focus-Style Live Timer Banner ─────────────────────────────────
function ActiveGoalTimerCard({
  goal,
  remainingSeconds,
  totalSeconds,
  onComplete,
  onForfeit,
}: {
  goal: Goal;
  remainingSeconds: number;
  totalSeconds: number;
  onComplete: () => void;
  onForfeit: () => void;
}) {
  const progressPct =
    totalSeconds > 0
      ? Math.min(100, Math.max(2, Math.round(((totalSeconds - remainingSeconds) / totalSeconds) * 100)))
      : 0;

  return (
    <View style={styles.activeTimerCard}>
      <View style={styles.activeTimerTopRow}>
        <View style={styles.activeTimerLiveBadge}>
          <View style={styles.activeTimerPulseDot} />
          <Text style={styles.activeTimerLiveText}>GOAL IN PROGRESS</Text>
        </View>
        <View
          style={[
            styles.activeTimerPrioBadge,
            { backgroundColor: PRIORITY_COLOR[goal.priority] + "28" },
          ]}
        >
          <Text
            style={[
              styles.activeTimerPrioText,
              { color: PRIORITY_COLOR[goal.priority] },
            ]}
          >
            {PRIORITY_LABEL[goal.priority].toUpperCase()}
          </Text>
        </View>
      </View>

      <Text style={styles.activeTimerGoalTitle} numberOfLines={2}>
        {goal.title}
      </Text>

      <View style={styles.activeTimerClockWrap}>
        <Text style={styles.activeTimerDigits}>{formatCountdown(remainingSeconds)}</Text>
        <Text style={styles.activeTimerSubLabel}>REMAINING IN GOAL SESSION</Text>
      </View>

      <View style={styles.activeTimerProgressTrack}>
        <View style={[styles.activeTimerProgressFill, { width: `${progressPct}%` }]} />
      </View>

      {goal.blockApps !== false && (
        <View style={styles.activeTimerLockRow}>
          <MaterialIcons name="lock" size={14} color="#a1a1aa" />
          <Text style={styles.activeTimerLockText}>
            Top social apps locked · Mini timer active on notification bar
          </Text>
        </View>
      )}

      <View style={styles.activeTimerBtnRow}>
        <TouchableOpacity
          style={styles.activeTimerForfeitBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onForfeit();
          }}
          activeOpacity={0.85}
        >
          <MaterialIcons name="flag" size={18} color="#ef4444" />
          <Text style={styles.activeTimerForfeitText}>Forfeit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.activeTimerDoneBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onComplete();
          }}
          activeOpacity={0.85}
        >
          <MaterialIcons name="check-circle" size={18} color="#000" />
          <Text style={styles.activeTimerDoneText}>Complete Goal</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Goal card ──────────────────────────────────────────────────────────────────
function GoalCard({ goal, delay = 0, isActiveNow, remainingSeconds, onDelete, onPress, onEdit }: {
  goal: Goal;
  delay?: number;
  isActiveNow?: boolean;
  remainingSeconds?: number;
  onDelete: () => void;
  onPress: () => void;
  onEdit: () => void;
}) {
  const colors = useColors();
  const activeTo = addMinutesToTimeStr(goal.startTime, goal.durationMinutes);
  const isDone = goal.status === "done";
  const isForfeited = (goal.status as string) === "forfeited";
  const isScheduled = goal.type === "scheduled";

  // Check if goal's scheduled end time has already passed while still pending
  const isOverdue = useMemo(() => {
    if (isDone || isForfeited) return false;
    const wins = goalWindows(goal, 0);
    if (wins.length === 0) return false;
    const latestWin = wins[wins.length - 1];
    return latestWin.endMs < Date.now();
  }, [goal, isDone, isForfeited]);

  // Point 1e: Scheduled goal completed -> green highlighted; not completed -> red highlighted!
  // Also highlight completed daily goals green and forfeited/overdue daily goals red.
  const showGreenHighlight = isDone;
  const showRedHighlight =
    !isDone && (isForfeited || isOverdue || isScheduled);

  const cardBgColor = showGreenHighlight
    ? "#ecfdf5"
    : showRedHighlight
      ? "#fef2f2"
      : colors.card;

  const cardBorderColor = showGreenHighlight
    ? "#16a34a"
    : showRedHighlight
      ? "#ef4444"
      : "transparent";

  const accentColor = showGreenHighlight
    ? "#16a34a"
    : showRedHighlight
      ? "#ef4444"
      : PRIORITY_COLOR[goal.priority];

  return (
    <Animated.View
      entering={isWeb ? undefined : FadeInDown.delay(delay).springify()}
      exiting={isWeb ? undefined : FadeOut.duration(240)}
      layout={isWeb ? undefined : LinearTransition.springify()}
      style={[
        styles.goalCard,
        {
          backgroundColor: cardBgColor,
          borderWidth: showGreenHighlight || showRedHighlight ? 1.5 : 0,
          borderColor: cardBorderColor,
        },
      ]}
    >
      <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={{ flex: 1, flexDirection: "row" }}>
        <View style={[styles.goalCardAccent, { backgroundColor: accentColor }]} />
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
            {isDone && (
              <View style={[styles.typeBadge, { backgroundColor: "#dcfce7" }]}>
                <MaterialIcons name="check-circle" size={12} color="#15803d" />
                <Text style={[styles.typeBadgeText, { color: "#15803d" }]}>
                  COMPLETED
                </Text>
              </View>
            )}
            {isForfeited && (
              <View style={[styles.typeBadge, { backgroundColor: "#fee2e2" }]}>
                <MaterialIcons name="cancel" size={12} color="#dc2626" />
                <Text style={[styles.typeBadgeText, { color: "#dc2626" }]}>
                  FORFEITED
                </Text>
              </View>
            )}
            {!isDone && !isForfeited && (isOverdue || isScheduled) && (
              <View style={[styles.typeBadge, { backgroundColor: "#fee2e2" }]}>
                <MaterialIcons name="error-outline" size={12} color="#dc2626" />
                <Text style={[styles.typeBadgeText, { color: "#dc2626" }]}>
                  {isOverdue ? "MISSED · NOT COMPLETED" : "NOT COMPLETED"}
                </Text>
              </View>
            )}
            {goal.blockApps !== false && goal.status === "pending" && (
              <View style={[styles.typeBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
                <MaterialIcons name="shield" size={11} color={colors.onSurface} />
                <Text style={[styles.typeBadgeText, { color: colors.onSurface }]}>
                  APP LOCK
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.goalName,   { color: colors.onSurface }]}>{goal.title}</Text>
          {!!goal.intent && <Text style={[styles.goalIntent, { color: colors.outline }]}>{goal.intent}</Text>}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
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

            {isActiveNow && remainingSeconds !== undefined && remainingSeconds > 0 ? (
              <View style={[styles.timeChip, { backgroundColor: "#000" }]}>
                <MaterialIcons name="timer" size={15} color="#22c55e" />
                <Text style={[styles.timeChipText, { color: "#fff" }]}>
                  {formatCountdown(remainingSeconds)}
                </Text>
              </View>
            ) : null}
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
        const localUpdated = new Date(lg.updatedAt || 0).getTime();
        const serverUpdated = new Date(matchedServer.updatedAt || 0).getTime();
        byId.set(matchedServer.id, {
          ...matchedServer,
          status: localUpdated > serverUpdated ? lg.status : matchedServer.status,
          updatedAt: localUpdated > serverUpdated ? lg.updatedAt : matchedServer.updatedAt,
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
  const [verifyingGoal, setVerifyingGoal] = useState<Goal | null>(null);
  const [refreshing,   setRefreshing]   = useState(false);
  const [showFilters,  setShowFilters]  = useState(false);
  const [filters,      setFilters]      = useState<Filters>(DEFAULT_FILTERS);

  // Live Goal Timer state (activates automatically when a goal's startTime window begins)
  const [activeGoalSession, setActiveGoalSession] = useState<{
    goal: Goal;
    windowId: string;
    remainingSeconds: number;
    totalSeconds: number;
  } | null>(null);
  const promptedWindowIdsRef = useRef<Set<string>>(new Set());
  const prevActiveGoalRef = useRef<{ goal: Goal; windowId: string } | null>(null);
  const enforcedWindowIdRef = useRef<string | null>(null);

  // Hide bottom tab bar when a goal session is active (full-screen black Zen mode, just like Focus Session)
  useEffect(() => {
    const active = Boolean(activeGoalSession);
    focusSessionState.setActive(active);
    return () => {
      focusSessionState.setActive(false);
    };
  }, [activeGoalSession]);

  // Intercept Android hardware back button during active goal session -> open ForfeitModal
  useEffect(() => {
    const backAction = () => {
      if (activeGoalSession) {
        setForfeitingGoal(activeGoalSession.goal);
        return true;
      }
      return false;
    };
    const subBack = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => subBack.remove();
  }, [activeGoalSession]);

  // 1-second tick loop for active goal countdown + notification bar mini timer + app blocking + completion alarm & strict regret popup
  useEffect(() => {
    const tick = () => {
      const nowMs = Date.now();
      const found = findActiveGoalSession(goals, nowMs);

      if (found) {
        const nextState = {
          goal: found.goal,
          windowId: found.window.id,
          remainingSeconds: found.remainingSeconds,
          totalSeconds: found.totalSeconds,
        };
        setActiveGoalSession(nextState);
        prevActiveGoalRef.current = { goal: found.goal, windowId: found.window.id };

        // Enforce native app blocking immediately when the goal window starts
        if (enforcedWindowIdRef.current !== found.window.id) {
          enforcedWindowIdRef.current = found.window.id;
          void syncGoalAutomation(goals, true);
        }

        // Display live mini timer on notification bar throughout the goal session (Point 2)
        if (found.remainingSeconds > 0) {
          try {
            showNativeNotification(
              `${found.goal.durationMinutes} m`,
              `${found.goal.durationMinutes} m`,
              true,
              found.remainingSeconds
            );
          } catch {}
        }
      } else {
        enforcedWindowIdRef.current = null;
        // Check if an active goal just finished its duration window!
        const prev = prevActiveGoalRef.current;
        if (prev && !promptedWindowIdsRef.current.has(prev.windowId)) {
          const latestGoal = goals.find((g) => g.id === prev.goal.id) ?? prev.goal;
          if (latestGoal.status === "pending") {
            promptedWindowIdsRef.current.add(prev.windowId);
            try {
              dismissNativeNotification();
            } catch {}
            // Play default system alarm sound on goal duration completion
            try {
              playNativeCompletionAlarm(
                "Goal Duration Complete ⏰",
                `Time is up for "${latestGoal.title}". Verify honestly if you completed it!`
              );
            } catch {}
            Vibration.vibrate([0, 600, 200, 600, 200, 600, 200, 1000]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            // Pop up strict honesty & regret modal
            setVerifyingGoal(latestGoal);
          }
        }
        prevActiveGoalRef.current = null;
        setActiveGoalSession((cur) => {
          if (cur) {
            try {
              dismissNativeNotification();
            } catch {}
          }
          return null;
        });
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [goals]);

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

    // If active goal is being forfeited, dismiss the notification bar timer
    if (activeGoalSession?.goal.id === targetId) {
      try {
        dismissNativeNotification();
        stopNativeCompletionAlarm();
      } catch {}
      prevActiveGoalRef.current = null;
      setActiveGoalSession(null);
    }

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
        await queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
        refetch();
      } else {
        // Goal was still local: create on server and immediately mark forfeited so Analytics records it!
        const localTarget = goals.find((g) => g.id === targetId);
        if (localTarget) {
          const created: any = await createGoal.mutateAsync({
            data: {
              title: localTarget.title,
              intent: localTarget.intent || undefined,
              type: localTarget.type,
              priority: localTarget.priority,
              startTime: localTarget.startTime,
              durationMinutes: localTarget.durationMinutes,
              scheduledDate: localTarget.scheduledDate || undefined,
              blockApps: localTarget.blockApps ?? true,
            },
          });
          if (created?.id) {
            await updateGoal.mutateAsync({
              id: created.id,
              data: {
                status: "forfeited" as any,
                forfeitReason: reason,
                forfeitRoast: roast,
              } as any,
            });
            await queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
            refetch();
          }
        }
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

  // Step 1 when user claims a goal is done: open the strict regret verification modal!
  const handleRequestCompleteGoal = (goal: Goal) => {
    setDetailGoal(null);
    if (goal.status === "done") return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setVerifyingGoal(goal);
  };

  // Step 2: user confirms in GoalCompletionVerifyModal that they truly completed the goal
  const handleConfirmTrulyDone = async (goal: Goal) => {
    try {
      stopNativeCompletionAlarm();
      if (activeGoalSession?.goal.id === goal.id) {
        dismissNativeNotification();
        prevActiveGoalRef.current = null;
        setActiveGoalSession(null);
      }
    } catch {}

    setVerifyingGoal(null);
    setDetailGoal(null);

    const nowIso = new Date().toISOString();
    const nextGoals = goals.map((g) =>
      g.id === goal.id
        ? { ...g, status: "done" as GoalStatusValue, updatedAt: nowIso }
        : g,
    );
    saveLocalGoals(nextGoals);
    queryClient.setQueryData(getListGoalsQueryKey(), nextGoals);
    void syncGoalAutomation(nextGoals);

    try {
      if (!goal.id.startsWith("local-")) {
        await updateGoal.mutateAsync({ id: goal.id, data: { status: "done" } });
        await queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
        refetch();
        void syncGuiltNotifications(true);
      } else {
        // Goal had a local-* id; persist to server and mark done so Analytics sees it!
        const created: any = await createGoal.mutateAsync({
          data: {
            title: goal.title,
            intent: goal.intent || undefined,
            type: goal.type,
            priority: goal.priority,
            startTime: goal.startTime,
            durationMinutes: goal.durationMinutes,
            scheduledDate: goal.scheduledDate || undefined,
            blockApps: goal.blockApps ?? true,
          },
        });
        if (created?.id) {
          await updateGoal.mutateAsync({ id: created.id, data: { status: "done" } });
          await queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
          refetch();
        }
      }
    } catch (e) {
      console.warn("Saved goal completion locally:", e);
    }
  };

  const handleAdmitNotCompleted = (goal: Goal) => {
    try {
      stopNativeCompletionAlarm();
    } catch {}
    setVerifyingGoal(null);
    setDetailGoal(null);
    setForfeitingGoal(goal);
  };

  const handlePullRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.selectionAsync();
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handlePullRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
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
            isActiveNow={activeGoalSession?.goal.id === g.id}
            remainingSeconds={
              activeGoalSession?.goal.id === g.id
                ? activeGoalSession.remainingSeconds
                : undefined
            }
            onDelete={() => handleDeleteGoal(g)}
            onPress={() => { Haptics.selectionAsync(); setDetailGoal(g); }}
            onEdit={() => handleEditGoal(g)}
          />
        ))}
      </Animated.ScrollView>

      {/* FAB */}
      {!activeGoalSession && (
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
      )}

      {/* ── Zen Black Goal Screen (Automatically active during Goal Duration, only ONE Forfeit button) ── */}
      {activeGoalSession && (
        <View
          style={[
            styles.zenBlackScreen,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 36 },
          ]}
        >
          {/* Top subtle bar */}
          <View style={styles.zenTopRow}>
            <View style={styles.zenBadge}>
              <View style={[styles.zenDot, { backgroundColor: "#22c55e" }]} />
              <Text style={styles.zenBadgeText}>GOAL ACTIVE</Text>
            </View>
            {activeGoalSession.goal.blockApps !== false && (
              <View style={styles.zenLockBadge}>
                <MaterialIcons name="lock" size={13} color="#737373" />
                <Text style={styles.zenLockText}>Top apps locked</Text>
              </View>
            )}
          </View>

          {/* Center countdown timer and goal title */}
          <View style={styles.zenCenter}>
            <Text style={styles.zenTimerDigits}>
              {formatCountdown(activeGoalSession.remainingSeconds)}
            </Text>
            <Text style={styles.zenIntention}>
              {activeGoalSession.goal.title.toUpperCase()}
            </Text>
          </View>

          {/* Bottom: ONLY ONE Forfeit button to forfeit the goal */}
          <View style={styles.zenBottomActions}>
            <TouchableOpacity
              style={styles.zenForfeitSingleBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setForfeitingGoal(activeGoalSession.goal);
              }}
              activeOpacity={0.75}
            >
              <MaterialIcons name="stop" size={20} color="#ef4444" />
              <Text style={styles.zenEndBtnText}>Forfeit</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
        onDone={() => detailGoal && handleRequestCompleteGoal(detailGoal)}
        onForfeit={() => {
          if (detailGoal) {
            const g = detailGoal;
            setDetailGoal(null);
            setForfeitingGoal(g);
          }
        }}
      />

      {/* Modal 2b — Strict Honesty & Regret Verification Popup */}
      <GoalCompletionVerifyModal
        goal={verifyingGoal}
        onConfirmTrulyDone={handleConfirmTrulyDone}
        onAdmitNotCompleted={handleAdmitNotCompleted}
        onClose={() => {
          try {
            stopNativeCompletionAlarm();
          } catch {}
          setVerifyingGoal(null);
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
  drumContainer: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e4e4e7" },
  drumColon:     { fontSize: 22, fontFamily: "Inter_700Bold", color: "#111", marginBottom: 2, marginHorizontal: 4 },
  wheelSectionCard: {
    backgroundColor: "#f4f4f5",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e4e4e7",
    gap: 8,
  },
  wheelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  wheelValueBadge: {
    backgroundColor: "#000",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  wheelValueBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },

  // Zen Black Goal Screen (identical to Focus Session black screen with single Forfeit button)
  zenBlackScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    zIndex: 999,
    paddingHorizontal: 28,
    justifyContent: "space-between",
  },
  zenTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  zenBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.25)",
  },
  zenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  zenBadgeText: {
    color: "#22c55e",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  zenLockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#141414",
  },
  zenLockText: {
    color: "#737373",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  zenCenter: {
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  zenTimerDigits: {
    color: "#ffffff",
    fontSize: 72,
    fontFamily: "Inter_700Bold",
    letterSpacing: -3,
  },
  zenIntention: {
    color: "#737373",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 3,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  zenBottomActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  zenForfeitSingleBtn: {
    height: 56,
    paddingHorizontal: 36,
    borderRadius: 999,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(239, 68, 68, 0.45)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  zenEndBtnText: {
    color: "#ef4444",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },

  // Active Goal Focus-Style Timer Banner
  activeTimerCard: {
    backgroundColor: "#0a0a0c",
    borderRadius: 26,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  activeTimerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeTimerLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(34, 197, 94, 0.14)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  activeTimerPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
  activeTimerLiveText: {
    color: "#22c55e",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  activeTimerPrioBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activeTimerPrioText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  activeTimerGoalTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  activeTimerClockWrap: {
    alignItems: "center",
    paddingVertical: 8,
  },
  activeTimerDigits: {
    color: "#ffffff",
    fontSize: 48,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1.5,
  },
  activeTimerSubLabel: {
    color: "#a1a1aa",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
    marginTop: 2,
  },
  activeTimerProgressTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 3,
    overflow: "hidden",
  },
  activeTimerProgressFill: {
    height: "100%",
    backgroundColor: "#22c55e",
    borderRadius: 3,
  },
  activeTimerLockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  activeTimerLockText: {
    color: "#a1a1aa",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  activeTimerBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  activeTimerForfeitBtn: {
    flex: 0.44,
    height: 48,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#ef4444",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  activeTimerForfeitText: {
    color: "#ef4444",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  activeTimerDoneBtn: {
    flex: 0.56,
    height: 48,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  activeTimerDoneText: {
    color: "#000000",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },

  // Strict Honesty & Regret Goal Completion Verification Modal
  verifyOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  verifyCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderColor: "#ef4444",
  },
  verifyWarningIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  verifyStrictPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fef2f2",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  verifyStrictPillText: {
    color: "#dc2626",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.1,
  },
  verifyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#0a0a0a",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  verifyRegretBox: {
    backgroundColor: "#fff1f2",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
  verifyRegretText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#881337",
    lineHeight: 19,
    textAlign: "center",
  },
  verifyConfirmBtn: {
    width: "100%",
    height: 52,
    borderRadius: 999,
    backgroundColor: "#16a34a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  verifyConfirmBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  verifyForfeitBtn: {
    width: "100%",
    height: 50,
    borderRadius: 999,
    backgroundColor: "#fef2f2",
    borderWidth: 1.5,
    borderColor: "#ef4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  verifyForfeitBtnText: {
    color: "#dc2626",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },

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
    borderWidth: 1,
    borderColor: "#e4e4e7",
  },
  filterCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 28,
    borderWidth: 1,
    borderColor: "#e4e4e7",
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
