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
 *     - Adds the accessibility_service_config.xml resource
 *   iOS:
 *     - Adds the FamilyControls entitlement
 *     - Adds the DeviceActivityMonitor + ShieldConfiguration app extensions
 *     - Configures the App Group (group.com.hadaf.mobile) for shared UserDefaults
 */
const { withAndroidManifest, withEntitlementsPlist, withInfoPlist } = require("@expo/config-plugins");

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

// ── iOS ────────────────────────────────────────────────────────────────────

function withIOSFamilyControls(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    cfg.modResults["com.apple.developer.family-controls"] = true;
    // App Group — required for shared UserDefaults between main app & extensions
    if (!cfg.modResults["com.apple.security.application-groups"]) {
      cfg.modResults["com.apple.security.application-groups"] = [];
    }
    const groups = cfg.modResults["com.apple.security.application-groups"];
    if (!groups.includes("group.com.hadaf.mobile")) {
      groups.push("group.com.hadaf.mobile");
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
  config = withIOSFamilyControls(config);
  return config;
};
