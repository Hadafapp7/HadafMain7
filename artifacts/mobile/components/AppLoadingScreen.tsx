import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

const LOGO = require("../assets/images/icon.png");

interface AppLoadingScreenProps {
  message?: string;
}

export default function AppLoadingScreen({ message }: AppLoadingScreenProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Breathing scale animation on the logo
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.97,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Glowing aura pulse
    const glowing = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.8,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Subtle spinner ring rotation
    const rotating = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    breathing.start();
    glowing.start();
    rotating.start();

    return () => {
      breathing.stop();
      glowing.stop();
      rotating.stop();
    };
  }, [pulseAnim, glowAnim, rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.container}>
      <View style={styles.centerBox}>
        {/* Glowing aura ring behind the logo */}
        <Animated.View
          style={[
            styles.glowRing,
            {
              transform: [{ scale: pulseAnim }],
              opacity: glowAnim,
            },
          ]}
        />

        {/* Outer subtle rotating ring */}
        <Animated.View
          style={[
            styles.rotatingRing,
            { transform: [{ rotate: spin }] },
          ]}
        />

        {/* Hadaf Brand Logo with breathing pulse */}
        <Animated.View
          style={[
            styles.logoWrap,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <Image source={LOGO} style={styles.logoImage} resizeMode="cover" />
        </Animated.View>

        {/* Brand Name */}
        <Text style={styles.brandTitle}>HADAF</Text>
        <Text style={styles.tagline}>{message || "STAY FOCUSED"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center",
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  glowRing: {
    position: "absolute",
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  rotatingRing: {
    position: "absolute",
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: "transparent",
    borderTopColor: "rgba(255, 255, 255, 0.45)",
    borderRightColor: "rgba(255, 255, 255, 0.12)",
  },
  logoWrap: {
    width: 80,
    height: 80,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#161616",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  logoImage: {
    width: 78,
    height: 78,
    borderRadius: 20,
  },
  brandTitle: {
    marginTop: 24,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 6,
    color: "#FFFFFF",
  },
  tagline: {
    marginTop: 6,
    fontSize: 11,
    letterSpacing: 2.5,
    color: "rgba(255, 255, 255, 0.45)",
    fontWeight: "500",
  },
});
