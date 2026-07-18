import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActionSheetIOS,
  Alert,
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

const isWeb = Platform.OS === "web";
const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];

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
          <Text style={styles.fieldText}>{value}</Text>
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

export default function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 0 : insets.top;

  const [name,   setName]   = useState("Julian Stark");
  const [email,  setEmail]  = useState("julian.stark@monolith.io");
  const [phone,  setPhone]  = useState("+1 (555) 890-2341");
  const [gender, setGender] = useState("Male");
  const [age,    setAge]    = useState("28");

  const openGenderPicker = () => {
    Haptics.selectionAsync();
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...GENDER_OPTIONS, "Cancel"], cancelButtonIndex: GENDER_OPTIONS.length },
        (idx) => { if (idx < GENDER_OPTIONS.length) setGender(GENDER_OPTIONS[idx]); }
      );
    } else {
      Alert.alert("Select Gender", undefined,
        [...GENDER_OPTIONS.map(g => ({ text: g, onPress: () => setGender(g) })), { text: "Cancel", style: "cancel" }]
      );
    }
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Your profile has been updated.");
  };

  return (
    <View style={styles.root}>
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
          <Animated.View entering={isWeb ? undefined : FadeInDown.delay(0).springify()} style={styles.avatarSection}>
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
          </Animated.View>

          {/* Form */}
          <Animated.View entering={isWeb ? undefined : FadeInDown.delay(80).springify()} style={styles.form}>
            <FormField label="NAME"         value={name}   onChangeText={setName} />
            <FormField label="EMAIL"        value={email}  onChangeText={setEmail}  keyboardType="email-address" />
            <FormField label="PHONE NUMBER" value={phone}  onChangeText={setPhone}  keyboardType="phone-pad" />
            <FormField label="GENDER"       value={gender} onPress={openGenderPicker} />
            <FormField label="AGE"          value={age}    onChangeText={setAge}    keyboardType="numeric" />
          </Animated.View>

          {/* Save */}
          <Animated.View entering={isWeb ? undefined : FadeInDown.delay(160).springify()}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
              <Text style={styles.saveBtnText}>SAVE CHANGES</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
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

  fieldWrap:  { gap: 8 },
  fieldLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#555", letterSpacing: 2 },
  fieldInput: {
    backgroundColor: "#f0f0f0", borderRadius: 16,
    paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 15, fontFamily: "Inter_400Regular", color: "#000",
  },
  fieldText:  { fontSize: 15, fontFamily: "Inter_400Regular", color: "#000" },

  saveBtn: {
    backgroundColor: "#000", borderRadius: 999,
    height: 56, alignItems: "center", justifyContent: "center",
    marginTop: 8,
  },
  saveBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 2 },
});
