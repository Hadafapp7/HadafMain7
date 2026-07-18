import React, { useEffect } from "react";
import { Dimensions, Platform, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const { width, height } = Dimensions.get("window");

interface OrbProps {
  size: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  duration: number;
  color: string;
  delay: number;
}

function FloatingOrb({ size, startX, startY, endX, endY, duration, color, delay }: OrbProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [startX, endX]) },
      { translateY: interpolate(progress.value, [0, 1], [startY, endY]) },
      { scale: interpolate(progress.value, [0, 0.5, 1], [1, 1.08, 1]) },
    ],
    opacity: interpolate(progress.value, [0, 0.5, 1], [0.05, 0.09, 0.05]),
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          ...(Platform.OS === "web" ? { filter: "blur(60px)" } : {}),
        },
        style,
      ]}
    />
  );
}

export default function AnimatedBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <FloatingOrb size={300} startX={-50} startY={-50} endX={30} endY={80} duration={7000} color="#000000" delay={0} />
      <FloatingOrb size={250} startX={width - 100} startY={100} endX={width - 160} endY={200} duration={9000} color="#3b3b3b" delay={500} />
      <FloatingOrb size={200} startX={50} startY={height * 0.5} endX={120} endY={height * 0.4} duration={6000} color="#5e5e5e" delay={1000} />
      <FloatingOrb size={280} startX={80} startY={height * 0.7} endX={40} endY={height * 0.6} duration={8000} color="#000000" delay={1500} />
      {/* Foreground fast orbs for parallax depth */}
      <FloatingOrb size={120} startX={width * 0.6} startY={height * 0.3} endX={width * 0.7} endY={height * 0.25} duration={4000} color="#2a2a2a" delay={300} />
      <FloatingOrb size={100} startX={30} startY={height * 0.8} endX={60} endY={height * 0.75} duration={3500} color="#1a1a1a" delay={800} />
    </View>
  );
}
