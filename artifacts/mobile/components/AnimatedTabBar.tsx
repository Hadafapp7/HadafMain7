import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

const TAB_CONFIG: { name: string; icon: IconName; label: string }[] = [
  { name: "index", icon: "home", label: "Home" },
  { name: "analytics", icon: "bar-chart", label: "Analytics" },
  { name: "focus", icon: "timer", label: "Focus" },
  { name: "profile", icon: "person", label: "Profile" },
];

function TabItem({
  config,
  isFocused,
  onPress,
}: {
  config: (typeof TAB_CONFIG)[0];
  isFocused: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const iconScale = useSharedValue(1);
  const rippleOpacity = useSharedValue(0);
  const rippleScale = useSharedValue(0.5);

  const handlePress = () => {
    iconScale.value = withSequence(withSpring(1.25, { damping: 8 }), withSpring(1, { damping: 10 }));
    rippleOpacity.value = withSequence(
      withTiming(0.12, { duration: 0 }),
      withTiming(0, { duration: 450 })
    );
    rippleScale.value = withSequence(
      withTiming(0.5, { duration: 0 }),
      withSpring(2.2, { damping: 12 })
    );
    onPress();
  };

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: rippleOpacity.value,
    transform: [{ scale: rippleScale.value }],
  }));

  const activeColor = colors.primary;
  const inactiveColor = colors.outline;
  const color = isFocused ? activeColor : inactiveColor;

  return (
    <Pressable style={styles.tabItem} onPress={handlePress} android_ripple={null}>
      <View style={styles.tabInner}>
        {/* Ripple ring */}
        <Animated.View
          style={[
            styles.ripple,
            { backgroundColor: colors.primary },
            rippleStyle,
          ]}
        />
        {/* Icon */}
        <Animated.View style={iconStyle}>
          <MaterialIcons name={config.icon} size={24} color={color} />
        </Animated.View>
      </View>
      <Text
        style={[
          styles.tabLabel,
          {
            color,
            fontFamily: isFocused ? "Inter_700Bold" : "Inter_500Medium",
          },
        ]}
      >
        {config.label}
      </Text>
    </Pressable>
  );
}

export default function AnimatedTabBar({ state, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  const barHeight = isWeb ? 84 : 62 + insets.bottom;

  return (
    <View style={[styles.container, { height: barHeight }]}>
      {isIOS ? (
        <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceContainerLowest }]} />
      )}
      <View style={styles.row}>
        {TAB_CONFIG.map((config, index) => {
          const isFocused = state.index === index;
          return (
            <TabItem
              key={config.name}
              config={config}
              isFocused={isFocused}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: state.routes[index].key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(state.routes[index].name);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 8,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  tabInner: {
    width: 48,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  ripple: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  tabLabel: {
    fontSize: 11,
  },
});
