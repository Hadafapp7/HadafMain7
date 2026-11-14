import { useAuth } from "@clerk/expo";
import { MaterialIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import KeyboardFloatingPreview, { useKeyboardState } from "@/components/KeyboardFloatingPreview";

const isWeb = Platform.OS === "web";
const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

const cleanError = (e: any): string =>
  String(e?.message ?? "Something went wrong. Please try again.").replace(/^HTTP \d+\s*:?\s*/i, "");

/**
 * Shown right after sign-in while the profile is incomplete (no name / no email).
 * Phone-number logins start with an empty email, so this is where we collect it.
 * The app's tabs stay locked until this is saved (see the guard in app/_layout.tsx).
 */
export default function CompleteProfileScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ["userMe"],
    queryFn: () => customFetch<any>("/api/users/me"),
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [focusedField, setFocusedField] = useState<"name" | "email" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);
  const emailInputRef = useRef<TextInput>(null);
  const { isKeyboardVisible } = useKeyboardState();

  useEffect(() => {
    if (me && !hydrated.current) {
      hydrated.current = true;
      setName(me.name || "");
      setEmail(me.email || "");
    }
  }, [me]);

  const emailLocked = Boolean(me?.email);

  const handleSave = async () => {
    Keyboard.dismiss();
    setError(null);

    const nameClean = name.trim();
    const emailClean = email.trim();

    if (nameClean.length < 2) {
      setError("Please enter your name.");
      return;
    }
    if (!emailLocked) {
      if (!emailClean) {
        setError("Please enter your email address.");
        return;
      }
      if (!EMAIL_REGEX.test(emailClean)) {
        setError("Enter a valid email using lowercase letters only (e.g. name@gmail.com).");
        return;
      }
    }

    setSaving(true);
    try {
      await customFetch("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: nameClean,
          ...(emailLocked ? {} : { email: emailClean }),
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.invalidateQueries({ queryKey: ["userMe"] });
    } catch (e: any) {
      console.log("[CompleteProfile] Save failed (handled):", e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(cleanError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: (isWeb ? 0 : insets.top) + (isKeyboardVisible ? 16 : 56),
            paddingBottom: insets.bottom + (isKeyboardVisible ? 90 : 32),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={isWeb ? undefined : FadeInDown.springify()}
          style={[styles.hero, isKeyboardVisible && { gap: 4 }]}
        >
          {!isKeyboardVisible && (
            <View style={styles.iconWrap}>
              <MaterialIcons name="person-add-alt-1" size={30} color="#fff" />
            </View>
          )}
          <Text style={[styles.title, isKeyboardVisible && { fontSize: 20 }]}>
            Complete your profile
          </Text>
          {!isKeyboardVisible && (
            <Text style={styles.subtitle}>
              Just two quick details before you start. We use your email for account, payment and update notifications.
            </Text>
          )}
        </Animated.View>

        <Animated.View entering={isWeb ? undefined : FadeInDown.delay(80).springify()} style={styles.card}>
          <Text
            style={[
              styles.label,
              focusedField === "name" && { color: "#FFFFFF" },
            ]}
          >
            FULL NAME
          </Text>
          <TextInput
            style={[
              styles.input,
              focusedField === "name" && styles.inputFocused,
            ]}
            value={name}
            onFocus={() => setFocusedField("name")}
            onBlur={() => setFocusedField((f) => (f === "name" ? null : f))}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            placeholder="Your name"
            placeholderTextColor="#aaa"
            autoCapitalize="words"
            returnKeyType={emailLocked ? "done" : "next"}
            onSubmitEditing={() => {
              if (!emailLocked) {
                emailInputRef.current?.focus();
              } else {
                handleSave();
              }
            }}
          />

          <Text
            style={[
              styles.label,
              { marginTop: 18 },
              focusedField === "email" && { color: "#FFFFFF" },
            ]}
          >
            EMAIL ADDRESS
          </Text>
          <TextInput
            ref={emailInputRef}
            style={[
              styles.input,
              emailLocked && styles.inputLocked,
              focusedField === "email" && styles.inputFocused,
            ]}
            value={email}
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField((f) => (f === "email" ? null : f))}
            onChangeText={(v) => {
              setEmail(v);
              setError(null);
            }}
            editable={!emailLocked}
            placeholder="name@example.com"
            placeholderTextColor="#aaa"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            activeOpacity={0.85}
            disabled={saving}
            onPress={handleSave}
          >
            {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>SAVE & CONTINUE</Text>}
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity onPress={() => signOut()} hitSlop={10} style={{ alignSelf: "center", marginTop: 8 }}>
          <Text style={styles.signOut}>Use a different account</Text>
        </TouchableOpacity>
      </ScrollView>

      <KeyboardFloatingPreview
        label={
          focusedField === "name"
            ? "Full Name"
            : focusedField === "email"
              ? "Email Address"
              : null
        }
        value={focusedField === "name" ? name : email}
        placeholder={
          focusedField === "name" ? "Enter your full name..." : "name@example.com"
        }
        actionLabel={focusedField === "name" && !emailLocked ? "Next" : "Save"}
        onSubmit={() => {
          if (focusedField === "name" && !emailLocked) {
            emailInputRef.current?.focus();
          } else {
            handleSave();
          }
        }}
        insideKeyboardAvoiding
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0D0D0D" },
  content: { paddingHorizontal: 22, gap: 24 },
  hero: { alignItems: "center", gap: 12 },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "#1F1F1F",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#FFFFFF", letterSpacing: -0.5 },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  card: { backgroundColor: "#1A1A1A", borderRadius: 22, padding: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  label: { fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.5)", letterSpacing: 2.5, marginBottom: 8 },
  input: {
    backgroundColor: "#262626",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputFocused: {
    borderColor: "#FFFFFF",
    backgroundColor: "#2D2D2D",
  },
  inputLocked: { color: "rgba(255,255,255,0.4)" },
  error: { color: "#ff6b6b", fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 14, lineHeight: 19 },
  saveBtn: {
    marginTop: 22,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: { color: "#000000", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  signOut: { fontSize: 13, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)", textDecorationLine: "underline" },
});
