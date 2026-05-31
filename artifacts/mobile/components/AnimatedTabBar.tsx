import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React, { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// Keyed by route NAME — focus is omitted here; it's opened via the centre FAB
const TAB_CONFIG: Record<string, { icon: IconName; label: string }> = {
  index:     { icon: "home",      label: "Home"      },
  analytics: { icon: "bar-chart", label: "Analytics" },
  goals:     { icon: "flag",      label: "Goals"     },
  profile:   { icon: "person",    label: "Profile"   },
};

// ── Regular tab item ───────────────────────────────────────────────────────────
function TabItem({
  routeName,
  isFocused,
  onPress,
}: {
  routeName: string;
  isFocused: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const config = TAB_CONFIG[routeName] || { icon: "circle" as IconName, label: routeName };

  const iconScale     = useSharedValue(1);
  const rippleOpacity = useSharedValue(0);
  const rippleScale   = useSharedValue(0.5);

  const handlePress = () => {
    iconScale.value     = withSequence(withSpring(1.25, { damping: 8 }), withSpring(1, { damping: 10 }));
    rippleOpacity.value = withSequence(withTiming(0.12, { duration: 0 }), withTiming(0, { duration: 450 }));
    rippleScale.value   = withSequence(withTiming(0.5, { duration: 0 }), withSpring(2.2, { damping: 12 }));
    onPress();
  };

  const iconStyle   = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity:   rippleOpacity.value,
    transform: [{ scale: rippleScale.value }],
  }));

  const color = isFocused ? colors.primary : colors.outline;

  return (
    <Pressable style={styles.tabItem} onPress={handlePress} android_ripple={null}>
      <View style={styles.tabInner}>
        <Animated.View style={[styles.ripple, { backgroundColor: colors.primary }, rippleStyle]} />
        <Animated.View style={iconStyle}>
          <MaterialIcons name={config.icon} size={24} color={color} />
        </Animated.View>
      </View>
      <Text
        style={[
          styles.tabLabel,
          { color, fontFamily: isFocused ? "Inter_700Bold" : "Inter_500Medium" },
        ]}
      >
        {config.label}
      </Text>
    </Pressable>
  );
}

// ── Focus session FAB (centre "+" button) ──────────────────────────────────────
function FocusFAB({ onPress, isFocused }: { onPress: () => void; isFocused: boolean }) {
  const colors = useColors();
  const scale  = useSharedValue(1);

  useEffect(() => {
    // Subtle bounce on first render to draw attention
    scale.value = withDelay(
      900,
      withSequence(
        withSpring(1.18, { damping: 5, stiffness: 130 }),
        withSpring(1,    { damping: 8 })
      )
    );
  }, []);

  const fabStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const color    = isFocused ? "#fff" : "#fff";
  const bgColor  = colors.primary;

  return (
    <View style={styles.fabWrapper}>
      <Animated.View style={fabStyle}>
        <TouchableOpacity
          style={[
            styles.fab,
            {
              backgroundColor: bgColor,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.22,
              shadowRadius: 10,
            },
          ]}
          onPress={() => {
            scale.value = withSequence(
              withSpring(0.88, { damping: 8 }),
              withSpring(1,    { damping: 10 })
            );
            onPress();
          }}
          activeOpacity={0.85}
        >
          <MaterialIcons name="play-arrow" size={26} color={color} />
        </TouchableOpacity>
      </Animated.View>
      <Text
        style={[
          styles.tabLabel,
          {
            color: isFocused ? colors.primary : colors.outline,
            fontFamily: isFocused ? "Inter_700Bold" : "Inter_500Medium",
          },
        ]}
      >
        Focus
      </Text>
    </View>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────────
export default function AnimatedTabBar({ state, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isIOS  = Platform.OS === "ios";
  const isWeb  = Platform.OS === "web";

  const barHeight = isWeb ? 84 : 62 + insets.bottom;

  // Split routes: [home, analytics] | FAB | [goals, profile]
  // "focus" is a route but rendered only via the FAB
  const leftRoutes  = state.routes.filter((r) => r.name === "index" || r.name === "analytics");
  const rightRoutes = state.routes.filter((r) => r.name === "goals"  || r.name === "profile");
  const focusRoute  = state.routes.find((r)  => r.name === "focus");
  const activeRouteName = state.routes[state.index].name;

  const navigateTo = (routeName: string, routeKey: string) => {
    const event = navigation.emit({
      type: "tabPress",
      target: routeKey,
      canPreventDefault: true,
    });
    if (activeRouteName !== routeName && !event.defaultPrevented) {
      navigation.navigate(routeName as never);
    }
  };

  return (
    <View style={[styles.container, { height: barHeight }]}>
      {isIOS ? (
        <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceContainerLowest }]} />
      )}

      <View style={styles.row}>
        {/* Left: Home + Analytics */}
        {leftRoutes.map((route) => (
          <TabItem
            key={route.key}
            routeName={route.name}
            isFocused={activeRouteName === route.name}
            onPress={() => navigateTo(route.name, route.key)}
          />
        ))}

        {/* Centre: Focus Session FAB */}
        <FocusFAB
          isFocused={activeRouteName === "focus"}
          onPress={() => {
            if (focusRoute) navigateTo(focusRoute.name, focusRoute.key);
          }}
        />

        {/* Right: Goals + Profile */}
        {rightRoutes.map((route) => (
          <TabItem
            key={route.key}
            routeName={route.name}
            isFocused={activeRouteName === route.name}
            onPress={() => navigateTo(route.name, route.key)}
          />
        ))}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
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
    paddingHorizontal: 4,
    alignItems: "flex-start",
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
  tabLabel: { fontSize: 11 },

  // FAB
  fabWrapper: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  fab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    marginTop: -6,
  },
});
