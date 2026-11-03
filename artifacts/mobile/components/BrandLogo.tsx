import React from "react";
import { Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

/**
 * The Hadaf app logo. Every screen uses this one component, so swapping the artwork
 * only means replacing the file below (or changing the require path).
 */
const LOGO = require("../assets/images/icon.png");

export default function BrandLogo({
  size = 72,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size * 0.26, shadowRadius: size * 0.2 },
        style,
      ]}
    >
      <Image source={LOGO} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    backgroundColor: "#000",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    elevation: 6,
  },
});

