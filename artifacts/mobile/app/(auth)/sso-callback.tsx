import { useClerk } from "@clerk/expo";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export default function SSOCallback() {
  const router = useRouter();
  const clerk = useClerk();
  const colors = useColors();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    clerk
      .handleRedirectCallback({}, async (to: string) => {
        if (!cancelled) router.replace(to as never);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("SSO callback failed:", err);
        setError("Something went wrong signing in. Please try again.");
        setTimeout(() => {
          if (!cancelled) router.replace("/(auth)/sign-in" as never);
        }, 1500);
      });

    return () => {
      cancelled = true;
    };
  }, [clerk, router]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.foreground} />
      {error ? (
        <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  error: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
