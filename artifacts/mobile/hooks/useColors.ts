import colors from "@/constants/colors";

/**
 * Returns the design tokens for the Hadaf "Obsidian Chalk" light theme
 * so all screens stay visually consistent regardless of OS dark-mode settings.
 */
export function useColors() {
  return { ...colors.light, radius: colors.radius };
}
