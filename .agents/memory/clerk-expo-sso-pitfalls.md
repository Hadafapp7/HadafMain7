---
name: Clerk Expo SSO pitfalls (native crash + web hang)
description: Two distinct @clerk/expo bugs seen in an Expo Router app - Expo Go native-module crash on Android, and a web Google SSO flow that hangs forever on a loading spinner.
---

## Native module crash in Expo Go (Android)

`@clerk/expo` (confirmed on 3.6.5 and 3.7.0) does an unconditional top-level
`require("../specs/NativeClerkModule")` in `dist/utils/native-module.js`. On
Android this synchronously calls `expo.requireNativeModule("ClerkExpo")`,
which does not exist in Expo Go (only in a custom dev client) and throws
outside any try/catch, crashing the entire Metro bundle for that platform.

**Why:** Expo Go can't load ahead-of-time native modules that weren't part of
its prebuilt binary; `@clerk/expo` assumes a dev client is always available.

**How to apply:** Patch the package (`pnpm patch @clerk/expo@<version>`) to
wrap that `require` in try/catch, falling back to `{ default: null }`. See
`pnpm-patch-reliability.md` for how to make sure the patch actually lands on
disk after `pnpm patch-commit`.

## Web Google SSO hangs on a loading spinner forever

`useSSO()`'s `startSSOFlow` (from `@clerk/expo`) calls
`expo-web-browser`'s `openAuthSessionAsync` on **every** platform, including
web. On web this opens a `window.open()` popup and waits for a `postMessage`
from that popup to resolve the returned promise.

Google's OAuth pages set `Cross-Origin-Opener-Policy` headers that null out
`window.opener` once the popup navigates to `accounts.google.com`. When the
popup later tries to complete the flow, `expo-web-browser`'s
`maybeCompleteAuthSession()` reads `window.opener ?? window.parent`, gets
back a reference to itself (not the real opener), and posts the completion
message nowhere useful. The popup never closes, so the polling `setInterval`
that checks `popupWindow.closed` never fires either — the original promise
in the app simply never resolves, and any `finally { setLoading(false) }`
never runs. The end-user sees "I signed in with Google but the app is stuck
on a loading spinner."

**Why:** Popup + `window.opener` messaging is fundamentally broken by modern
COOP headers set by big OAuth providers (Google in particular); this is not
specific to Replit's preview iframe, though an iframe-embedded preview makes
it more likely to surface.

**How to apply:** On web, don't use `@clerk/expo`'s `useSSO`/popup flow at
all. Instead:
- Import `useSignIn` from `@clerk/expo/legacy` (the modern `useSignIn` from
  `@clerk/expo`/`@clerk/react` returns a `SignInFutureResource` that lacks
  `authenticateWithRedirect`; only the legacy `SignInResource` has it).
- Call `signIn.authenticateWithRedirect({ strategy: 'oauth_google', redirectUrl: '<origin>/sso-callback', redirectUrlComplete: '<origin>/' })`,
  which does a real full-page navigation (no popup, no `window.opener`
  dependency).
- Add a dedicated `sso-callback` route/screen that calls
  `useClerk().handleRedirectCallback()` on mount to finish the flow and
  navigate home.
- Keep the native (iOS/Android) `useSSO` flow unchanged — it uses OS-level
  browser tabs and deep-link redirects, not `postMessage`, so it isn't
  affected by this issue.
