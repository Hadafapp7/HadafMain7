import { View, StyleSheet, type ViewProps } from 'react-native';
import { Colors, Radius, Border } from '@/constants/theme';

interface CardProps extends ViewProps {
  bordered?: boolean;
  elevated?: boolean;
}

export function Card({ bordered = false, elevated = false, style, children, ...props }: CardProps) {
  return (
    <View
      style={[
        styles.base,
        bordered && styles.bordered,
        elevated && styles.elevated,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    padding: 16,
  },
  bordered: { ...Border.signature },
  elevated: { backgroundColor: Colors.surfaceHigh },
});
