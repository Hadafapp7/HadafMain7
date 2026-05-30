import { Tabs } from "expo-router";
import React from "react";

import AnimatedTabBar from "@/components/AnimatedTabBar";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AnimatedTabBar {...props} />}
    >
      {/* Explicit order overrides Expo Router's alphabetical default */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="analytics" />
      <Tabs.Screen name="focus" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
