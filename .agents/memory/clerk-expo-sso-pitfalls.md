---
name: Clerk Expo SSO pitfalls (native crash + web hang)
description: Two distinct @clerk/expo bugs seen in an Expo Router app - Expo Go native-module crash on Android, and a web Google SSO flow that hangs forever on a loading spinner.
---

## Native module crash in Expo Go (`Cannot find native module 'ClerkExpo'`)

`@clerk/expo` v3+ ships `useSSO`, which uses a native module (`ClerkExpo`)
that only exists in a **custom dev build** — not in Expo Go. Importing
`useSSO` crashes the entire bundle at load time in Expo Go.

**Why:** Expo Go can't load ahead-of-time native modules that weren't part of
its prebuilt binary; `useSSO` in `@clerk/expo` v3 unconditionally requires
`ClerkExpo` on module load.

**Real root cause:** `NativeClerkModule.android.js` uses `expo.requireNativeModule`
(hard throw), while `NativeClerkModule.js` uses `expo.requireOptionalNativeModule`
(returns null). Metro on Android *always* prefers `.android.js` over `.js`, so
the hard-crash version always loads on Android in Expo Go. Swapping hooks
(`useSSO` → `useOAuth`) does NOT help — the crash is at package init time.

**Correct fix (two-part patch to `@clerk/expo`):**
1. `dist/specs/NativeClerkModule.android.js` — change `requireNativeModule` → `requireOptionalNativeModule`
2. `dist/utils/native-module.js` — wrap the `require("../specs/NativeClerkModule")` in try/catch fallback

**Patch registration:** Add both diffs to `patches/@clerk__expo@<version>.patch`.
Also apply the changes directly to node_modules (the patched folder under
`.pnpm/@clerk+expo@<version>_patch_hash=*/node_modules/...`) because pnpm may
not reapply the patch if it thinks the hash already matches. See
`pnpm-patch-reliability.md` for context.

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

## Google OAuth 403 "you do not have access to this page" when testing inside an embedded preview (e.g. Canvas board)

Even after switching to a full-page redirect, Google can still reject the
auth request with a rendered 403 error page instead of completing sign-in.
This happens specifically when the redirect runs inside an iframe (e.g. the
app preview embedded as an iframe shape on the Canvas board, or any other
iframe-wrapped preview) — Google's own OAuth pages actively refuse to render
inside a third-party iframe as an anti-clickjacking measure, and return a
real 403 HTML page rather than just failing silently.

**Why:** `window.location`-based redirects inside an iframe only navigate
that iframe, not the top-level tab, so the browser really is trying to load
accounts.google.com inside a nested frame — which Google blocks outright.

**How to apply:** before starting the redirect-based OAuth flow on web,
check `window.top !== window.self`; if true, don't call the OAuth SDK method
at all — instead navigate `window.top.location.href` (wrapped in try/catch,
since a sandboxed iframe without `allow-top-navigation` throws a
SecurityError; fall back to `window.open(url, "_blank")` in that case) to
the same page with a query flag, then auto-resume the OAuth call once the
page reloads at the top level. A normal published app tab already runs at
the top level, so this only affects iframe-embedded dev/preview testing.
