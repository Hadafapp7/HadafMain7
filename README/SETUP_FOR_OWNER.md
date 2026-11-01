# Setup guide (for the repo owner)

This is the mobile app for Hadaf — an Expo/React Native Android app used for testing. This guide gets it building and running on your laptop and a physical Android device.

## Before you start (done by the person who sent you this)

You've been invited as a **member on the existing Expo/EAS account** (`tauqirmomin77`) that owns this project. You do **not** need to create your own Expo account project or Clerk account — you're using the shared ones. If you haven't received an invite yet (check your email for an Expo team invite), ask before continuing.

## 1. Install prerequisites

- **Node.js 20+** — https://nodejs.org
- **pnpm**: `npm install -g pnpm`
- **eas-cli**: `npm install -g eas-cli`
- **A physical Android device.** Emulators don't support the Accessibility Service / Usage Access permissions this app depends on, so you need a real phone with USB debugging enabled (or just installing the built APK directly).
- Android Studio is only needed if you want to build **locally** instead of using EAS cloud builds (see step 5, option B). For a first try, skip it — cloud build needs nothing but the CLI tools above.

## 2. Clone the repo

```
git clone https://github.com/Hadafapp7/HadafMain7.git
cd HadafMain7
```

## 3. Install dependencies

From the repo root:

```
pnpm install
```

This is a pnpm monorepo — one install at the root pulls in everything needed for the mobile app under `artifacts/mobile`.

## 4. Log in to Expo/EAS

```
eas login
```

Use the Expo account you were invited with (accept the email invite first if you haven't).

## 5. Pull the shared environment variables

The app needs a Clerk publishable key at build time. It's already registered on the shared EAS project, so you just need to pull it down — no manual key copying:

```
cd artifacts/mobile
eas env:pull --environment development
```

This creates a local `.env.local` file with `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` filled in automatically.

## 6. Build the app

**Option A — EAS cloud build (recommended, no Android Studio needed):**

```
eas build --platform android --profile development
```

(Use `--profile preview` instead if you just want a plain installable APK rather than a dev-client build.) When it finishes, EAS gives you a download link/QR code — install that APK on your device.

**Option B — Build locally (needs Android Studio + SDK installed):**

```
npx expo prebuild --clean
npx expo run:android --device
```

## 7. Live JS reloading / debugging

Once you have a dev-client build installed on your device (from `--profile development` above), run this from `artifacts/mobile` on your own machine, on the same Wi-Fi as your device:

```
npx expo start --dev-client
```

JS errors will show as an in-app red-screen overlay with a full stack trace, and console logs stream to this terminal.

> Note: don't use `pnpm run dev` — that script is wired for the original Replit environment (reads Replit-specific env vars) and won't work on a normal laptop. Use `npx expo start --dev-client` instead.

## 8. First-run permissions on the device

When you first open the app, Android will prompt you to grant:
- **Usage Access**
- **Accessibility Service**
- **Display over other apps**

You may also see a Play Protect warning since this is a sideloaded/internal build, not a Play Store release. All of this is expected — not a bug.

## If something breaks

Check [`artifacts/mobile/BUILD_TROUBLESHOOTING.md`](../artifacts/mobile/BUILD_TROUBLESHOOTING.md) first — it's a log of every real build issue hit on this project so far, with the exact error text and fix. Common ones:
- Installing an `expo-*` or `@expo/*` package the normal way (`pnpm add`) breaks things — always use `npx expo install <package>` instead.
- If a build succeeds but the app crashes instantly on open, it's almost always a missing/unpulled environment variable — re-run `eas env:pull --environment development`.
