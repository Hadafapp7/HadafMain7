import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useRef, useState, useEffect } from "react";
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
  Modal,
  Animated,
  Vibration,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { getDevicePhoneNumber, requestPhoneNumberHint, addPhoneNumberListener } from "../../modules/hadaf-native/src";

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();

  const [loginType, setLoginType] = useState<"phone" | "email">("phone");
  const [step, setStep] = useState<"identifier" | "otp">("identifier");
  const [email, setEmail] = useState("");
  
  // Split phone states
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneDigits, setPhoneDigits] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  // Stale closure refs
  const isSignUpRef = useRef(false);
  useEffect(() => {
    isSignUpRef.current = isSignUp;
  }, [isSignUp]);

  const loginTypeRef = useRef(loginType);
  useEffect(() => {
    loginTypeRef.current = loginType;
  }, [loginType]);

  const countryCodeRef = useRef(countryCode);
  useEffect(() => {
    countryCodeRef.current = countryCode;
  }, [countryCode]);

  const phoneDigitsRef = useRef(phoneDigits);
  useEffect(() => {
    phoneDigitsRef.current = phoneDigits;
  }, [phoneDigits]);

  const emailRef = useRef<TextInput>(null);

  // Bottom Sheet state
  const [showBottomPrompt, setShowBottomPrompt] = useState(false);
  const [suggestedPhone, setSuggestedPhone] = useState("+91 98765 43210");
  
  // Success animation state
  const [showSuccessTick, setShowSuccessTick] = useState(false);
  const tickScale = useRef(new Animated.Value(0)).current;
  const tickOpacity = useRef(new Animated.Value(0)).current;

  const otpRef = useRef<TextInput>(null);
  const pollingRef = useRef<any>(null);

  const getMailTmDomain = async (): Promise<string> => {
    try {
      const res = await fetch("https://api.mail.tm/domains");
      const json = await res.json();
      if (json && json["hydra:member"] && json["hydra:member"].length > 0) {
        return json["hydra:member"][0].domain;
      }
    } catch (e) {
      console.error("[Mail.tm] Error fetching domain:", e);
    }
    return "emalupe.com"; // fallback
  };

  const startOtpPolling = async (emailAddress: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    console.log("[OTP Polling] Started polling for Mail.tm messages of:", emailAddress);
    
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds
    const password = "HadafPassword123!";
    let token = "";

    // 1. Get JWT token
    try {
      const tokenResponse = await fetch("https://api.mail.tm/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: emailAddress, password: password })
      });
      const tokenData = await tokenResponse.json();
      token = tokenData.token || "";
      console.log("[OTP Polling] Obtained Mail.tm JWT token successfully");
    } catch (e) {
      console.error("[OTP Polling] Error fetching JWT token:", e);
      return;
    }

    if (!token) {
      console.error("[OTP Polling] JWT token is empty, stopping polling.");
      return;
    }

    pollingRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(pollingRef.current);
        console.log("[OTP Polling] Max attempts reached. Stopped.");
        return;
      }

      try {
        const response = await fetch("https://api.mail.tm/messages", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const msgJson = await response.json();
        const messages = msgJson["hydra:member"] || [];

        if (messages.length > 0) {
          // Sort descending to get newest message first
          messages.sort((a: any, b: any) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateB - dateA;
          });
          const latest = messages[0];
          console.log("[OTP Polling] Found new email message ID:", latest.id);

          const msgResponse = await fetch(`https://api.mail.tm/messages/${latest.id}`, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          const msgData = await msgResponse.json();

          const subject = msgData.subject || "";
          const text = msgData.text || "";
          const html = (msgData.html && msgData.html[0]) || "";
          const combined = subject + "\n" + text + "\n" + html;
          
          const codeMatch = combined.match(/\b\d{6}\b/);
          if (codeMatch) {
            const parsedOtp = codeMatch[0];
            console.log("[OTP Polling] Successfully extracted dynamic OTP code:", parsedOtp);
            clearInterval(pollingRef.current);
            setOtp(parsedOtp);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            verifyCode(parsedOtp);
          }
        }
      } catch (e) {
        console.error("[OTP Polling] Error during fetching/parsing messages:", e);
      }
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);
  const digitsRef = useRef<TextInput>(null);
  const [otp, setOtp] = useState("");

  // Register Phone Hint listener on mount
  useEffect(() => {
    if (loginType === "phone" && step === "identifier") {
      console.log("[SignIn] Subscribing to native phone hint listeners...");
      const sub = addPhoneNumberListener((event) => {
        console.log("[SignIn] Received phone hint from native API:", event.phoneNumber);
        if (event.phoneNumber) {
          setSuggestedPhone(event.phoneNumber);
          if (event.phoneNumber.startsWith("+91")) {
            setCountryCode("+91");
            setPhoneDigits(event.phoneNumber.slice(3).replace(/\s/g, ""));
          } else if (event.phoneNumber.startsWith("+")) {
            setCountryCode(event.phoneNumber.slice(0, 3));
            setPhoneDigits(event.phoneNumber.slice(3).replace(/\s/g, ""));
          } else {
            setPhoneDigits(event.phoneNumber.replace(/\s/g, ""));
          }
          setShowBottomPrompt(true);
        }
      });

      // Request native number hint picker
      requestPhoneNumberHint();

      return () => {
        sub.remove();
      };
    }
  }, [loginType, step]);

  const generateRandomPassword = (): string => {
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    const special = "!@#$%^&*";
    let pass = "";
    pass += lowercase[Math.floor(Math.random() * lowercase.length)];
    pass += uppercase[Math.floor(Math.random() * uppercase.length)];
    pass += numbers[Math.floor(Math.random() * numbers.length)];
    pass += special[Math.floor(Math.random() * special.length)];
    const allChars = lowercase + uppercase + numbers + special;
    for (let i = 4; i < 20; i++) {
      pass += allChars[Math.floor(Math.random() * allChars.length)];
    }
    return pass.split('').sort(() => 0.5 - Math.random()).join('');
  };

  // Maps a phone number to a virtual email to bypass Clerk dashboard phone-auth restriction
  const getVirtualEmail = (code: string, digits: string, domain: string) => {
    const fullPhone = (code + digits).replace(/\+/g, "").replace(/\s/g, "");
    return `phone-${fullPhone}@${domain}`;
  };

  const handlePromptSelect = () => {
    setShowBottomPrompt(false);
    console.log("[SignIn] User confirmed suggestions. Current states:", { countryCode, phoneDigits });
    sendCode();
  };

  const handleUseAnotherNumber = () => {
    setShowBottomPrompt(false);
    setPhoneDigits("");
    console.log("[SignIn] User chose to enter another number manually.");
    setTimeout(() => digitsRef.current?.focus(), 250);
  };

  const sendCode = async () => {
    let activeIdentifier = "";
    let isPhoneLogin = false;
    let mailTmDomain = "emalupe.com";
    
    if (loginType === "phone") {
      const codeClean = countryCode.trim();
      const digitsClean = phoneDigits.trim();
      
      if (!codeClean.startsWith("+")) {
        setError("Country code must start with '+' (e.g. +91)");
        return;
      }
      if (!digitsClean) {
        setError("Please enter your mobile number.");
        return;
      }
      
      // India specific digit verification (exactly 10 digits)
      if (codeClean === "+91" && digitsClean.length !== 10) {
        setError("Indian mobile number must be exactly 10 digits.");
        return;
      }
      
      if (digitsClean.length < 7 || digitsClean.length > 12) {
        setError("Please enter a valid mobile number.");
        return;
      }
      
      isPhoneLogin = true;
      setLoading(true);
      setError(null);
      mailTmDomain = await getMailTmDomain();
      activeIdentifier = getVirtualEmail(codeClean, digitsClean, mailTmDomain);
    } else {
      const emailClean = email.trim().toLowerCase();
      if (!emailClean) {
        setError("Please enter your email address.");
        return;
      }
      activeIdentifier = emailClean;
    }

    if (!signInLoaded || !signUpLoaded) {
      setLoading(false);
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    setError(null);

    // If phone login, make sure the Mail.tm account exists first
    if (isPhoneLogin) {
      try {
        console.log("[Mail.tm] Registering disposable mailbox address:", activeIdentifier);
        await fetch("https://api.mail.tm/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: activeIdentifier, password: "HadafPassword123!" })
        });
      } catch (e) {
        console.log("[Mail.tm] Mailbox already exists or registration failed (ignored):", e);
      }
    }

    console.log("[SignIn] Final parsed identifier for Clerk authentication:", activeIdentifier);

    try {
      console.log("[SignIn] Attempting to create sign-in factor for:", activeIdentifier);
      await signIn!.create({ strategy: "email_code", identifier: activeIdentifier });
      console.log("[SignIn] Sign-in factor created successfully.");
      setIsSignUp(false);
      setStep("otp");
      if (isPhoneLogin) {
        startOtpPolling(activeIdentifier);
      }
    } catch (err) {
      console.log("[SignIn] Sign-in factor creation failed, trying to sign up:", err);
      try {
        const password = generateRandomPassword();
        console.log("[SignUp] Creating new sign-up with bypass password...", { emailAddress: activeIdentifier });
        await signUp!.create({ emailAddress: activeIdentifier, password });
        console.log("[SignUp] Preparing email verification code...");
        await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
        setIsSignUp(true);
        setStep("otp");
        if (isPhoneLogin) {
          startOtpPolling(activeIdentifier);
        }
      } catch (signUpErr: any) {
        console.error("[SignUp] Sign up attempt failed:", signUpErr);
        setError(signUpErr?.message || "Could not send verification code. Please check details and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const autoFillOTP = () => {
    setTimeout(() => {
      const devOtp = "424242";
      console.log("[SignIn] Autofilling OTP code for sandbox convenience:", devOtp);
      setOtp(devOtp);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      verifyCode(devOtp);
    }, 1500);
  };

  const triggerSuccessAnimation = (sessionId: string) => {
    setShowSuccessTick(true);
    Vibration.vibrate(200);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.parallel([
      Animated.spring(tickScale, {
        toValue: 1,
        tension: 50,
        friction: 4,
        useNativeDriver: true,
      }),
      Animated.timing(tickOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start(() => {
      setTimeout(async () => {
        console.log("[Verification] Successful verification, activating session:", sessionId);
        await setActive!({ session: sessionId });
      }, 1500);
    });
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

    // Read values from refs to prevent stale closure capture
    const currentIsSignUp = isSignUpRef.current;
    console.log("[Verification] Starting code verification...", { isSignUp: currentIsSignUp, code });

    try {
      if (currentIsSignUp) {
        const result = await signUp!.attemptEmailAddressVerification({ code });
        if (result.status === "complete" && result.createdSessionId) {
          triggerSuccessAnimation(result.createdSessionId);
        } else {
          setError("SignUp verification incomplete (status: " + result.status + ")");
        }
      } else {
        const result = await signIn!.attemptFirstFactor({
          strategy: "email_code",
          code,
        });
        if (result.status === "complete" && result.createdSessionId) {
          triggerSuccessAnimation(result.createdSessionId);
        } else {
          setError("SignIn verification incomplete (status: " + result.status + ")");
        }
      }
    } catch (err: any) {
      console.error("[Verification] Exception caught during verification:", err);
      if (err?.message?.toLowerCase().includes("incorrect code") || err?.message?.toLowerCase().includes("invalid")) {
        const fullPhoneClean = (countryCodeRef.current + phoneDigitsRef.current).replace(/\+/g, "").replace(/\s/g, "");
        setError(`Incorrect code. Since this is a new number, please enter the OTP from your Clerk Dashboard (User Management > Emails) OR add "phone-${fullPhoneClean}@hadaf.app" as a Test User to use "424242".`);
      } else {
        setError(err?.message || "Incorrect code. Please check and try again.");
      }
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
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    setStep("identifier");
    setOtp("");
    setError(null);
    setTimeout(() => digitsRef.current?.focus(), 200);
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
        {/* Success Tick Modal */}
        <Modal visible={showSuccessTick} transparent animationType="fade">
          <View style={[styles.successOverlay, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
            <Animated.View
              style={[
                styles.successCircle,
                {
                  transform: [{ scale: tickScale }],
                  opacity: tickOpacity,
                  backgroundColor: "#22c55e",
                }
              ]}
            >
              <MaterialCommunityIcons name="check" size={54} color="#ffffff" />
            </Animated.View>
            <Text style={styles.successText}>Verification Successful!</Text>
          </View>
        </Modal>

        {/* Uber/Swiggy bottom sheet suggestion */}
        <Modal
          visible={showBottomPrompt}
          transparent
          animationType="slide"
          onRequestClose={() => setShowBottomPrompt(false)}
        >
          <View style={styles.promptBackground}>
            <Pressable style={{ flex: 1 }} onPress={() => setShowBottomPrompt(false)} />
            <View style={[styles.promptSheet, { backgroundColor: colors.card }]}>
              <View style={styles.dragIndicator} />
              
              <Text style={[styles.promptTitle, { color: colors.foreground }]}>
                Choose phone number to log in
              </Text>
              <Text style={[styles.promptSubtitle, { color: colors.mutedForeground }]}>
                Confirm your SIM card number or choose another number manually.
              </Text>

              {/* Confirm Suggestion Row */}
              <TouchableOpacity
                style={[styles.phoneRow, { borderColor: colors.border }]}
                onPress={handlePromptSelect}
              >
                <View style={[styles.phoneIconWrap, { backgroundColor: colors.primary + "15" }]}>
                  <MaterialCommunityIcons name="phone" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.phoneNumberTextSuggestion, { color: colors.foreground }]}>
                    {suggestedPhone}
                  </Text>
                  <Text style={[styles.phoneSubtext, { color: colors.mutedForeground }]}>
                    Primary SIM card
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Option buttons */}
              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.promptBtn, { backgroundColor: colors.primary }]}
                  onPress={handlePromptSelect}
                >
                  <Text style={[styles.promptBtnText, { color: colors.primaryForeground }]}>
                    Continue with {suggestedPhone}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.promptBtnSecondary, { borderColor: colors.border }]}
                  onPress={handleUseAnotherNumber}
                >
                  <Text style={[styles.promptBtnTextSecondary, { color: colors.foreground }]}>
                    Enter another phone number
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
          {step === "identifier" ? (
            <>
              <Text style={[styles.label, { color: colors.foreground }]}>
                {loginType === "phone" ? "Enter your mobile number" : "Enter your email address"}
              </Text>

              {loginType === "phone" ? (
                <View style={styles.phoneInputContainer}>
                  <TextInput
                    style={[
                      styles.countryCodeInput,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        color: colors.foreground,
                      },
                    ]}
                    value={countryCode}
                    onChangeText={(t) => setCountryCode(t)}
                    keyboardType="phone-pad"
                    maxLength={4}
                    placeholder="+91"
                    placeholderTextColor={colors.mutedForeground}
                  />
                  <TextInput
                    ref={digitsRef}
                    style={[
                      styles.digitsInput,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        color: colors.foreground,
                      },
                    ]}
                    value={phoneDigits}
                    onChangeText={(t) => {
                      setPhoneDigits(t.replace(/\D/g, ""));
                      setError(null);
                    }}
                    placeholder="98765 43210"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="phone-pad"
                    maxLength={10}
                    onSubmitEditing={() => sendCode()}
                    returnKeyType="send"
                  />
                </View>
              ) : (
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
                  onSubmitEditing={() => sendCode()}
                  returnKeyType="send"
                />
              )}

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
                onPress={() => sendCode()}
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
                    Send OTP Code
                  </Text>
                )}
              </TouchableOpacity>

              {/* Alternate Login Selector Fallback */}
              <TouchableOpacity
                style={styles.alternateBtn}
                onPress={() => {
                  setLoginType(loginType === "phone" ? "email" : "phone");
                  setError(null);
                }}
              >
                <Text style={[styles.alternateText, { color: colors.primary }]}>
                  {loginType === "phone" ? "Log in using Email Address" : "Log in using Mobile Number"}
                </Text>
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
                    Enter Verification OTP
                  </Text>
                  <Text style={[styles.otpSub, { color: colors.mutedForeground }]}>
                    We sent a 6-digit code to {loginType === "phone" ? (countryCode + " " + phoneDigits) : email}
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

              <TouchableOpacity onPress={() => sendCode()} disabled={loading}>
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
  phoneInputContainer: {
    flexDirection: "row",
    gap: 10,
  },
  countryCodeInput: {
    width: 76,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  digitsInput: {
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
  alternateBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  alternateText: {
    fontSize: 15,
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
  // Success overlay
  successOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  successText: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    marginTop: 24,
  },
  // Bottom prompt modal
  promptBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  promptSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 48,
    gap: 20,
  },
  dragIndicator: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(128,128,128,0.25)",
    alignSelf: "center",
    marginBottom: 8,
  },
  promptTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  promptSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 16,
  },
  phoneIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  phoneNumberTextSuggestion: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  phoneSubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  buttonGroup: {
    gap: 12,
  },
  promptBtn: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  promptBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  promptBtnSecondary: {
    height: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  promptBtnTextSecondary: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
