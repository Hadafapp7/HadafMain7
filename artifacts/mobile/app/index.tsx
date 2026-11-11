import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useOnboarding } from "@/lib/onboarding";

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const { done: onboardingDone } = useOnboarding();

  const { data: me, isLoading: meLoading, isError: meError } = useQuery({
    queryKey: ["userMe"],
    enabled: Boolean(isSignedIn),
    retry: false,
    queryFn: () => customFetch<any>("/api/users/me"),
  });
  const profileComplete = meError || Boolean(me?.email && String(me?.name ?? "").trim());

  if (!isLoaded || onboardingDone === null || (isSignedIn && meLoading)) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0D0D0D", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  if (!isSignedIn) {
    if (!onboardingDone) {
      return <Redirect href="/onboarding" />;
    }
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (!profileComplete) {
    return <Redirect href="/complete-profile" />;
  }

  return <Redirect href="/(tabs)" />;
}
