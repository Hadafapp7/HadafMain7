---
name: Hadaf native modules
description: Location and purpose of the native Android/iOS modules for real app blocking and device usage stats
---

The native modules live at `artifacts/mobile/modules/hadaf-native/`.

Android (Kotlin):
- `UsageStatsModule.kt` — reads real screen time via UsageStatsManager; requires PACKAGE_USAGE_STATS permission (user grants in Settings > Special App Access)
- `HadafAccessibilityService.kt` — background accessibility service that detects blocked app launches and draws a SYSTEM_ALERT_WINDOW overlay
- `AppBlockerModule.kt` — JS-facing module; writes session state to SharedPreferences; notifies the service

iOS (Swift):
- `HadafUsageStats.swift` — Screen Time integration via FamilyControls (requires Apple entitlement approval)
- `HadafAppBlocker.swift` — blocks apps via ManagedSettingsStore.shield.applications
- `HadafShieldConfigurationExtension/` — App Extension: customises Apple's "App Blocked" shield
- `HadafDeviceActivityMonitor/` — App Extension: monitors app launches in background

JS bridge: `modules/hadaf-native/src/index.ts` — all calls are no-ops on web/Expo Go; real behaviour only in EAS Build / local native build.

**Why:** Standard Expo managed workflow cannot access UsageStatsManager or Accessibility Service. These require custom native modules and a dev-client/production build. The modules are wired into app.config.js via the Config Plugin at `modules/hadaf-native/plugin.js`.

**How to apply:** After any change to native Kotlin/Swift files, run `npx expo prebuild --clean` to regenerate android/ and ios/ folders, then rebuild with `npx expo run:android` or `eas build`.
