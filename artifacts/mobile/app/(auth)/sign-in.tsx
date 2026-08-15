import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
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

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const otpRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);

  const sendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }
    if (!signInLoaded || !signUpLoaded) return;
    Keyboard.dismiss();
    setLoading(true);
    setError(null);

    try {
      await signIn!.create({ strategy: "email_code", identifier: trimmed });
      setIsSignUp(false);
      setStep("otp");
      setTimeout(() => otpRef.current?.focus(), 200);
    } catch {
      try {
        await signUp!.create({ emailAddress: trimmed });
        await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
        setIsSignUp(true);
        setStep("otp");
        setTimeout(() => otpRef.current?.focus(), 200);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Could not send the code. Check the email address and try again.";
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (codeOverride?: string) => {
    const code = codeOverride ?? otp;
    if (code.length < 6) {
      setError("Please enter the 6-digit code.");
      return;
    }
    if (!signInLoaded || !signUpLoaded) return;
    Keyboard.dismiss();
    setLoading(true);
    setError(null);

    console.log("[Verification] Starting code verification...", {
      isSignUp,
      code,
      publishableKeyExists: !!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      proxyUrl: process.env.EXPO_PUBLIC_CLERK_PROXY_URL,
    });

    try {
      if (isSignUp) {
        console.log("[Verification] Calling signUp!.attemptEmailAddressVerification...");
        const result = await signUp!.attemptEmailAddressVerification({ code });
        console.log("[Verification] SignUp Attempt Result:", JSON.stringify(result, null, 2));
        
        if (result.status === "complete" && result.createdSessionId) {
          console.log("[Verification] SignUp verification successful, setting session active:", result.createdSessionId);
          await setActive!({ session: result.createdSessionId });
        } else {
          const detailMsg = `SignUp Verification Incomplete: status=${result.status}, requiredFields=${JSON.stringify(result.requiredFields || [])}`;
          console.warn("[Verification]", detailMsg);
          setError(`Verification incomplete (status: ${result.status}).\nRequired fields: ${JSON.stringify(result.requiredFields || [])}`);
        }
      } else {
        console.log("[Verification] Calling signIn!.attemptFirstFactor...");
        const result = await signIn!.attemptFirstFactor({
          strategy: "email_code",
          code,
        });
        console.log("[Verification] SignIn Attempt Result:", JSON.stringify(result, null, 2));

        if (result.status === "complete" && result.createdSessionId) {
          console.log("[Verification] SignIn verification successful, setting session active:", result.createdSessionId);
          await setActive!({ session: result.createdSessionId });
        } else {
          const detailMsg = `SignIn Verification Incomplete: status=${result.status}`;
          console.warn("[Verification]", detailMsg);
          setError(`Verification incomplete (status: ${result.status}).`);
        }
      }
    } catch (err: unknown) {
      console.error("[Verification] Exception caught during verification:", err);
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
      verifyCode(digits);
    }
  };

  const goBack = () => {
    setStep("email");
    setOtp("");
    setError(null);
    setTimeout(() => emailRef.current?.focus(), 200);
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
          {step === "email" ? (
            <>
              <Text style={[styles.label, { color: colors.foreground }]}>
                Enter your email address
              </Text>

              <TextInput
                ref={emailRef}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  setError(null);
                }}
                onSubmitEditing={sendCode}
                returnKeyType="send"
                autoFocus
              />

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
                onPress={sendCode}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: colors.primaryForeground },
                    ]}
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
                    Check your email
                  </Text>
                  <Text style={[styles.otpSub, { color: colors.mutedForeground }]}>
                    We sent a 6-digit code to {email.trim().toLowerCase()}
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
                        style={[
                          styles.cursor,
                          { backgroundColor: colors.primary },
                        ]}
                      />
                    )}
                  </Pressable>
                ))}

                <TextInput
                  ref={otpRef}
                  value={otp}
                  onChangeText={handleOTPChange}
                  onSubmitEditing={() => verifyCode(otp)}
                  keyboardType="number-pad"
                  returnKeyType="done"
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

              <TouchableOpacity onPress={sendCode} disabled={loading}>
                <Text style={[styles.resend, { color: colors.mutedForeground }]}>
                  Didn't receive a code?{" "}
                  <Text style={{ color: colors.primary }}>Resend</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={[styles.terms, { color: colors.mutedForeground }]}>
            By continuing you agree to keep your focus goals just between you and
            Hadaf.
          </Text>
        </View>
      </View>
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
  input: {
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
    gap: 4,
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
});
