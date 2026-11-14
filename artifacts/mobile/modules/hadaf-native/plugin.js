/**
 * Expo Config Plugin for hadaf-native
 *
 * This plugin injects the required native configuration into the auto-generated
 * android/ and ios/ folders when you run `npx expo prebuild` or EAS Build.
 *
 * What it does:
 *   Android:
 *     - Adds PACKAGE_USAGE_STATS, SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE permissions
 *     - Registers HadafAccessibilityService in AndroidManifest.xml
 *     - Disables Android OS auto Force-Dark (forceDarkAllowed=false) and locks Light theme
 *       in styles.xml so Xiaomi/Realme/OnePlus/Samsung Dark Mode never inverts cards/inputs
 *   iOS:
 *     - Adds the FamilyControls entitlement
 *     - Configures the App Group (group.in.co.hadaf.app) for shared UserDefaults
 */
const {
  withAndroidManifest,
  withAndroidStyles,
  withEntitlementsPlist,
  withInfoPlist,
} = require("expo/config-plugins");

// ── Android ────────────────────────────────────────────────────────────────

function withAndroidAccessibilityService(config) {
  return withAndroidManifest(config, async (cfg) => {
    const manifest = cfg.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return cfg;

    // Ensure permissions array exists
    if (!manifest.manifest["uses-permission"]) {
      manifest.manifest["uses-permission"] = [];
    }

    const requiredPermissions = [
      "android.permission.PACKAGE_USAGE_STATS",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.VIBRATE",
    ];

    for (const perm of requiredPermissions) {
      const exists = manifest.manifest["uses-permission"].some(
        (p) => p.$?.["android:name"] === perm
      );
      if (!exists) {
        manifest.manifest["uses-permission"].push({
          $: { "android:name": perm },
        });
      }
    }

    // Register HadafAccessibilityService
    if (!app.service) app.service = [];
    const svcName = "com.hadaf.hadafnative.HadafAccessibilityService";
    const svcExists = app.service.some(
      (s) => s.$?.["android:name"] === svcName
    );
    if (!svcExists) {
      app.service.push({
        $: {
          "android:name": svcName,
          "android:exported": "true",
          "android:label": "Hadaf Focus Mode",
          "android:permission": "android.permission.BIND_ACCESSIBILITY_SERVICE",
        },
        "intent-filter": [
          {
            action: [
              { $: { "android:name": "android.accessibilityservice.AccessibilityService" } },
            ],
          },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.accessibilityservice",
              "android:resource": "@xml/accessibility_service_config",
            },
          },
        ],
      });
    }

    return cfg;
  });
}

function withDisableAndroidForceDark(config) {
  return withAndroidStyles(config, (cfg) => {
    const styles = cfg.modResults?.resources?.style;
    if (Array.isArray(styles)) {
      const appTheme = styles.find((s) => s.$?.name === "AppTheme");
      if (appTheme) {
        appTheme.$.parent = "Theme.AppCompat.Light.NoActionBar";
        if (!Array.isArray(appTheme.item)) {
          appTheme.item = [];
        }
        const hasForceDark = appTheme.item.some(
          (i) => i.$?.name === "android:forceDarkAllowed"
        );
        if (!hasForceDark) {
          appTheme.item.push({
            $: { name: "android:forceDarkAllowed", "tools:targetApi": "29" },
            _: "false",
          });
        } else {
          for (const item of appTheme.item) {
            if (item.$?.name === "android:forceDarkAllowed") {
              item._ = "false";
            }
          }
        }
      }
    }
    return cfg;
  });
}

// ── iOS ────────────────────────────────────────────────────────────────────

function withIOSFamilyControls(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    cfg.modResults["com.apple.developer.family-controls"] = true;
    // App Group — required for shared UserDefaults between main app & extensions
    if (!cfg.modResults["com.apple.security.application-groups"]) {
      cfg.modResults["com.apple.security.application-groups"] = [];
    }
    const groups = cfg.modResults["com.apple.security.application-groups"];
    if (!groups.includes("group.in.co.hadaf.app")) {
      groups.push("group.in.co.hadaf.app");
    }
    return cfg;
  });

  config = withInfoPlist(config, (cfg) => {
    // Privacy usage description shown during FamilyControls auth sheet
    cfg.modResults.NSFamilyControlsUsageDescription =
      "Hadaf uses Screen Time to show your most-used apps and block distracting apps during focus sessions.";
    return cfg;
  });

  return config;
}

// ── Plugin entry point ─────────────────────────────────────────────────────

module.exports = (config) => {
  config = withAndroidAccessibilityService(config);
  config = withDisableAndroidForceDark(config);
  config = withIOSFamilyControls(config);
  return config;
};
