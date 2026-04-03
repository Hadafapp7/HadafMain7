import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Manrope_200ExtraLight,
  Manrope_300Light,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { WorkSans_400Regular, WorkSans_700Bold } from '@expo-google-fonts/work-sans';
import * as SplashScreen from 'expo-splash-screen';
import { MobileFrame } from '@/components/MobileFrame';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Manrope-ExtraLight': Manrope_200ExtraLight,
    'Manrope-Light':      Manrope_300Light,
    'Manrope-Regular':    Manrope_400Regular,
    'Manrope-Medium':     Manrope_500Medium,
    'Manrope-Bold':       Manrope_700Bold,
    'Manrope-ExtraBold':  Manrope_800ExtraBold,
    'Inter-Regular':      Inter_400Regular,
    'Inter-Medium':       Inter_500Medium,
    'Inter-Bold':         Inter_700Bold,
    'WorkSans-Regular':   WorkSans_400Regular,
    'WorkSans-Bold':      WorkSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <MobileFrame>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </MobileFrame>
  );
}
