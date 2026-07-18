---
name: pnpm patch reliability
description: pnpm patch-commit can register a patch without it actually landing on disk, and pnpm install --force can corrupt node_modules mid-watch. How to verify and recover.
---

## Symptom

After `pnpm patch <pkg>@<version>` → edit files in the temp patch dir →
`pnpm patch-commit <dir>`, the `patchedDependencies` entry is correctly added
to both `pnpm-workspace.yaml` and `pnpm-lock.json`'s hash — but a subsequent
plain `pnpm install` (or an `--force` one that hangs/times out) does not
actually apply the diff to the real file inside
`node_modules/.pnpm/<pkg>@<version>.../node_modules/<pkg>/...`.

`pnpm install --force` can also fail destructively: it left node_modules in
a state where Metro couldn't resolve a patched package at all, and threw an
unrelated `ENOENT ... backend_tmp_<n>` watcher error from a stale temp
directory left behind by an interrupted extraction.

**Why:** the exact trigger wasn't isolated, but a hung/interrupted
`--force` reinstall is enough to leave the pnpm store's virtual store
directory (`node_modules/.pnpm/...`) inconsistent — including leftover
`_tmp_*` extraction directories that break Metro's file watcher.

## How to apply

1. Never assume `pnpm patch-commit` finished the job — always read back the
   actual file inside `node_modules/.pnpm/.../node_modules/<pkg>/...` to
   confirm the patch is really there before moving on.
2. If it isn't applied, try a **plain** `pnpm install` first (not `--force`)
   with a generous timeout (~100s) before reaching for anything more
   invasive. A clean `pnpm install` re-resolves the patched virtual store dir
   (its folder name gets a `_patch_hash=...` suffix) and applies the patch
   correctly.
3. If `--force` was already run and left things broken (e.g. "Unable to
   resolve" errors from Metro/webpack that reference packages that
   definitely exist, or `ENOENT ... _tmp_*` watcher crashes), delete the
   stale `_tmp_*` directories under the offending package's `.pnpm` folder
   and re-run a plain `pnpm install` — don't force it again.
4. After the fix lands, restart the affected workflow and check logs before
   declaring victory; the resolved virtual-store path (visible via
   `find node_modules/.pnpm -maxdepth 1 -iname "<pkg>@*"`) should show the
   `_patch_hash=...` suffix when the patch is actually active.
