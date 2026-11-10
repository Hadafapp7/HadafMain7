module.exports = ({ config }) => ({
  ...config,
  name: "Hadaf",
  slug: "mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "mobile",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "in.co.hadaf.app",
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
    versionCode: 1,
    usesCleartextTraffic: true,
    adaptiveIcon: {
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
      backgroundColor: "#ffffff",
    },
    package: "in.co.hadaf.app",
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
    favicon: "./assets/images/favicon.png",
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
    "./modules/hadaf-native/plugin.js",
    [
      "expo-build-properties",
      {
        android: {
          packagingOptions: {
            exclude: ["META-INF/versions/9/OSGI-INF/MANIFEST.MF"],
          },
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    ...(config?.extra || {}),
    eas: {
      projectId: "cd0e5f1d-d9b1-4a84-b6fa-7c96653f7c69",
    },
  },
  owner: "tauqirmomin77",
});
