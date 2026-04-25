import type { ComponentProps } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
  interpolate,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import type { QuickAction } from '@/types/home';

const CARD_SHADOW = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.04,
  shadowRadius: 24,
  elevation: 2,
} as const;

const PALETTE = {
  emerald: {
    bg: '#ecfdf5',
    border: '#d1fae5',
    icon: '#059669',
    label: 'rgba(6, 95, 70, 0.7)',
    filled:  { bg: '#059669', text: '#ffffff' },
    outline: { bg: '#d1fae5', text: '#059669' },
  },
  orange: {
    bg: '#fff7ed',
    border: '#ffedd5',
    icon: '#ea580c',
    label: 'rgba(154, 52, 18, 0.7)',
    filled:  { bg: '#ea580c', text: '#ffffff' },
    outline: { bg: '#ffedd5', text: '#ea580c' },
  },
} as const;

const PRESS_SPRING = { stiffness: 400, damping: 15 } as const;

export interface QuickActionTileProps {
  action: QuickAction;
  onPress?: () => void;
  /** Used for stagger delays if added in the future */
  index?: number;
}

export function QuickActionTile({ action, onPress }: QuickActionTileProps) {
  const palette = PALETTE[action.variant];
  const badge   = action.badgeStyle === 'filled' ? palette.filled : palette.outline;
  const reduced = useReducedMotion() ?? false;

  const press = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(press.value, [0, 1], [1, 0.96]) },
    ],
  }));

  const handlePressIn = reduced
    ? undefined
    : () => { press.value = withSpring(1, PRESS_SPRING); };

  const handlePressOut = reduced
    ? undefined
    : () => { press.value = withSpring(0, PRESS_SPRING); };

  return (
    <Animated.View style={[{ flex: 1 }, animStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.tile,
          { backgroundColor: palette.bg, borderColor: palette.border },
        ]}
      >
        <MaterialIcons
          name={action.iconName as ComponentProps<typeof MaterialIcons>['name']}
          size={28}
          color={palette.icon}
        />
        <Text style={[styles.label, { color: palette.label }]}>
          {action.label}
        </Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.text }]}>
            {action.badgeText}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 52,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 12,
    minHeight: 160,
    gap: 12,
    ...CARD_SHADOW,
  },
  label: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  badge: {
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
