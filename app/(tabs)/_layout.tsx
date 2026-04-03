import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity, type TouchableOpacityProps } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const TABS = [
  { name: 'home', label: 'HOME', icon: 'home' as const },
  { name: 'analytics', label: 'STATS', icon: 'bar-chart' as const },
  { name: 'focus', label: 'FOCUS', icon: 'adjust' as const },
  { name: 'profile', label: 'PERSON', icon: 'person' as const },
] satisfies { name: string; label: string; icon: React.ComponentProps<typeof MaterialIcons>['name'] }[];

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: 'absolute',
        bottom: Math.max(insets.bottom, 8) + 16,
        left: 0,
        right: 0,
        alignItems: 'center',
        pointerEvents: 'box-none',
      }}
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
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 20 },
          shadowOpacity: 0.4,
          shadowRadius: 40,
          elevation: 20,
        }}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const tab = TABS[index];
          if (!tab) return null;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (isFocused) {
            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: '#333535',
                  borderRadius: 24,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                }}
              >
                <MaterialIcons name={tab.icon} size={20} color="#ffffff" />
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
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.7}
              style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
            >
              <MaterialIcons name={tab.icon} size={24} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

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
