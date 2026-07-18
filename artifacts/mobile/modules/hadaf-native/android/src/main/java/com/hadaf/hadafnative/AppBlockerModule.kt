package com.hadaf.hadafnative

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * AppBlockerModule — manages the list of blocked package names and controls
 * the HadafAccessibilityService session state.
 *
 * The actual blocking happens inside HadafAccessibilityService, which runs as
 * a background Accessibility Service. This module:
 *   1. Starts / stops a focus session (writes state to SharedPreferences)
 *   2. Adds / removes packages from the blocked list
 *   3. Checks whether Accessibility Service permission is granted
 *   4. Opens the Accessibility Settings screen for the user to enable it
 *   5. Checks / requests the SYSTEM_ALERT_WINDOW permission (overlay)
 */
class AppBlockerModule : Module() {
  companion object {
    const val PREFS_NAME      = "HadafBlocker"
    const val KEY_ACTIVE      = "sessionActive"
    const val KEY_BLOCKED     = "blockedPackages"
    const val KEY_SESSION_END = "sessionEndMs"
  }

  private fun prefs(ctx: Context) =
    ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    Name("HadafAppBlocker")

    // ── Permission checks ──────────────────────────────────────────────────

    Function("hasAccessibilityPermission") {
      val ctx = appContext.reactContext ?: return@Function false
      HadafAccessibilityService.isEnabled(ctx)
    }

    Function("openAccessibilitySettings") {
      val ctx = appContext.reactContext ?: return@Function
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      ctx.startActivity(intent)
    }

    Function("hasOverlayPermission") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return@Function true
      val ctx = appContext.reactContext ?: return@Function false
      Settings.canDrawOverlays(ctx)
    }

    Function("openOverlaySettings") {
      val ctx = appContext.reactContext ?: return@Function
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val intent = Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${ctx.packageName}")
        ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
        ctx.startActivity(intent)
      }
    }

    // ── Session management ─────────────────────────────────────────────────

    /**
     * Start a focus session.
     * @param packageNames  list of package names to block
     * @param durationMinutes  session length in minutes
     */
    Function("startSession") { packageNames: List<String>, durationMinutes: Int ->
      val ctx = appContext.reactContext ?: return@Function
      val endMs = System.currentTimeMillis() + durationMinutes * 60_000L
      prefs(ctx).edit()
        .putBoolean(KEY_ACTIVE, true)
        .putStringSet(KEY_BLOCKED, packageNames.toSet())
        .putLong(KEY_SESSION_END, endMs)
        .apply()
      // Notify the running service immediately if it's active
      HadafAccessibilityService.instance?.onSessionStarted(packageNames.toSet(), endMs)
    }

    Function("stopSession") {
      val ctx = appContext.reactContext ?: return@Function
      prefs(ctx).edit()
        .putBoolean(KEY_ACTIVE, false)
        .putStringSet(KEY_BLOCKED, emptySet())
        .putLong(KEY_SESSION_END, 0L)
        .apply()
      HadafAccessibilityService.instance?.onSessionStopped()
    }

    Function("isSessionActive") {
      val ctx = appContext.reactContext ?: return@Function false
      val p = prefs(ctx)
      val active = p.getBoolean(KEY_ACTIVE, false)
      val endMs  = p.getLong(KEY_SESSION_END, 0L)
      active && System.currentTimeMillis() < endMs
    }

    Function("getBlockedPackages") {
      val ctx = appContext.reactContext ?: return@Function emptyList<String>()
      prefs(ctx).getStringSet(KEY_BLOCKED, emptySet())?.toList() ?: emptyList()
    }
  }
}
