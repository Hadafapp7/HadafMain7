# Hadaf Android Build — Troubleshooting Log & Patterns to Avoid

This document records every issue hit while turning this repo into a working, installable Android APK via EAS Build, how each was diagnosed and fixed, and — more importantly — the *recurring patterns* behind them so the same mistakes aren't repeated as the project grows.

Session date: 2026-07-19. Fixed by working through the actual EAS cloud build logs end-to-end (not guesswork).

---

## Starting point

The repo is a pnpm monorepo. The mobile app lives at `artifacts/mobile` (Expo SDK 54, React Native 0.81.5, Expo Router, a custom native module at `artifacts/mobile/modules/hadaf-native`). There is **no `android/` folder checked in** — it's generated on demand via `expo prebuild`, or built entirely in the cloud via EAS. Opening the repo root in Android Studio directly does not and cannot work; this is a Node/Expo project, not a native Android project.

---

## Issue 1 — Kotlin compile errors in the custom native module

**Symptom:** `BUILD FAILED` at `:hadaf-native:compileReleaseKotlin`, with errors like:
```
e: AppBlockerModule.kt:45:44 Return type mismatch: expected 'Any?', actual 'Unit'.
```

**Root cause:** Expo Modules' `Function("name") { ... }` Kotlin DSL requires the lambda to resolve to `Any?`. Five functions across `AppBlockerModule.kt` and `UsageStatsModule.kt` ended their body with:
```kotlin
if (ctx != null) {
  ctx.startActivity(intent)
}
```
An `if` with no `else`, used as the last expression in a block, has type `Unit` in Kotlin — not `Any?` — which the DSL rejects.

**Fix:** Added an explicit trailing `Unit` after each such block so the lambda's inferred return type is satisfied.

**Pattern to watch for:** Any time you write an Expo Modules `Function { ... }` block whose body is purely for side effects (starting an intent, writing to prefs, etc.), end it with an explicit `Unit`, or give the lambda an explicit return type. Don't rely on Kotlin's implicit statement typing — it silently changes based on whether you added an `else` branch.

---

## Issue 2 — EAS project linked to the wrong account

**Symptom:**
```
You don't have the required permissions to perform this operation.
Entity not authorized: AppEntity[...] (viewer = ..., action = READ)
```

**Root cause:** `app.config.js` had a hardcoded `extra.eas.projectId` pointing at an EAS project owned by whoever originally built this app (likely on Replit) — not the new Expo account logged in on this machine.

**Fix:** Removed the stale `projectId`, ran `eas init --non-interactive --force` to create a fresh project under the correct account, then manually added the new `projectId` (and `owner`) back into `app.config.js` — dynamic (`.js`) configs can't be auto-patched by the EAS CLI the way static `app.json` can.

**Pattern to watch for:** If you ever fork/clone an Expo project that already has an `extra.eas.projectId` baked in, don't assume it's usable — check `eas whoami` matches the project's actual owner before building. This is exactly the kind of thing that looks like a permissions bug but is really "wrong project."

---

## Issue 3 — Android resource merge conflict

**Symptom:**
```
Execution failed for task ':app:mergeReleaseJavaResource'.
2 files found with path 'META-INF/versions/9/OSGI-INF/MANIFEST.MF' from inputs:
  - com.squareup.okhttp3:logging-interceptor:5.4.0
  - org.jspecify:jspecify:1.0.0
```

**Root cause:** Two transitive Android/Java dependencies both bundle a file at the same `META-INF` path. Gradle refuses to silently pick one when merging release resources.

**Fix:** Added the `expo-build-properties` config plugin to `app.config.js` with:
```js
android: {
  packagingOptions: { exclude: ["META-INF/versions/9/OSGI-INF/MANIFEST.MF"] }
}
```
Since there's no checked-in `android/` folder to hand-edit `app/build.gradle`, this had to be done declaratively through a config plugin — the generated Gradle file is rebuilt from `app.config.js` on every `prebuild`/EAS build.

**Pattern to watch for:** `META-INF` merge conflicts are common once a project accumulates enough native dependencies. `expo-build-properties`'s `packagingOptions.exclude`/`pickFirst` is the right tool — don't try to eject and hand-edit Gradle files, since they get regenerated and your edit will silently vanish on the next build.

---

## Issue 4 — Installing Expo-ecosystem packages with the wrong tool

**Symptom:** After adding `expo-build-properties` with a plain `pnpm add expo-build-properties`, a *later* build failed with:
```
Execution failed for task ':expo-dev-menu:compileDebugKotlin'.
e: DevMenuPackage.kt:50:9 'onDidCreateReactActivityDelegateNotification' overrides nothing.
e: DevMenuModule.kt:14:34 Unresolved reference 'OptimizedRecord'.
```
`expo doctor` then revealed the real story:
```
❗ Major version mismatches
package                expected  found
expo-build-properties  ~1.0.10   57.0.6
expo-dev-client        ~6.0.21   57.0.5
```

**Root cause:** `pnpm add <package>` (or `npm install <package>`) grabs whatever the npm registry's `latest` tag currently resolves to. For most packages that's fine — but every package in the Expo ecosystem is versioned against a specific **Expo SDK**, and its `latest` npm tag can be many major versions ahead of what your installed SDK (54, in this case) actually supports. `expo-dev-client@57.0.5` (pre-existing in the repo) and `expo-build-properties@57.0.6` (installed fresh, my own mistake mid-session) were both built against Expo internals far newer than SDK 54 ships, breaking native compilation deep inside `node_modules` — nowhere near the actual application code, which makes it look like a mystery.

**Fix:** `npx expo install --fix` — Expo's SDK-aware installer — realigned every mismatched package to its SDK-54-compatible version.

**⭐ This is the single most important pattern from this whole session:**

> **Never `pnpm add`/`npm install` a package whose name starts with `expo-` or `@expo/`. Always use `npx expo install <package>`.**
>
> It looks up the version matrix for your currently-installed Expo SDK and installs the *compatible* version, not just the newest one. Run `npx expo-doctor` before any build if you're ever unsure — it's the fastest way to catch this class of bug before spending 20 minutes waiting on a cloud build to fail.

---

## Issue 5 — App installs but crashes instantly on open (blank/no UI)

**Symptom:** APK installs fine, opens, and immediately closes / never shows a UI. No error visible anywhere (this is a *runtime* crash, not a build failure — the Gradle build succeeds).

**Root cause:** `artifacts/mobile/app/_layout.tsx` wraps the whole app in:
```tsx
<ClerkProvider publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}>
```
The `!` is only a *TypeScript* compile-time assertion — it does nothing at runtime. The EAS cloud build had **zero environment variables configured** (confirmed directly in the build log: *"No environment variables ... found for the 'preview' environment"*), so `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` was `undefined` at runtime. Clerk's own SDK throws a hard, synchronous error the instant it's initialized with no key — and that throw happens *inside* `ClerkProvider`, which is a *parent* of the app's own `ErrorBoundary` component, not a child. Error boundaries can only catch errors from their descendants, so nothing caught it. The JS thread crashed before any screen ever rendered.

**Fix:**
1. Created a Clerk account/app, got a publishable key.
2. Registered it via `eas env:create --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value <key> --environment development --environment preview --environment production --visibility plaintext` — this makes it available to *every* EAS cloud build automatically, matching what the build log calls the resolved "environment" per profile.
3. Pulled it locally too (`eas env:pull --environment development`) for the Metro/dev-client workflow, writing a local `.env.local` (added `.env*` to `.gitignore` first, since it wasn't already ignored).

**Pattern to watch for:**
- **Local dev scripts hide missing configuration.** The `dev` script in `package.json` manually exports `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY` from Replit's secret store — so locally, everything "just worked," masking the fact that this value was never wired into the actual build pipeline (EAS). Any `EXPO_PUBLIC_*` variable your code reads must be explicitly registered as an **EAS Environment Variable** (`eas env:create`) — it will not magically carry over from wherever it worked before.
- **A required env var going missing should never be a silent, unhandled crash.** Worth a future follow-up: guard `ClerkProvider`'s key (fail with a clear on-screen message like "Missing Clerk key — check environment configuration" instead of a blank crash), and/or move `ErrorBoundary` to wrap `ClerkProvider` itself rather than sit inside it, so provider-level failures are at least visible instead of silent.

---

## Issue 6 — Android OS install friction (not bugs — expected behavior)

These aren't code issues, just standard Android security behavior for apps installed outside the Play Store ("sideloaded" / EAS internal-distribution builds):

- **Play Protect blocks the install** → in the warning dialog: "More details" → "Install anyway". (Or temporarily disable Play Protect scanning: Play Store → profile icon → Play Protect → settings gear.)
- **Usage Access / Accessibility toggles greyed out** → Android 13+ disables these "sensitive" permission toggles by default for sideloaded apps, as anti-malware protection (these two permissions are commonly abused by banking trojans). Fix: **Settings → Apps → Hadaf → ⋮ (top-right menu) → "Allow restricted settings"**. The toggles become usable immediately after.

**Pattern to watch for:** Don't mistake either of these for a broken build — they'll happen on *every* fresh install of any internal-distribution/dev-client APK, on every tester's device, every time. Worth putting a one-time note in onboarding docs for anyone testing the app.

---

## Issue 7 — Dev-client "failed to connect" for a remote tester

**Symptom:** A second tester (not on the same network as the machine running Metro) opens the dev-client app and gets:
```
Error loading app
failed to connect to /192.168.0.103 (port 8081) from /192.168.1.100 (port 50682) after 10000ms
```

**Root cause:** `npx expo start --dev-client` (no `--tunnel`) serves Metro over plain LAN — the dev-client app connects directly to the *host machine's* local IP address (`192.168.0.103` above, printed when `expo start` runs). That IP is only reachable from devices on the **same physical/Wi-Fi network** as the host machine. A tester on a different network (different house, different office, mobile data) is on a different subnet entirely (`192.168.1.100` above) and the connection times out — this is basic networking, not a bug in the app or the build.

**Fix:** Each person testing against a live Metro server needs to run `npx expo start --dev-client` **from their own machine**, with their own phone on the same Wi-Fi as that machine. There is no single shared dev server that works for testers on different networks unless you use `--tunnel` (routes through ngrok, works from anywhere, but adds latency).

Note: `--tunnel` itself failed in this environment on first try, with:
```
CommandError: TypeError [ERR_INVALID_ARG_TYPE]: The "file" argument must be of type string. Received null
Check the Ngrok status page for outages: https://status.ngrok.com/
```
— an `@expo/ngrok` binary-resolution issue, not something we debugged further since plain LAN mode was available. If a remote tester's laptop and phone are on the *different* networks from each other too (so LAN mode isn't an option for them either), this may need troubleshooting (try reinstalling `@expo/ngrok`, or use `npx expo start --dev-client --tunnel` from a fresh `pnpm install`).

**Pattern to watch for:** "Dev-client live debugging" is inherently local to whoever's machine is running `expo start`. If a task will involve **multiple people** testing simultaneously against live Metro/HMR (not just installing a static preview APK), each of them needs their own `expo start` running locally — plan for that instead of assuming one person's dev server can serve a remote collaborator. A static `preview`/`production` APK build remains the most reliable way to hand a *working, non-debuggable* build to someone remote, with no networking dependency at all.

---

## Debugging setup now in place

Rather than only shipping opaque "preview"/production APKs (where a crash like Issue 5 is invisible), a **development-client** build is now available:

- Built via the existing `development` profile in `eas.json` (`developmentClient: true`, debug build — faster, no minification/lint-vital passes).
- Run `npx expo start --dev-client` from `artifacts/mobile` on a machine on the same Wi-Fi network as the test device, then connect the dev-client app to `exp://<machine-LAN-IP>:8081`.
- With this connected: JS errors show as an in-app **red-screen overlay with a full stack trace** instead of a silent crash, and all `console.log`/`console.warn`/`console.error` stream live to the terminal running `expo start`.

This is the tool to use for the "further issue" mentioned at the end of this session — reproduce it with the dev client connected and the actual error/stack trace will be visible immediately, instead of needing another round of cloud-build-log archaeology.

---

## Quick reference — commands used this session

```bash
# One-time environment setup
npm install -g pnpm eas-cli
pnpm install
eas login

# Installing Expo-ecosystem packages correctly
npx expo install <package-name>      # NOT pnpm add / npm install
npx expo-doctor                       # sanity check before every build

# EAS environment variables (for anything process.env.EXPO_PUBLIC_* reads)
eas env:create --name <NAME> --value <VALUE> \
  --environment development --environment preview --environment production \
  --visibility plaintext --non-interactive
eas env:pull --environment development   # sync to local .env.local for Metro

# Builds
eas build --platform android --profile development --non-interactive   # dev-client, for debugging
eas build --platform android --profile preview --non-interactive       # distributable APK

# Live debugging
npx expo start --dev-client              # then connect device to exp://<lan-ip>:8081

# Fetching full logs for a failed cloud build (CLI only shows a one-line summary)
eas build:view <build-id> --json          # get data.logFiles[0], a short-lived signed URL
curl -s --compressed "<logFiles[0] URL>"  # logs are Brotli-compressed NDJSON; --compressed decodes automatically
```

---

## Status at end of session

- ✅ Preview APK builds and installs successfully.
- ✅ App opens without crashing (Clerk key wired up).
- ✅ Dev-client build + live Metro debugging is set up for ongoing troubleshooting.
- ✅ Project handed off to a second collaborator; documented the "each tester needs their own local `expo start`" networking requirement (Issue 7) after they hit it directly.
- ⚠️ Still open: the "further issue" mentioned after the app first opened successfully — not yet described/diagnosed. Next step: reproduce with a dev client connected to a local Metro server (see "Debugging setup now in place" above) to capture the exact error, then continue from there.