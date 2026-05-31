import { Tabs } from "expo-router";
import React from "react";

import AnimatedTabBar from "@/components/AnimatedTabBar";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AnimatedTabBar {...props} />}
    >
      <Tabs.Screen name="index"     />
      <Tabs.Screen name="analytics" />
      <Tabs.Screen name="focus"     />
      <Tabs.Screen name="goals"     />
      <Tabs.Screen name="profile"   />
    </Tabs>
  );
}
