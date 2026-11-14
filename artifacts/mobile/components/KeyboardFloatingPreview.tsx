import { MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export function useKeyboardState() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 280);
      setIsKeyboardVisible(true);
    };

    const onHide = () => {
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
    };

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  return { keyboardHeight, isKeyboardVisible };
}

interface KeyboardFloatingPreviewProps {
  /** Label of the currently focused input (e.g. "PHONE NUMBER", "EMAIL ADDRESS", "FULL NAME"). Pass null/undefined when no input is focused. */
  label?: string | null;
  /** Current text value of the focused input */
  value?: string;
  /** Placeholder when value is empty */
  placeholder?: string;
  /** Optional prefix (e.g., "+91 " for phone numbers) */
  prefix?: string;
  /** Optional callback when the user taps the action button on the bar */
  onSubmit?: () => void;
  /** Label for the action button (defaults to "Done") */
  actionLabel?: string;
  /** Whether the parent container already resizes/shifts with the keyboard */
  insideKeyboardAvoiding?: boolean;
}

/**
 * Dynamic floating bar that docks right above the keyboard whenever a user is typing,
 * showing the field label and live value so the user can always see what they are typing.
 */
export default function KeyboardFloatingPreview({
  label,
  value = "",
  placeholder = "Typing...",
  prefix = "",
  onSubmit,
  actionLabel = "Done",
  insideKeyboardAvoiding = false,
}: KeyboardFloatingPreviewProps) {
  const { keyboardHeight, isKeyboardVisible } = useKeyboardState();

  if (!label || !isKeyboardVisible) {
    return null;
  }

  const bottomOffset =
    Platform.OS === "ios" && !insideKeyboardAvoiding ? keyboardHeight : 0;

  return (
    <View
      style={[
        styles.wrapper,
        bottomOffset > 0 ? { bottom: bottomOffset } : { bottom: 0 },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.bar}>
        <View style={styles.textColumn}>
          <View style={styles.labelRow}>
            <View style={styles.activeDot} />
            <Text style={styles.labelText} numberOfLines={1}>
              {label.toUpperCase()}
            </Text>
          </View>
          <Text
            style={[styles.valueText, !value && styles.placeholderText]}
            numberOfLines={2}
          >
            {value ? `${prefix}${value}` : placeholder}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => {
            if (onSubmit) {
              onSubmit();
            } else {
              Keyboard.dismiss();
            }
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.doneBtnText}>{actionLabel}</Text>
          <MaterialIcons name="check" size={14} color="#0D0D0D" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 999,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#141414",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 18,
    gap: 12,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  labelText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.8,
    color: "rgba(255,255,255,0.65)",
  },
  valueText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  placeholderText: {
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Inter_400Regular",
  },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  doneBtnText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#0D0D0D",
  },
});

