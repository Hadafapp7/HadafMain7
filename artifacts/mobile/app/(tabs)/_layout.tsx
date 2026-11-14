import { useListGoals } from "@workspace/api-client-react";
import { Tabs } from "expo-router";
import React from "react";

import AnimatedTabBar from "@/components/AnimatedTabBar";
import { useGoalAutomation } from "@/lib/goalAutomation";
import { useGuiltNotifications } from "@/lib/guiltNotifications";

export default function TabLayout() {
  useGuiltNotifications();
  const { data: goals } = useListGoals();
  useGoalAutomation(Array.isArray(goals) ? goals : undefined);

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
