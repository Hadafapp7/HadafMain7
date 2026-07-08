import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export default function OAuthNativeCallback() {
  const router = useRouter();
  const colors = useColors();
  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const handled = useRef(false);
  const [statusMsg, setStatusMsg] = useState("Finishing sign-in…");

  useEffect(() => {
    if (!signInLoaded || !signUpLoaded) return;
    if (!signIn || !setActive) return;
    if (handled.current) return;

    const processUrl = async (rawUrl: string | null) => {
      if (!rawUrl) return;

      let nonce: string | undefined;
      try {
        const parsed = new URL(rawUrl);
        nonce = parsed.searchParams.get("rotating_token_nonce") ?? undefined;
      } catch {
        return;
      }

      if (!nonce) return;

      handled.current = true;

      try {
        await signIn.reload({ rotatingTokenNonce: nonce });

        const { status, createdSessionId, firstFactorVerification } = signIn;

        if (status === "complete" && createdSessionId) {
          await setActive({ session: createdSessionId });
          router.replace("/(tabs)" as never);
          return;
        }

        if (firstFactorVerification?.status === "transferable" && signUp) {
          await signUp.create({ transfer: true });
          if (signUp.status === "complete" && signUp.createdSessionId) {
            await setActive({ session: signUp.createdSessionId });
            router.replace("/(tabs)" as never);
            return;
          }
        }

        router.replace("/(auth)/sign-in" as never);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[oauth-native-callback] reload failed:", msg, "nonce length:", nonce?.length);
        setStatusMsg(`Error: ${msg}`);
        setTimeout(() => router.replace("/(auth)/sign-in" as never), 2000);
      }
    };

    Linking.getInitialURL().then((url) => {
      processUrl(url);
    });

    const sub = Linking.addEventListener("url", ({ url }) => {
      if (!handled.current) processUrl(url);
    });

    return () => sub.remove();
  }, [signInLoaded, signUpLoaded, signIn, setActive]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.label, { color: colors.onSurface }]}>{statusMsg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  label: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 24 },
});
