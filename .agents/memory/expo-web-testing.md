---
name: Expo web preview + E2E testing routing
description: How to reach an Expo mobile artifact's web preview for runTest()/screenshot when router = "expo-domain"
---

Expo mobile artifacts in this monorepo template are typically registered with `router = "expo-domain"` in `artifact.toml`, even though `previewPath` is `"/"`. This means the artifact is **not** reachable at the shared proxy root domain (`$REPLIT_DEV_DOMAIN`) — that domain routes to whichever other artifact owns `/` in the shared proxy (e.g. the API server), not the Expo app.

**Why:** `runTest()` and manual `curl`/browser checks default to the shared proxy root domain. For Expo artifacts, this silently loads the wrong artifact (or 404s), producing a misleading "blank page" failure that looks like an app bug but is actually a routing/test-setup mistake.

**How to apply:** Before running E2E tests or debugging a "blank screen" on an Expo artifact, check `artifacts/<mobile>/.replit-artifact/artifact.toml` for `router = "expo-domain"`. If present, point browser navigation / runTest at `https://$REPLIT_EXPO_DEV_DOMAIN/` instead of `$REPLIT_DEV_DOMAIN`. The `screenshot` tool with `type=app_preview` handles this correctly on its own; manual `runTest` test plans must have the correct URL spelled out explicitly in the test plan / technical documentation since the testing subagent doesn't know the routing convention.
