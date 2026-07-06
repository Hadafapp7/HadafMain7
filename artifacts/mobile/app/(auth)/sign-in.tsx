import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import { useSSO } from "@clerk/expo";
import { useSignIn } from "@clerk/expo/legacy";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

export const useWarmUpBrowser = () => {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  useWarmUpBrowser();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { startSSOFlow } = useSSO();
  const { signIn } = useSignIn();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGooglePress = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (Platform.OS === "web") {
        // Popup-based OAuth (expo-web-browser) breaks on web when the OAuth
        // provider sets Cross-Origin-Opener-Policy headers, which null out
        // `window.opener` and leave the sign-in stuck waiting on a postMessage
        // that never arrives. A full-page redirect avoids that entirely.
        if (!signIn) {
          setError("Something went wrong signing in. Please try again.");
          setLoading(false);
          return;
        }
        await signIn.authenticateWithRedirect({
          strategy: "oauth_google",
          redirectUrl: `${window.location.origin}/sso-callback`,
          redirectUrlComplete: `${window.location.origin}/`,
        });
        return;
      }

      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri(),
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      } else {
        setError("Sign-in requires additional steps. Please try again.");
      }
    } catch {
      setError("Something went wrong signing in. Please try again.");
    } finally {
      if (Platform.OS !== "web") setLoading(false);
    }
  }, [startSSOFlow, signIn]);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <View style={styles.hero}>
        <View style={[styles.logoWrap, { backgroundColor: colors.primary }]}>
          <MaterialCommunityIcons name="target" size={36} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Hadaf</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Set goals. Stay focused. Reach your Hadaf.
        </Text>
      </View>

      <View style={styles.actions}>
        {error ? (
          <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onGooglePress}
          disabled={loading}
          style={[
            styles.googleButton,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.foreground} />
          ) : (
            <>
              <MaterialCommunityIcons name="google" size={20} color={colors.foreground} />
              <Text style={[styles.googleButtonText, { color: colors.foreground }]}>
                Continue with Google
              </Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={[styles.terms, { color: colors.mutedForeground }]}>
          By continuing, you agree to keep your focus goals just between you and Hadaf.
        </Text>
      </View>
    </View>
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
  actions: {
    gap: 14,
  },
  error: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
  },
  googleButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  terms: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
});
