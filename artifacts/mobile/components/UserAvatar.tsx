import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

interface UserAvatarProps {
  gender?: string | null;
  isPro?: boolean;
  size?: number;
  showProBadge?: boolean;
}

export default function UserAvatar({
  gender,
  isPro = false,
  size = 64,
  showProBadge = true,
}: UserAvatarProps) {
  const g = (gender || "").toLowerCase().trim();
  const isMale = g === "male";
  const isFemale = g === "female";

  const scale = size / 64;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        {/* Background Circle */}
        <Circle cx="32" cy="32" r="31" fill="#141417" stroke="#27272a" strokeWidth="2" />

        {isMale ? (
          /* Sleek Masculine Obsidian Avatar */
          <>
            {/* Shoulders / Torso */}
            <Path
              d="M14 56 C14 43, 21 39, 32 39 C43 39, 50 43, 50 56"
              fill="#27272a"
            />
            {/* Neck */}
            <Rect x="28" y="32" width="8" height="9" rx="3" fill="#a1a1aa" />
            {/* Face */}
            <Circle cx="32" cy="24" r="10.5" fill="#e4e4e7" />
            {/* Cropped Sharp Hair */}
            <Path
              d="M20 23 C20 15, 23 11, 32 11 C41 11, 44 15, 44 23 C44 20, 42 16, 38 15 C34 14, 30 14, 26 16 C22 18, 20 20, 20 23 Z"
              fill="#09090b"
            />
            {/* Ear accents */}
            <Circle cx="21" cy="24" r="2" fill="#d4d4d8" />
            <Circle cx="43" cy="24" r="2" fill="#d4d4d8" />
          </>
        ) : isFemale ? (
          /* Sleek Feminine Obsidian Avatar */
          <>
            {/* Shoulders / Torso */}
            <Path
              d="M16 56 C16 45, 22 41, 32 41 C42 41, 48 45, 48 56"
              fill="#27272a"
            />
            {/* Flowing Hair Back */}
            <Path
              d="M17 28 C16 38, 20 45, 22 48 C24 45, 24 38, 24 32"
              fill="#09090b"
            />
            <Path
              d="M47 28 C48 38, 44 45, 42 48 C40 45, 40 38, 40 32"
              fill="#09090b"
            />
            {/* Neck */}
            <Rect x="29" y="33" width="6" height="9" rx="3" fill="#a1a1aa" />
            {/* Face */}
            <Circle cx="32" cy="25" r="9.5" fill="#f4f4f5" />
            {/* Feminine Stylized Hair Front */}
            <Path
              d="M18 24 C18 14, 23 11, 32 11 C41 11, 46 14, 46 24 C46 19, 41 15, 36 15 C31 15, 26 17, 21 21 C19 22, 18 23, 18 24 Z"
              fill="#09090b"
            />
          </>
        ) : (
          /* Neutral Minimalist Obsidian Silhouette */
          <>
            {/* Shoulders */}
            <Path
              d="M16 56 C16 44, 22 40, 32 40 C42 40, 48 44, 48 56"
              fill="#27272a"
            />
            {/* Head */}
            <Circle cx="32" cy="25" r="11" fill="#e4e4e7" />
          </>
        )}
      </Svg>

      {/* Unique PRO Label Badge */}
      {isPro && showProBadge && (
        <View
          style={[
            styles.proBadge,
            {
              transform: [{ scale }],
              bottom: -4 * scale,
              right: -6 * scale,
            },
          ]}
        >
          <Text style={styles.proStar}>✦</Text>
          <Text style={styles.proText}>PRO</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  proBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#09090b",
    borderWidth: 1.5,
    borderColor: "#f59e0b",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    shadowColor: "#f59e0b",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  proStar: {
    fontSize: 8,
    color: "#f59e0b",
    fontWeight: "900",
  },
  proText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#fbbf24",
    letterSpacing: 0.8,
  },
});

