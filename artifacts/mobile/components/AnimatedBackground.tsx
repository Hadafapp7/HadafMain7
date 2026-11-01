import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";

const { width, height } = Dimensions.get("window");

export default function AnimatedBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 240,
          height: 240,
          borderRadius: 120,
          backgroundColor: "#000000",
          opacity: 0.03,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: height * 0.45,
          left: -30,
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: "#5e5e5e",
          opacity: 0.03,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 100,
          right: 20,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: "#000000",
          opacity: 0.02,
        }}
      />
    </View>
  );
}
