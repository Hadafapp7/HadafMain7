import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { customFetch } from "@workspace/api-client-react";

interface ForfeitModalProps {
  visible: boolean;
  type: "focus" | "goal";
  context?: {
    plannedMinutes?: number;
    elapsedMinutes?: number;
    title?: string;
  };
  onClose: () => void;
  onForfeited: (reason: string, roast: string) => Promise<void> | void;
}

const DEFAULT_FOCUS_REASONS = [
  "Tired / Lost motivation",
  "Checking social media",
  "Bored / Mind wandering",
  "Medical emergency",
  "Urgent work call",
];

const DEFAULT_GOAL_REASONS = [
  "Too lazy to do it today",
  "Lost interest in this goal",
  "Ran out of time",
  "Family emergency",
  "Unavoidable work conflict",
];

export default function ForfeitModal({
  visible,
  type,
  context,
  onClose,
  onForfeited,
}: ForfeitModalProps) {
  const [selectedChip, setSelectedChip] = useState<string>("");
  const [customText, setCustomText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [roastResult, setRoastResult] = useState<{
    isLame: boolean;
    roast: string;
    title: string;
  } | null>(null);

  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 18, stiffness: 140 });
      opacity.value = withTiming(1, { duration: 200 });
      setSelectedChip("");
      setCustomText("");
      setRoastResult(null);
      setLoading(false);
    } else {
      scale.value = 0.9;
      opacity.value = 0;
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const reasonList = type === "focus" ? DEFAULT_FOCUS_REASONS : DEFAULT_GOAL_REASONS;
  const activeReason = customText.trim() || selectedChip || "No reason provided";

  const handleEvaluateAndForfeit = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setLoading(true);

    try {
      const res = await customFetch<{
        isLame: boolean;
        roast: string;
        title: string;
      }>("/api/coach/evaluate-forfeit", {
        method: "POST",
        body: JSON.stringify({
          type,
          reason: activeReason,
          context,
        }),
      });

      if (res?.roast) {
        setRoastResult(res);
      } else {
        setRoastResult({
          isLame: true,
          roast: "You gave up on your commitment. Distraction just defeated you again.",
          title: "Session Forfeited",
        });
      }
    } catch (e: any) {
      setRoastResult({
        isLame: true,
        roast: `You couldn't finish your ${type === "focus" ? "focus session" : "goal"}. Excuses won't build your life.`,
        title: "Commitment Abandoned",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeRoast = async () => {
    Haptics.selectionAsync();
    const finalRoast = roastResult?.roast || "";
    await onForfeited(activeReason, finalRoast);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={roastResult ? undefined : onClose} />

        <Animated.View style={[styles.card, sheetStyle]}>
          {!roastResult ? (
            /* STEP 1: Reason Selection */
            <>
              <View style={styles.topIconWrap}>
                <MaterialIcons name="warning" size={26} color="#ef4444" />
              </View>

              <Text style={styles.title}>
                Abandon {type === "focus" ? "Focus Session" : "Goal"}?
              </Text>
              <Text style={styles.subtitle}>
                Give your honest reason. Hadaf AI will evaluate your discipline.
              </Text>

              {/* Quick Reason Chips */}
              <View style={styles.chipsWrap}>
                {reasonList.map((r) => {
                  const sel = selectedChip === r && !customText;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, sel && styles.chipSelected]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedChip(r);
                        setCustomText("");
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, sel && styles.chipTextSelected]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Custom Input */}
              <TextInput
                style={styles.textInput}
                placeholder="Or type a specific reason..."
                placeholderTextColor="#999"
                value={customText}
                onChangeText={(t) => {
                  setCustomText(t);
                  if (t) setSelectedChip("");
                }}
                maxLength={120}
              />

              {/* Action Buttons */}
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onClose();
                  }}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Stay Locked In</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.forfeitBtn, loading && { opacity: 0.7 }]}
                  onPress={handleEvaluateAndForfeit}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.forfeitBtnText}>Forfeit</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* STEP 2: Strict AI Reality Check Roast */
            <>
              <View
                style={[
                  styles.topIconWrap,
                  { backgroundColor: roastResult.isLame ? "#fdeceb" : "#e8f7ee" },
                ]}
              >
                <MaterialIcons
                  name={roastResult.isLame ? "bolt" : "check"}
                  size={26}
                  color={roastResult.isLame ? "#ef4444" : "#15803d"}
                />
              </View>

              <Text style={styles.title}>{roastResult.title}</Text>
              <View
                style={[
                  styles.roastBox,
                  { backgroundColor: roastResult.isLame ? "rgba(239, 68, 68, 0.08)" : "rgba(21, 128, 61, 0.08)" },
                ]}
              >
                <Text style={styles.roastText}>{roastResult.roast}</Text>
              </View>

              <TouchableOpacity
                style={styles.roastAcknowledgeBtn}
                onPress={handleAcknowledgeRoast}
                activeOpacity={0.85}
              >
                <Text style={styles.roastAcknowledgeText}>Accept Reality & Forfeit</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 16,
  },
  topIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fdeceb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#0a0a0a",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#71717a",
    textAlign: "center",
    lineHeight: 17,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    marginVertical: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "#f4f4f5",
    borderWidth: 1,
    borderColor: "#e4e4e7",
  },
  chipSelected: {
    backgroundColor: "#0a0a0a",
    borderColor: "#0a0a0a",
  },
  chipText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#52525b",
  },
  chipTextSelected: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
  },
  textInput: {
    width: "100%",
    backgroundColor: "#fafafa",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#000",
    borderWidth: 1,
    borderColor: "#e4e4e7",
  },
  btnRow: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  forfeitBtn: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  forfeitBtnText: {
    color: "#ef4444",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  roastBox: {
    width: "100%",
    borderRadius: 14,
    padding: 14,
    marginVertical: 6,
  },
  roastText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#18181b",
    lineHeight: 19,
    textAlign: "center",
  },
  roastAcknowledgeBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  roastAcknowledgeText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
