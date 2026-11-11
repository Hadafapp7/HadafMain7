import React from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useOnboarding } from "@/lib/onboarding";
import AppLoadingScreen from "@/components/AppLoadingScreen";

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
    return <AppLoadingScreen />;
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
