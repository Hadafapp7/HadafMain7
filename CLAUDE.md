# Project context for AI assistants

This file is a briefing for whichever AI coding assistant is helping on this repo — read it before doing anything else. It exists so you don't have to rediscover things that were already debugged the hard way (real build failures, real cloud build logs), and so you don't repeat mistakes that already cost real build time.

## What this project is

A pnpm monorepo. The relevant app for Android/mobile work is `artifacts/mobile` — an Expo SDK 54 / React Native 0.81.5 app using Expo Router, with a custom native module at `artifacts/mobile/modules/hadaf-native` (Kotlin for Android, Swift for iOS) that implements real device usage-stats reading and app-blocking via an Accessibility Service.

**There is no `android/` or `ios/` folder checked into the repo.** They're generated on demand via `expo prebuild`, or built entirely in the cloud via EAS Build (`eas build --platform android ...`). Do not expect to open this repo directly in Android Studio — it won't work until `expo prebuild` has been run, or just use EAS which handles that step in the cloud.

## What's already been fixed (don't re-debug these)

Full detail — exact error text, root cause, fix, and the file/line references — is in [`artifacts/mobile/BUILD_TROUBLESHOOTING.md`](artifacts/mobile/BUILD_TROUBLESHOOTING.md) (also as a PDF alongside it). Read that file if you hit anything that looks similar to these. Condensed list:

1. **Kotlin `Function { ... }` blocks returning `Unit` instead of `Any?`** in `AppBlockerModule.kt`/`UsageStatsModule.kt` — fixed by ending side-effect-only blocks with an explicit `Unit`.
2. **EAS project ownership** — `app.config.js`'s `extra.eas.projectId`/`owner` must match whoever is currently logged in via `eas whoami`, or builds fail with a permissions error that looks unrelated.
3. **Android `META-INF` resource merge conflicts** between transitive dependencies — fixed declaratively via the `expo-build-properties` config plugin's `packagingOptions.exclude`, not by hand-editing generated Gradle files (which get wiped on every rebuild).
4. **Installing Expo-ecosystem packages the wrong way** — see the critical rule below.
5. **App crashes instantly on open** — caused by a missing `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` at EAS-build time (see the env var rule below).
6. **Android install friction** (Play Protect warning, restricted Accessibility/Usage-Access settings) — expected OS behavior for sideloaded/internal-distribution builds, not bugs. See the doc for the exact device steps.
7. **Dev-client "failed to connect" for a remote tester** — `npx expo start --dev-client` only serves Metro over LAN; a tester on a different network needs to run their own `expo start` locally (or use `--tunnel`, which had its own ngrok issue in this environment — see the doc).

## Two rules that will save you real time

**Never `pnpm add`/`npm install` a package whose name starts with `expo-` or `@expo/`. Always use `npx expo install <package>`.** A plain package-manager install grabs npm's `latest` tag, which can be many major versions ahead of what the installed Expo SDK (54) actually supports — and it fails in a very confusing way, deep inside `node_modules`, nowhere near your own code. This has already caused two separate failed cloud builds in this project. Run `npx expo-doctor` before any build if unsure.

**Any `process.env.EXPO_PUBLIC_*` value the app code reads must be registered as an EAS Environment Variable, not just present in a local `.env`.** Local dev scripts (see the Replit-specific `dev` script in `artifacts/mobile/package.json`) can make things "work locally" while silently never being wired into the actual EAS build pipeline — this exact gap caused the app to crash instantly on every real build until fixed. Register with:
```
eas env:create --name <NAME> --value <VALUE> \
  --environment development --environment preview --environment production \
  --visibility plaintext --non-interactive
```

## Current state / open items

- Preview and development-client (debug) Android builds both succeed and install correctly.
- The app opens without crashing — the Clerk publishable key is wired up as an EAS env var and in a local `.env.local` (gitignored).
- A development-client build + `npx expo start --dev-client` workflow is set up for live debugging: JS errors show as an in-app red-screen overlay with a full stack trace, and console output streams to the terminal running `expo start`.
- **Still open / undiagnosed:** a "further issue" was hit after the app first opened successfully, but never described in detail. If asked to help with "the next bug," start by getting the dev-client + local Metro server running (see `BUILD_TROUBLESHOOTING.md` → "Debugging setup now in place") so the actual error/stack trace is visible, rather than guessing.

## Other docs in this repo worth knowing about

- [`artifacts/mobile/NATIVE_BUILD_GUIDE.md`](artifacts/mobile/NATIVE_BUILD_GUIDE.md) — general guide to the native module (usage stats + app blocking), permissions flow, and both Android/iOS build paths.
- [`artifacts/mobile/BUILD_TROUBLESHOOTING.md`](artifacts/mobile/BUILD_TROUBLESHOOTING.md) — the full issue log referenced above, with exact error text and file:line references.
- [`artifacts/mobile/MIGRATE_TO_YOUR_OWN_ACCOUNTS.md`](artifacts/mobile/MIGRATE_TO_YOUR_OWN_ACCOUNTS.md) — how to re-link `app.config.js` and EAS environment variables to a different Expo/Clerk account (useful if this repo has been forked/handed off between people, as it has been).