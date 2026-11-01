import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  title?: string;
  subtitle?: string;
  /** Keep the bottom tab bar tappable. */
  bottomOffset?: number;
}

/** Full-screen frosted lock shown over Pro-only screens (Analytics) on the limited plan. */
export default function LockedOverlay({
  title = "Analytics is a Pro feature",
  subtitle = "Your free trial has ended. Upgrade to Hadaf Pro to see your full usage insights.",
  bottomOffset = 0,
}: Props) {
  return (
    <View style={[styles.wrap, { bottom: bottomOffset }]}>
      <BlurView intensity={55} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={styles.scrim} />
      <View style={styles.card}>
        <View style={styles.lockCircle}>
          <MaterialIcons name="lock" size={28} color="#fff" />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <TouchableOpacity
          style={styles.btn}
          activeOpacity={0.85}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/subscription" as any);
          }}
        >
          <MaterialIcons name="bolt" size={18} color="#fff" />
          <Text style={styles.btnText}>UNLOCK WITH PRO</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center", zIndex: 50 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.35)" },
  card: {
    width: "82%",
    backgroundColor: "#fff",
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  lockCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 19, fontFamily: "Inter_700Bold", color: "#0a0a0a", textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#52525b", textAlign: "center", lineHeight: 20, marginBottom: 22 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0a0a0a",
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 16,
  },
  btnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
});
