import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import React, { useState, useEffect, useRef } from "react";
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
  Modal,
  Pressable,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { customFetch } from "@workspace/api-client-react";

const isWeb = Platform.OS === "web";

function FormField({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  editable = true,
  onPress,
}: {
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
  editable?: boolean;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TouchableOpacity style={styles.fieldInput} onPress={onPress} activeOpacity={0.75}>
          <Text style={styles.fieldText}>{value || "Select"}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        editable={editable}
        returnKeyType="done"
        placeholderTextColor="#aaa"
      />
    </View>
  );
}

const maskPhoneNumber = (phoneStr: string) => {
  if (!phoneStr) return "";
  const clean = phoneStr.replace(/[\s-]/g, "");
  if (clean.startsWith("+91") && clean.length === 13) {
    return `+91-${clean.substring(3, 4)}XXXXXXXX${clean.substring(11)}`;
  }
  if (clean.length > 6) {
    const firstPart = clean.substring(0, 3);
    const lastPart = clean.substring(clean.length - 2);
    const maskedLength = clean.length - 5;
    const mask = "X".repeat(maskedLength);
    return `${firstPart}-${mask}${lastPart}`;
  }
  return clean;
};

export default function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 0 : insets.top;

  const { data: userProfile, isLoading, refetch } = useQuery({
    queryKey: ["userMe"],
    queryFn: () => customFetch<any>("/api/users/me"),
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Custom picker modal
  const [showGenderModal, setShowGenderModal] = useState(false);

  // Custom Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "warning" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "warning") => {
    setToast({ message, type });
    Haptics.notificationAsync(
      type === "success"
        ? Haptics.NotificationFeedbackType.Success
        : type === "error"
          ? Haptics.NotificationFeedbackType.Error
          : Haptics.NotificationFeedbackType.Warning
    );
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  useEffect(() => {
    if (userProfile) {
      setName(userProfile.name || "");
      setEmail(userProfile.email || "");
      setPhone(userProfile.phone || "");
      setGender(userProfile.gender || "");
      setAge(userProfile.age || "");
    }
  }, [userProfile]);

  const handleSave = async () => {
    setIsSaving(true);
    Keyboard.dismiss();

    // Loading delay to let the user see the verification check animation
    await new Promise((resolve) => setTimeout(resolve, 800));

    // 1. Email format check
    const emailClean = email.trim();
    if (emailClean) {
      const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
      if (!emailRegex.test(emailClean)) {
        setIsSaving(false);
        showToast("Email must contain lowercase letters only.", "error");
        return;
      }
    }

    // 2. Phone format check
    const phoneClean = phone.trim();
    if (phoneClean) {
      if (!phoneClean.startsWith("+")) {
        setIsSaving(false);
        showToast("Phone number must start with '+' and country code.", "error");
        return;
      }
      
      const digitsOnly = phoneClean.replace(/\D/g, "");
      
      // India specific check (exactly 10 digits after +91)
      if (phoneClean.startsWith("+91")) {
        if (digitsOnly.length !== 12) {
          setIsSaving(false);
          showToast("Indian phone number must have exactly 10 digits.", "error");
          return;
        }
      } else {
        // Global length check (7 to 14 digits after country code)
        if (digitsOnly.length < 9 || digitsOnly.length > 15) {
          setIsSaving(false);
          showToast("Invalid phone number length.", "error");
          return;
        }
      }
    }

    try {
      await customFetch("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || null,
          email: emailClean || null,
          phone: phoneClean || null,
          gender: gender || null,
          age: age.trim() || null,
        }),
      });
      showToast("Profile details updated successfully!", "success");
      refetch();
    } catch (err: any) {
      console.log("[Account] Save profile error:", err);
      const errMsg = err?.data?.error || err?.message || "Could not save profile details. Try again.";
      showToast(errMsg, "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Floating Custom Toast Banner */}
      {toast && (
        <View
          style={[
            styles.toastContainer,
            {
              backgroundColor:
                toast.type === "success"
                  ? "#22c55e"
                  : toast.type === "error"
                    ? "#ef4444"
                    : "#f59e0b",
            },
          ]}
        >
          <MaterialIcons
            name={
              toast.type === "success"
                ? "check-circle"
                : toast.type === "error"
                  ? "error"
                  : "warning"
            }
            size={20}
            color="#fff"
          />
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}

      {/* Top App Bar */}
      <View style={[styles.topBar, { paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>ACCOUNT</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingTop: topPad + 72, paddingBottom: 48 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarCircle}>
                <MaterialIcons name="person" size={64} color="#b0b0b0" />
              </View>
              <TouchableOpacity
                style={styles.editBadge}
                onPress={() => Haptics.selectionAsync()}
                activeOpacity={0.8}
              >
                <MaterialIcons name="edit" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.editPhotoLabel}>EDIT PROFILE PHOTO</Text>
          </View>

          {isLoading ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <ActivityIndicator color="#000" size="large" />
            </View>
          ) : (
            <>
              {/* Form */}
              <View style={styles.form}>
                <FormField label="NAME" value={name} onChangeText={setName} />
                <FormField label="EMAIL" value={email} onChangeText={setEmail} keyboardType="email-address" />
                <FormField label="PHONE NUMBER" value={maskPhoneNumber(phone)} editable={false} />
                <FormField label="GENDER" value={gender} onPress={() => setShowGenderModal(true)} />
                <FormField label="AGE" value={age} onChangeText={setAge} keyboardType="numeric" />
              </View>

              {/* Save */}
              <View>
                <TouchableOpacity
                  style={[styles.saveBtn, isSaving && { opacity: 0.7 }]}
                  onPress={handleSave}
                  disabled={isSaving}
                  activeOpacity={0.85}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>SAVE CHANGES</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Gender Picker Bottom Sheet Modal */}
      <Modal
        visible={showGenderModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGenderModal(false)}
      >
        <View style={styles.modalBg}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowGenderModal(false)} />
          <View style={styles.sheetContent}>
            <View style={styles.sheetDragBar} />
            <Text style={styles.sheetTitle}>Select Gender</Text>

            {["Male", "Female", "Prefer not to say"].map((g) => (
              <TouchableOpacity
                key={g}
                style={[
                  styles.sheetOption,
                  gender === g && { backgroundColor: "#f3f3f3" }
                ]}
                onPress={() => {
                  setGender(g);
                  setShowGenderModal(false);
                  Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.sheetOptionText, gender === g && { fontFamily: "Inter_700Bold" }]}>
                  {g}
                </Text>
                {gender === g && (
                  <MaterialIcons name="check" size={20} color="#000" />
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.sheetCancelBtn}
              onPress={() => setShowGenderModal(false)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#f9f9f9" },
  scroll: { flex: 1 },
  content:{ paddingHorizontal: 24, gap: 24 },

  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: "#f3f3f3",
  },
  backBtn:     { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  topBarTitle: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.5, color: "#000" },

  avatarSection: { alignItems: "center", gap: 12 },
  avatarWrap:    { position: "relative" },
  avatarCircle: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: "#1e1e2a",
    alignItems: "center", justifyContent: "center",
  },
  editBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#000",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#f9f9f9",
  },
  editPhotoLabel: {
    fontSize: 10, fontFamily: "Inter_700Bold",
    color: "#888", letterSpacing: 2,
  },

  form: { gap: 16 },
  fieldWrap: { gap: 6 },
  fieldLabel: {
    fontSize: 10, fontFamily: "Inter_700Bold",
    color: "#888", letterSpacing: 1.5,
  },
  fieldInput: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#000",
    borderWidth: 1, borderColor: "#eee",
  },
  fieldText: {
    fontSize: 15, fontFamily: "Inter_400Regular", color: "#000",
  },

  saveBtn: {
    backgroundColor: "#000",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  saveBtnText: {
    fontSize: 13, fontFamily: "Inter_700Bold",
    color: "#fff", letterSpacing: 1.5,
  },

  // Custom Toast styles
  toastContainer: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  toastText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },

  // Bottom sheet modal styles
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 8,
  },
  sheetDragBar: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#e0e0e0",
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#000",
    marginBottom: 8,
  },
  sheetOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  sheetOptionText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#000",
  },
  sheetCancelBtn: {
    marginTop: 12,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCancelText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#888",
  },
});
