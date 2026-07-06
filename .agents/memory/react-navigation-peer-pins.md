---
name: React Navigation peer version pins in Expo apps
description: Why a loose semver range on @react-navigation/* packages can cause a silent blank-screen crash in Expo web preview
---

`expo-router` pins an internal, exact version of `@react-navigation/native` (and transitively `bottom-tabs`/`native-stack`). If the app's own `package.json` also declares a `@react-navigation/*` package (e.g. `@react-navigation/bottom-tabs`) with a loose semver range (e.g. `^7.18.7`) that resolves to a *newer* version than what's actually installed for `@react-navigation/native`, pnpm can end up installing two different major/minor versions of `bottom-tabs` side by side — one satisfying the newer peer requirement, one not.

**Why:** The newer `bottom-tabs`/`elements` version expects APIs (e.g. `createScreenFactory`) that don't exist on the older, actually-installed `@react-navigation/native`. This produces a `pageerror` like `(0, _reactNavigationNative.createScreenFactory) is not a function` at app startup, which crashes React Navigation's root component before anything renders — resulting in a completely blank white page with **no console errors visible via casual screenshot** (only shows up via full console/pageerror capture, e.g. through the testing subagent).

**How to apply:** When adding or bumping any `@react-navigation/*` package as a direct dependency in an Expo app that also uses `expo-router`, pin it to the *exact* version resolved internally by `expo-router` (check `pnpm list <pkg> --depth N` for the version nested under the `expo-router` peer chain) rather than using a caret/loose range. If a blank Expo web screen occurs with no obvious cause, capture full browser console + pageerror output (not just a screenshot) and check for `@react-navigation/*` version duplication as a first suspect.
