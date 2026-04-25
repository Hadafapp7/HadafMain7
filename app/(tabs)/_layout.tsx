import { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  withSequence,
  useReducedMotion,
  interpolate,
  FadeIn,
} from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const TABS = [
  { name: 'home',      label: 'HOME',   icon: 'home'      },
  { name: 'analytics', label: 'STATS',  icon: 'bar-chart' },
  { name: 'focus',     label: 'FOCUS',  icon: 'adjust'    },
  { name: 'profile',   label: 'PERSON', icon: 'person'    },
] as const;

const PILL_SPRING = { stiffness: 220, damping: 26 } as const;
const PRESS_SPRING = { stiffness: 400, damping: 15 } as const;
const ENTRANCE_SPRING = { stiffness: 80, damping: 20 } as const;

// ─── Individual tab button ────────────────────────────────────────────────────

interface TabButtonProps {
  tab: (typeof TABS)[number];
  isFocused: boolean;
  reduced: boolean;
  onPress: () => void;
  onLayout: (x: number, width: number) => void;
}

function TabButton({ tab, isFocused, reduced, onPress, onLayout }: TabButtonProps) {
  const scale = useSharedValue(1);
  const iconY = useSharedValue(0);
  const wasFocused = useRef(isFocused);

  // Bounce icon up when this tab becomes active
  useEffect(() => {
    if (isFocused && !wasFocused.current && !reduced) {
      iconY.value = withSequence(
        withTiming(-4, { duration: 90 }),
        withSpring(0, { stiffness: 500, damping: 14 }),
      );
    }
    wasFocused.current = isFocused;
  }, [isFocused, reduced]);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: iconY.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(isFocused ? 0.9 : 0.85, PRESS_SPRING);
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, PRESS_SPRING);
  };

  if (isFocused) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLayout={(e) => onLayout(e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 24,
          paddingHorizontal: 20,
          paddingVertical: 10,
        }}
      >
        <Animated.View style={[{ flexDirection: 'row', alignItems: 'center' }, scaleStyle]}>
          <Animated.View style={iconStyle}>
            <MaterialIcons
              name={tab.icon as React.ComponentProps<typeof MaterialIcons>['name']}
              size={20}
              color="#ffffff"
              style={{ marginRight: 8 }}
            />
          </Animated.View>
          {/* Label fades in when this tab becomes active */}
          <Animated.View entering={reduced ? undefined : FadeIn.duration(160)}>
            <Text
              style={{
                color: '#ffffff',
                fontSize: 10,
                fontFamily: 'WorkSans-Bold',
                letterSpacing: 2,
              }}
            >
              {tab.label}
            </Text>
          </Animated.View>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLayout={(e) => onLayout(e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
      style={{
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View style={[scaleStyle, iconStyle]}>
        <MaterialIcons
          name={tab.icon as React.ComponentProps<typeof MaterialIcons>['name']}
          size={24}
          color="rgba(255,255,255,0.4)"
        />
      </Animated.View>
    </Pressable>
  );
}

// ─── Floating tab bar ─────────────────────────────────────────────────────────

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  // Bar entrance: slides up from below on first render
  const barY = useSharedValue(60);
  const barOpacity = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      barY.value = 0;
      barOpacity.value = 1;
    } else {
      barY.value = withDelay(300, withSpring(0, ENTRANCE_SPRING));
      barOpacity.value = withDelay(300, withTiming(1, { duration: 350 }));
    }
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: barY.value }],
    opacity: barOpacity.value,
  }));

  // Sliding pill indicator tracks the active tab via onLayout measurements
  const tabLayouts = useRef<Array<{ x: number; width: number }>>(
    TABS.map(() => ({ x: 0, width: 80 })),
  );
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(80);
  const indicatorReady = useRef(false);

  const indicatorStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 8,
    left: 8, // matches paddingHorizontal of the pill container
    height: 56,
    borderRadius: 28,
    backgroundColor: '#333535',
    width: indicatorWidth.value,
    transform: [{ translateX: indicatorX.value }],
  }));

  const handleTabLayout = (index: number, x: number, width: number) => {
    tabLayouts.current[index] = { x, width };

    if (index === state.index) {
      if (!indicatorReady.current) {
        // First layout: snap to position without animation
        indicatorReady.current = true;
        indicatorX.value = x;
        indicatorWidth.value = width;
      } else if (!reduced) {
        // Active tab re-laid out (e.g. expanded/contracted): spring to new size
        indicatorX.value = withSpring(x, PILL_SPRING);
        indicatorWidth.value = withSpring(width, PILL_SPRING);
      }
    }
  };

  // When the active tab index changes, animate the indicator to the new tab
  const prevIndex = useRef(state.index);
  useEffect(() => {
    if (prevIndex.current === state.index) return;
    prevIndex.current = state.index;

    const layout = tabLayouts.current[state.index];
    if (layout && layout.width > 0 && !reduced) {
      indicatorX.value = withSpring(layout.x, PILL_SPRING);
      indicatorWidth.value = withSpring(layout.width, PILL_SPRING);
    }
  }, [state.index, reduced]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          bottom: Math.max(insets.bottom, 8) + 16,
          left: 0,
          right: 0,
          alignItems: 'center',
        },
        barStyle,
      ]}
    >
      <View
        style={{
          width: 342,
          height: 72,
          backgroundColor: '#1a1c1c',
          borderRadius: 36,
          borderWidth: 1.5,
          borderColor: 'rgba(255,255,255,0.15)',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 8,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 20 },
          shadowOpacity: 0.4,
          shadowRadius: 40,
          elevation: 20,
          overflow: 'hidden',
        }}
      >
        {/* Sliding background pill — sits behind the tab buttons */}
        <Animated.View style={indicatorStyle} pointerEvents="none" />

        {state.routes.map((route, index) => {
          const tab = TABS[index];
          if (!tab) return null;

          return (
            <TabButton
              key={route.key}
              tab={tab}
              isFocused={state.index === index}
              reduced={reduced ?? false}
              onLayout={(x, width) => handleTabLayout(index, x, width)}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (state.index !== index && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="analytics" />
      <Tabs.Screen name="focus" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
