module.exports = {
  expo: {
    name: "Hadaf",
    slug: "mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "mobile",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/icon.png",
      resizeMode: "contain",
      backgroundColor: "#f9f9f9",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.hadaf.mobile",
      infoPlist: {
        NSHealthShareUsageDescription:
          "Hadaf uses Screen Time data to show your most used apps.",
        NSHealthUpdateUsageDescription:
          "Hadaf uses Screen Time data to help you focus.",
      },
      entitlements: {
        "com.apple.developer.family-controls": true,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/icon.png",
        backgroundColor: "#f9f9f9",
      },
      package: "com.hadaf.mobile",
      permissions: [
        "android.permission.PACKAGE_USAGE_STATS",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.VIBRATE",
        "android.permission.POST_NOTIFICATIONS",
      ],
    },
    web: {
      favicon: "./assets/images/icon.png",
    },
    plugins: [
      "expo-dev-client",
      [
        "expo-router",
        {
          origin: "https://replit.com/",
        },
      ],
      "expo-font",
      "expo-web-browser",
      "./modules/hadaf-native/plugin",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      eas: {
        projectId: "9b4acb69-b402-4920-9a52-5383a1d81b62"
      }
    }
  },
};
