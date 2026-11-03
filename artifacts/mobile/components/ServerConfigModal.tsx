import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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

import { customFetch, setBaseUrl } from "@workspace/api-client-react";

interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onConnected?: (url: string) => void;
}

export const SERVER_STORAGE_KEY = "@hadaf_server_url";

export default function ServerConfigModal({
  visible,
  onClose,
  onConnected,
}: ServerConfigModalProps) {
  const [inputUrl, setInputUrl] = useState("192.168.1.101:5000");
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(SERVER_STORAGE_KEY).then((stored) => {
        if (stored) {
          setInputUrl(stored.replace(/^https?:\/\//, ""));
        }
      });
      setStatusMsg(null);
      scale.value = withSpring(1, { damping: 20, stiffness: 160 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      scale.value = 0.92;
      opacity.value = 0;
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handleConnect = async () => {
    let clean = inputUrl.trim();
    if (!clean) return;

    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `http://${clean}`;
    }
    // Remove trailing slashes
    clean = clean.replace(/\/+$/, "");

    setTesting(true);
    setStatusMsg(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${clean}/api/healthz`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        await AsyncStorage.setItem(SERVER_STORAGE_KEY, clean);
        setBaseUrl(clean);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStatusMsg({ text: "Connected successfully!", ok: true });
        onConnected?.(clean);
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        throw new Error(`Server returned status ${res.status}`);
      }
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Still allow saving in case backend was just momentarily sleeping
      await AsyncStorage.setItem(SERVER_STORAGE_KEY, clean);
      setBaseUrl(clean);
      setStatusMsg({
        text: `Saved, but server unreachable (${e.message || "timeout"}). Ensure laptop & phone are on the same Wi-Fi.`,
        ok: false,
      });
    } finally {
      setTesting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View style={[styles.card, animStyle]}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="dns" size={26} color="#000" />
          </View>

          <Text style={styles.title}>Connect Local Server</Text>
          <Text style={styles.subtitle}>
            Enter your laptop's Wi-Fi IP and port 5000 so the app connects to your backend.
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.prefix}>http://</Text>
            <TextInput
              style={styles.input}
              value={inputUrl}
              onChangeText={setInputUrl}
              placeholder="192.168.1.101:5000"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          {statusMsg && (
            <View
              style={[
                styles.statusBox,
                statusMsg.ok ? styles.statusOk : styles.statusErr,
              ]}
            >
              <MaterialIcons
                name={statusMsg.ok ? "check-circle" : "warning"}
                size={16}
                color={statusMsg.ok ? "#16a34a" : "#dc2626"}
              />
              <Text
                style={[
                  styles.statusText,
                  statusMsg.ok ? { color: "#16a34a" } : { color: "#dc2626" },
                ]}
              >
                {statusMsg.text}
              </Text>
            </View>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.connectBtn}
              onPress={handleConnect}
              disabled={testing}
              activeOpacity={0.85}
            >
              {testing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.connectBtnText}>Save & Connect</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  iconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#000",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    marginBottom: 14,
  },
  prefix: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#9ca3af",
    marginRight: 2,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#111827",
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  statusOk: {
    backgroundColor: "#dcfce7",
  },
  statusErr: {
    backgroundColor: "#fee2e2",
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 16,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 0.38,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#4b5563",
  },
  connectBtn: {
    flex: 0.62,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
  },
  connectBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
  },
});

