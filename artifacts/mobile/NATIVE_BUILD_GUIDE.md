# Hadaf — Native Build Guide
## Real App Blocking + Real Device Usage (Android & iOS)

This guide explains how to build Hadaf as a real native app with:
- **Real app usage stats** pulled directly from the phone OS
- **True OS-level app blocking** during focus sessions

---

## What was built

| File | Purpose |
|---|---|
| `modules/hadaf-native/android/.../UsageStatsModule.kt` | Reads real per-app screen time via Android `UsageStatsManager` |
| `modules/hadaf-native/android/.../HadafAccessibilityService.kt` | Background service that intercepts blocked app launches and shows a full-screen overlay |
| `modules/hadaf-native/android/.../AppBlockerModule.kt` | Manages session state and communicates with the Accessibility Service |
| `modules/hadaf-native/ios/HadafUsageStats.swift` | iOS Screen Time integration via `FamilyControls` framework |
| `modules/hadaf-native/ios/HadafAppBlocker.swift` | iOS app blocking via `ManagedSettings` (same API used by Opal & Screen Zen) |
| `modules/hadaf-native/ios/HadafShieldConfigurationExtension/` | Customises Apple's "App Blocked" shield screen |
| `modules/hadaf-native/ios/HadafDeviceActivityMonitor/` | Background extension that monitors app launches |
| `modules/hadaf-native/src/index.ts` | TypeScript bridge — what your screens import |
| `modules/hadaf-native/plugin.js` | Expo Config Plugin — injects permissions/services into native projects |
| `app.config.js` | Replaced `app.json` — dynamic config with all native entitlements |
| `eas.json` | EAS Build profiles (dev / preview / production) |

---

## Prerequisites

### For Android
- [Android Studio](https://developer.android.com/studio) (Hedgehog or newer)
- A **physical Android device** (Android 6.0+) — the special permissions don't work on emulators
- A USB cable and USB debugging enabled on the device

### For iOS
- A **Mac** running macOS Ventura or newer
- [Xcode 15+](https://developer.apple.com/xcode/)
- An [Apple Developer account](https://developer.apple.com/account/) ($99/year)
- A physical iPhone running iOS 15+
- Apple must approve the `com.apple.developer.family-controls` entitlement for your app (see iOS section below)

### For both
- [Node.js 20+](https://nodejs.org/)
- [pnpm](https://pnpm.io/): `npm install -g pnpm`
- [EAS CLI](https://docs.expo.dev/eas/): `npm install -g eas-cli`
- Expo account: `eas login`

---

## Step 1 — Clone and install

```bash
git clone <your-repo-url>
cd <repo>
pnpm install
```

---

## Step 2 — Generate native projects

The `android/` and `ios/` folders don't exist in the repo (they're generated).
Run this once to create them:

```bash
cd artifacts/mobile
npx expo prebuild --clean
```

This will:
- Create `android/` with full Gradle project
- Create `ios/` with full Xcode project
- Apply the `hadaf-native` Config Plugin (registers the Accessibility Service, adds permissions, adds entitlements)

---

## Step 3A — Android build

### Install the development build on your device

1. Connect your Android device via USB
2. Enable **Developer Options** → **USB Debugging** on your phone
3. Run:

```bash
cd artifacts/mobile
npx expo run:android --device
```

This compiles a debug APK, installs it, and opens Metro bundler.

### Grant the two special permissions (do this once after first install)

These cannot be granted by a normal permission dialog — the user must do it manually:

**1. Usage Access (to read real app stats)**
- Open the Hadaf app
- It will prompt you: tap **"Grant Usage Access"**
- You'll be taken to **Settings → Apps → Special app access → Usage access**
- Find **Hadaf** and toggle it **ON**
- Press back — Hadaf will now show your real most-used apps

**2. Accessibility Service (for app blocking)**
- Open the Hadaf app
- Go to the Focus tab → tap **"Enable App Blocking"**
- You'll be taken to **Settings → Accessibility → Installed apps → Hadaf**
- Tap **Hadaf Focus Mode** → toggle **ON**
- Read the permission description and confirm

**3. Display over other apps (for the blocking overlay)**
- The app will prompt you automatically
- Go to **Settings → Apps → Hadaf → Display over other apps** → toggle **ON**

### What happens during a focus session (Android)
1. User starts a session in Hadaf
2. `AppBlockerModule.startSession()` writes the blocked package list to `SharedPreferences` and notifies `HadafAccessibilityService`
3. The service runs in the background watching for `TYPE_WINDOW_STATE_CHANGED` events
4. When the user tries to open Instagram (or any blocked app), the service detects it within ~100ms and draws a full-screen overlay **on top** of the blocked app
5. The user sees the Hadaf "🔒 Focus Mode Active" screen and cannot interact with the blocked app
6. When the session timer ends, `stopSession()` is called — the overlay is removed and all apps are unblocked

---

## Step 3B — iOS build

### Apply for the FamilyControls entitlement (required first)

Apple requires manual approval before any app can use the Screen Time API.

1. Go to [developer.apple.com/contact/request/family-controls-distribution](https://developer.apple.com/contact/request/family-controls-distribution)
2. Fill in the form — explain that Hadaf is a focus/productivity app that blocks distracting apps
3. Wait 1–2 weeks for Apple's reply
4. Once approved, the entitlement is tied to your Apple Developer Team ID

### Build for a physical device

```bash
cd artifacts/mobile
npx expo run:ios --device
```

Or use EAS Build (builds in the cloud, no Mac required):
```bash
eas build --platform ios --profile development
```

### Add the App Extensions in Xcode

After `npx expo prebuild`, open the iOS project in Xcode:

```bash
open artifacts/mobile/ios/Hadaf.xcworkspace
```

You need to add two App Extension targets manually (Apple requires these as separate build targets):

**1. Device Activity Monitor Extension**
- File → New → Target → Device Activity Monitor Extension
- Name: `HadafDeviceActivityMonitor`
- Bundle ID: `com.hadaf.mobile.DeviceActivityMonitor`
- Replace the generated Swift file with `modules/hadaf-native/ios/HadafDeviceActivityMonitor/DeviceActivityMonitorExtension.swift`
- Add to the App Group: `group.com.hadaf.mobile`

**2. Shield Configuration Extension**
- File → New → Target → Shield Configuration Extension
- Name: `HadafShieldConfiguration`
- Bundle ID: `com.hadaf.mobile.ShieldConfiguration`
- Replace the generated Swift file with `modules/hadaf-native/ios/HadafShieldConfigurationExtension/ShieldConfigurationExtension.swift`

### Grant permission (iOS, one time)

When the user first opens the Focus tab on iOS:
- A system sheet appears: **"Allow Hadaf to see your Screen Time?"**
- User taps **Continue** → Done
- No trips to Settings required — Apple handles it natively

### What happens during a focus session (iOS)

1. User picks blocked apps using a `FamilyActivityPicker` (Apple's native app-selection UI)
2. `HadafAppBlocker.startSession()` calls `ManagedSettingsStore.shield.applications = tokens`
3. Apple OS immediately greys out the blocked apps on the home screen with a lock icon
4. If the user taps a blocked app, they see Hadaf's custom shield (the `ShieldConfigurationExtension`)
5. The shield shows "🔒 Focus Mode Active" with a "Back to Hadaf" button
6. When the session ends, `stopSession()` sets `shield.applications = nil` — all apps unblocked instantly

---

## Step 4 — EAS Build (cloud build — no local Xcode/Android Studio required)

If you want to build without setting up local tools:

```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# Build Android APK
eas build --platform android --profile preview

# Build iOS IPA (requires Apple Developer account)
eas build --platform ios --profile preview
```

EAS sends you a download link when the build finishes. Install the APK directly on your Android device.

---

## How the permission flow works in the app

The `modules/hadaf-native/src/index.ts` bridge handles everything gracefully:

```typescript
// On the home screen — checks permission on mount
const perm = hasUsagePermission();   // false on first run
if (perm) {
  const stats = await getDeviceUsageStats(7);  // real phone data
  // shows real most-used apps
}

// When user taps "Enable & Continue" — requests permission
await requestUsagePermission();       // opens Settings (Android) or system sheet (iOS)
const stats = await getDeviceUsageStats(7);

// On focus session start — activates native OS blocker
await startNativeSession(packageNames, durationMinutes);

// On session end — removes all blocks
await stopNativeSession();
```

On **web / Expo Go** (the Replit preview), all native calls return `false`/`[]` gracefully — the app still works with manual usage logging.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Usage access not granted" on Android | Go to Settings → Apps → Special app access → Usage access → Enable Hadaf |
| Blocking overlay doesn't appear | Enable Accessibility Service AND Display over other apps permissions |
| iOS shield not showing | Ensure FamilyControls entitlement is approved by Apple |
| Build fails with Kotlin error | Run `cd artifacts/mobile/android && ./gradlew clean` then rebuild |
| `prebuild` fails | Delete `android/` and `ios/` folders, run `npx expo prebuild --clean` again |

---

## Architecture summary

```
User opens blocked app
        │
        ▼
[Android] HadafAccessibilityService detects TYPE_WINDOW_STATE_CHANGED
        │
        ▼
Package in blocked list? ──NO──▶ nothing happens
        │YES
        ▼
Draw SYSTEM_ALERT_WINDOW overlay on top of blocked app
        │
        ▼
User sees "🔒 Focus Mode Active" — cannot use the blocked app

[iOS] ManagedSettingsStore.shield.applications = tokens
        │
        ▼
Apple OS greys out blocked apps at home screen level
        │
        ▼
User taps blocked app → ShieldConfigurationExtension renders
        │
        ▼
User sees "🔒 Focus Mode Active" — cannot use the blocked app
```
