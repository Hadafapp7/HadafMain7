import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, ClerkLoaded, ClerkLoading, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import Constants from "expo-constants";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { customFetch, setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { SubscriptionProvider } from "@/hooks/useSubscription";
import { AppDialogProvider } from "@/components/AppDialog";
import { OnboardingProvider, useOnboarding } from "@/lib/onboarding";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

let baseUrl: string = "https://api.hadaf.co.in";
const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) {
  baseUrl = domain.startsWith("http://") || domain.startsWith("https://")
    ? domain
    : `https://${domain}`;
} else if (__DEV__) {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(":")[0];
    baseUrl = `http://${ip}:5000`;
    console.log(`[BaseURL] Auto-detected packager IP. Setting API base URL: ${baseUrl}`);
  } else {
    baseUrl = "http://localhost:5000";
  }
}

// Apply base URL immediately
setBaseUrl(baseUrl);

// Sync user-saved custom URL from storage
AsyncStorage.getItem("@hadaf_server_url").then((custom) => {
  if (custom) {
    baseUrl = custom;
    setBaseUrl(custom);
    console.log(`[BaseURL] Using custom server URL: ${custom}`);
  }
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

function RootLayoutNav() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const appQueryClient = useQueryClient();
  const { done: onboardingDone } = useOnboarding();

  // A profile is complete once we know the user's name and email (phone sign-ups start without an email).
  const { data: me, isLoading: meLoading, isError: meError } = useQuery({
    queryKey: ["userMe"],
    enabled: Boolean(isSignedIn),
    retry: false,
    queryFn: () => customFetch<any>("/api/users/me"),
  });
  const profileComplete = meError || Boolean(me?.email && String(me?.name ?? "").trim());

  useEffect(() => {
    if (isLoaded && !isSignedIn) appQueryClient.removeQueries({ queryKey: ["userMe"] });
  }, [isLoaded, isSignedIn, appQueryClient]);

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  useEffect(() => {
    if (isSignedIn) {
      AsyncStorage.getItem("shouldRedirectToNotifications").then((val) => {
        if (val === "true") {
          AsyncStorage.removeItem("shouldRedirectToNotifications");
          setTimeout(() => {
            router.push("/notifications-settings" as any);
          }, 350);
        }
      });
    }
  }, [isSignedIn]);

  if (!isLoaded || onboardingDone === null || (isSignedIn && meLoading)) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0D0D0D", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Protected guard={Boolean(isSignedIn) && profileComplete}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(isSignedIn) && !profileComplete}>
        <Stack.Screen name="complete-profile" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* First launch: show the intro before sign-in / sign-up. */}
      <Stack.Protected guard={!isSignedIn && !onboardingDone}>
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: "fade" }} />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn && Boolean(onboardingDone)}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0D0D0D", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0D0D0D" }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <ClerkProvider
            publishableKey={publishableKey}
            tokenCache={tokenCache}
            proxyUrl={proxyUrl}
          >
            <ClerkLoading>
              <View style={{ flex: 1, backgroundColor: "#0D0D0D", alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="large" color="#ffffff" />
              </View>
            </ClerkLoading>
            <ClerkLoaded>
              <QueryClientProvider client={queryClient}>
                <KeyboardProvider>
                  <AppDialogProvider>
                    <SubscriptionProvider>
                      <OnboardingProvider>
                        <RootLayoutNav />
                      </OnboardingProvider>
                    </SubscriptionProvider>
                  </AppDialogProvider>
                </KeyboardProvider>
              </QueryClientProvider>
            </ClerkLoaded>
          </ClerkProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
