import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const COUNTRIES = [
  { dial: "+966", code: "SA", flag: "🇸🇦", name: "Saudi Arabia" },
  { dial: "+971", code: "AE", flag: "🇦🇪", name: "UAE" },
  { dial: "+974", code: "QA", flag: "🇶🇦", name: "Qatar" },
  { dial: "+965", code: "KW", flag: "🇰🇼", name: "Kuwait" },
  { dial: "+973", code: "BH", flag: "🇧🇭", name: "Bahrain" },
  { dial: "+968", code: "OM", flag: "🇴🇲", name: "Oman" },
  { dial: "+962", code: "JO", flag: "🇯🇴", name: "Jordan" },
  { dial: "+20", code: "EG", flag: "🇪🇬", name: "Egypt" },
  { dial: "+961", code: "LB", flag: "🇱🇧", name: "Lebanon" },
  { dial: "+970", code: "PS", flag: "🇵🇸", name: "Palestine" },
  { dial: "+964", code: "IQ", flag: "🇮🇶", name: "Iraq" },
  { dial: "+963", code: "SY", flag: "🇸🇾", name: "Syria" },
  { dial: "+967", code: "YE", flag: "🇾🇪", name: "Yemen" },
  { dial: "+218", code: "LY", flag: "🇱🇾", name: "Libya" },
  { dial: "+216", code: "TN", flag: "🇹🇳", name: "Tunisia" },
  { dial: "+213", code: "DZ", flag: "🇩🇿", name: "Algeria" },
  { dial: "+212", code: "MA", flag: "🇲🇦", name: "Morocco" },
  { dial: "+1", code: "US", flag: "🇺🇸", name: "United States" },
  { dial: "+44", code: "GB", flag: "🇬🇧", name: "United Kingdom" },
  { dial: "+49", code: "DE", flag: "🇩🇪", name: "Germany" },
  { dial: "+33", code: "FR", flag: "🇫🇷", name: "France" },
  { dial: "+39", code: "IT", flag: "🇮🇹", name: "Italy" },
  { dial: "+34", code: "ES", flag: "🇪🇸", name: "Spain" },
  { dial: "+7", code: "RU", flag: "🇷🇺", name: "Russia" },
  { dial: "+91", code: "IN", flag: "🇮🇳", name: "India" },
  { dial: "+92", code: "PK", flag: "🇵🇰", name: "Pakistan" },
  { dial: "+880", code: "BD", flag: "🇧🇩", name: "Bangladesh" },
  { dial: "+90", code: "TR", flag: "🇹🇷", name: "Turkey" },
  { dial: "+98", code: "IR", flag: "🇮🇷", name: "Iran" },
  { dial: "+86", code: "CN", flag: "🇨🇳", name: "China" },
  { dial: "+81", code: "JP", flag: "🇯🇵", name: "Japan" },
  { dial: "+82", code: "KR", flag: "🇰🇷", name: "South Korea" },
  { dial: "+62", code: "ID", flag: "🇮🇩", name: "Indonesia" },
  { dial: "+60", code: "MY", flag: "🇲🇾", name: "Malaysia" },
  { dial: "+65", code: "SG", flag: "🇸🇬", name: "Singapore" },
  { dial: "+27", code: "ZA", flag: "🇿🇦", name: "South Africa" },
  { dial: "+234", code: "NG", flag: "🇳🇬", name: "Nigeria" },
  { dial: "+254", code: "KE", flag: "🇰🇪", name: "Kenya" },
  { dial: "+55", code: "BR", flag: "🇧🇷", name: "Brazil" },
  { dial: "+52", code: "MX", flag: "🇲🇽", name: "Mexico" },
  { dial: "+61", code: "AU", flag: "🇦🇺", name: "Australia" },
  { dial: "+64", code: "NZ", flag: "🇳🇿", name: "New Zealand" },
  { dial: "+31", code: "NL", flag: "🇳🇱", name: "Netherlands" },
  { dial: "+32", code: "BE", flag: "🇧🇪", name: "Belgium" },
  { dial: "+41", code: "CH", flag: "🇨🇭", name: "Switzerland" },
  { dial: "+46", code: "SE", flag: "🇸🇪", name: "Sweden" },
  { dial: "+47", code: "NO", flag: "🇳🇴", name: "Norway" },
  { dial: "+45", code: "DK", flag: "🇩🇰", name: "Denmark" },
  { dial: "+358", code: "FI", flag: "🇫🇮", name: "Finland" },
  { dial: "+48", code: "PL", flag: "🇵🇱", name: "Poland" },
];

type Country = (typeof COUNTRIES)[number];

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();

  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const otpRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  const filteredCountries = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.dial.includes(countrySearch),
  );

  const fullPhone = `${country.dial}${phone.replace(/\D/g, "")}`;

  const sendOTP = async () => {
    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    if (!signInLoaded || !signUpLoaded) return;
    Keyboard.dismiss();
    setLoading(true);
    setError(null);

    try {
      await signIn!.create({ strategy: "phone_code", identifier: fullPhone });
      setIsSignUp(false);
      setStep("otp");
      setTimeout(() => otpRef.current?.focus(), 200);
    } catch {
      try {
        await signUp!.create({ phoneNumber: fullPhone });
        await signUp!.preparePhoneNumberVerification({ strategy: "phone_code" });
        setIsSignUp(true);
        setStep("otp");
        setTimeout(() => otpRef.current?.focus(), 200);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to send verification code. Check the number and try again.";
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (otp.length < 6) {
      setError("Please enter the 6-digit code.");
      return;
    }
    if (!signInLoaded || !signUpLoaded) return;
    Keyboard.dismiss();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const result = await signUp!.attemptPhoneNumberVerification({ code: otp });
        if (result.status === "complete" && result.createdSessionId) {
          await setActive!({ session: result.createdSessionId });
        } else {
          setError("Verification incomplete. Please try again.");
        }
      } else {
        const result = await signIn!.attemptFirstFactor({
          strategy: "phone_code",
          code: otp,
        });
        if (result.status === "complete" && result.createdSessionId) {
          await setActive!({ session: result.createdSessionId });
        } else {
          setError("Verification incomplete. Please try again.");
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Incorrect code. Please try again.";
      setError(msg);
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handleOTPChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 6);
    setOtp(digits);
    setError(null);
    if (digits.length === 6) {
      verifyOTP();
    }
  };

  const goBack = () => {
    setStep("phone");
    setOtp("");
    setError(null);
    setTimeout(() => phoneRef.current?.focus(), 200);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top + 48,
            paddingBottom: insets.bottom + 32,
          },
        ]}
      >
        <View style={styles.hero}>
          <View style={[styles.logoWrap, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons
              name="target"
              size={36}
              color={colors.primaryForeground}
            />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Hadaf</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Set goals. Stay focused. Reach your Hadaf.
          </Text>
        </View>

        <View style={styles.form}>
          {step === "phone" ? (
            <>
              <Text style={[styles.label, { color: colors.foreground }]}>
                Enter your phone number
              </Text>

              <View style={styles.phoneRow}>
                <TouchableOpacity
                  onPress={() => {
                    setCountrySearch("");
                    setPickerVisible(true);
                  }}
                  style={[
                    styles.countryBtn,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.flag}>{country.flag}</Text>
                  <Text style={[styles.dialCode, { color: colors.foreground }]}>
                    {country.dial}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={16}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>

                <TextInput
                  ref={phoneRef}
                  style={[
                    styles.phoneInput,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholder="Phone number"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(t) => {
                    setPhone(t);
                    setError(null);
                  }}
                  onSubmitEditing={sendOTP}
                  returnKeyType="send"
                  autoFocus
                />
              </View>

              {error ? (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {error}
                </Text>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { backgroundColor: colors.primary },
                  loading && styles.disabledBtn,
                ]}
                onPress={sendOTP}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text
                    style={[styles.primaryBtnText, { color: colors.primaryForeground }]}
                  >
                    Send Code
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.otpHeader}>
                <TouchableOpacity onPress={goBack} hitSlop={12}>
                  <MaterialCommunityIcons
                    name="arrow-left"
                    size={22}
                    color={colors.foreground}
                  />
                </TouchableOpacity>
                <View style={styles.otpHeaderText}>
                  <Text style={[styles.label, { color: colors.foreground }]}>
                    Verification code
                  </Text>
                  <Text style={[styles.otpSub, { color: colors.mutedForeground }]}>
                    Sent to {fullPhone}
                  </Text>
                </View>
              </View>

              <View style={styles.otpContainer}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Pressable
                    key={i}
                    onPress={() => otpRef.current?.focus()}
                    style={[
                      styles.otpBox,
                      {
                        backgroundColor: colors.card,
                        borderColor:
                          otp.length === i
                            ? colors.primary
                            : otp.length > i
                              ? colors.border
                              : colors.outlineVariant,
                      },
                    ]}
                  >
                    <Text style={[styles.otpDigit, { color: colors.foreground }]}>
                      {otp[i] ?? ""}
                    </Text>
                    {otp.length === i && (
                      <View
                        style={[styles.cursor, { backgroundColor: colors.primary }]}
                      />
                    )}
                  </Pressable>
                ))}

                <TextInput
                  ref={otpRef}
                  value={otp}
                  onChangeText={handleOTPChange}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.hiddenInput}
                  autoFocus
                  caretHidden
                />
              </View>

              {error ? (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {error}
                </Text>
              ) : null}

              {loading ? (
                <ActivityIndicator
                  color={colors.primary}
                  style={{ marginTop: 8 }}
                />
              ) : null}

              <TouchableOpacity onPress={sendOTP} disabled={loading}>
                <Text style={[styles.resend, { color: colors.mutedForeground }]}>
                  Didn't receive a code?{" "}
                  <Text style={{ color: colors.primary }}>Resend</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={[styles.terms, { color: colors.mutedForeground }]}>
            By continuing you agree to keep your focus goals just between you and Hadaf.
          </Text>
        </View>
      </View>

      <Modal
        visible={pickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Select Country
            </Text>
            <TouchableOpacity onPress={() => setPickerVisible(false)}>
              <MaterialCommunityIcons name="close" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.searchWrap,
              { backgroundColor: colors.surfaceContainerLow },
            ]}
          >
            <MaterialCommunityIcons
              name="magnify"
              size={18}
              color={colors.mutedForeground}
            />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search country or dial code…"
              placeholderTextColor={colors.mutedForeground}
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoFocus
              clearButtonMode="while-editing"
            />
          </View>

          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.countryRow,
                  {
                    backgroundColor:
                      item.code === country.code
                        ? colors.accent
                        : "transparent",
                    borderBottomColor: colors.border,
                  },
                ]}
                onPress={() => {
                  setCountry(item);
                  setPickerVisible(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.rowFlag}>{item.flag}</Text>
                <Text
                  style={[styles.rowName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text style={[styles.rowDial, { color: colors.mutedForeground }]}>
                  {item.dial}
                </Text>
                {item.code === country.code && (
                  <MaterialCommunityIcons
                    name="check"
                    size={18}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  hero: {
    alignItems: "center",
    marginTop: 48,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 280,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  phoneRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  countryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 54,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  flag: {
    fontSize: 20,
  },
  dialCode: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  phoneInput: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  primaryBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  error: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  terms: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
  otpHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  otpHeaderText: {
    flex: 1,
    gap: 2,
  },
  otpSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  otpContainer: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 8,
  },
  otpBox: {
    width: 46,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  otpDigit: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
  },
  cursor: {
    position: "absolute",
    bottom: 10,
    width: 2,
    height: 20,
    borderRadius: 1,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  resend: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowFlag: {
    fontSize: 22,
  },
  rowName: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  rowDial: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
