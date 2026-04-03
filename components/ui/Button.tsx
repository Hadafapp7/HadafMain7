import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, type TouchableOpacityProps } from 'react-native';
import { Colors, Typography, Radius } from '@/constants/theme';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        (disabled || isLoading) && styles.disabled,
        style,
      ]}
      disabled={disabled || isLoading}
      activeOpacity={0.75}
      {...props}
    >
      {isLoading && (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? '#fff' : Colors.primary}
          style={{ marginRight: 8 }}
        />
      )}
      <Text style={[styles.text, styles[`text_${variant}`], styles[`textSize_${size}`]]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
  },
  disabled: { opacity: 0.45 },

  // Variants
  primary:   { backgroundColor: Colors.primary },
  secondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.primary },
  ghost:     { backgroundColor: 'transparent' },

  // Sizes
  size_sm: { paddingHorizontal: 12, paddingVertical: 8 },
  size_md: { paddingHorizontal: 20, paddingVertical: 12 },
  size_lg: { paddingHorizontal: 24, paddingVertical: 16 },

  // Text base
  text: { ...Typography.label },

  // Text by variant
  text_primary:   { color: '#ffffff' },
  text_secondary: { color: Colors.primary },
  text_ghost:     { color: Colors.secondary },

  // Text by size
  textSize_sm: { fontSize: 10 },
  textSize_md: { fontSize: 11 },
  textSize_lg: { fontSize: 12 },
});
