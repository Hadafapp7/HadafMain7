# Quick reference (for running this yourself)

## Day-to-day dev loop

```
cd artifacts/mobile
npx expo start --dev-client
```

Requires a dev-client build already installed on your test device (see build commands below). Don't use `pnpm run dev` — it's wired for the old Replit environment and won't work locally.

## Building

```
# Fresh installable APK
eas build --platform android --profile preview

# Dev-client build (needed after any native/module code change)
eas build --platform android --profile development
```

## Before pushing changes

```
pnpm run typecheck
```

(run from repo root)

## Two hard rules (see CLAUDE.md for the full reasoning)

1. **Never `pnpm add`/`npm install` a package starting with `expo-` or `@expo/`.** Always `npx expo install <package>` — otherwise you can end up with a version that doesn't match the installed Expo SDK (54), and it fails in a confusing way deep in `node_modules`.
2. **Any new `process.env.EXPO_PUBLIC_*` used in app code must be registered with `eas env:create`**, not just added to local `.env.local`. Otherwise it works locally but the app crashes instantly on real EAS builds.

## Other docs in this repo

- [`artifacts/mobile/BUILD_TROUBLESHOOTING.md`](../artifacts/mobile/BUILD_TROUBLESHOOTING.md) — full log of every build issue hit so far, with exact fixes.
- [`artifacts/mobile/NATIVE_BUILD_GUIDE.md`](../artifacts/mobile/NATIVE_BUILD_GUIDE.md) — deeper guide to the native module (usage stats + app blocking) and both Android/iOS build paths.
- [`artifacts/mobile/MIGRATE_TO_YOUR_OWN_ACCOUNTS.md`](../artifacts/mobile/MIGRATE_TO_YOUR_OWN_ACCOUNTS.md) — steps if this project ever needs to be re-linked to a different Expo/Clerk account instead of sharing yours.
- [`README/SETUP_FOR_OWNER.md`](SETUP_FOR_OWNER.md) — the setup notes given to the repo owner for his laptop.
