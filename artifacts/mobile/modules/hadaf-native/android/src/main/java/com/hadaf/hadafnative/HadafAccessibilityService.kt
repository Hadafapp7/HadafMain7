package com.hadaf.hadafnative

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import android.text.TextUtils
import android.view.accessibility.AccessibilityEvent
import org.json.JSONArray

/**
 * HadafAccessibilityService
 *
 * Runs as a persistent background Accessibility Service.
 * When a focus session is active (or a scheduled goal window is open), every time a blocked app is
 * detected in foreground, this service immediately brings Hadaf directly back to the foreground so
 * the user cannot access the blocked app.
 */
class HadafAccessibilityService : AccessibilityService() {

  companion object {
    var instance: HadafAccessibilityService? = null
      private set

    fun isEnabled(ctx: Context): Boolean {
      val expectedComponent = ComponentName(ctx, HadafAccessibilityService::class.java)
      val enabledServices = Settings.Secure.getString(
        ctx.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
      ) ?: return false
      val colonSplitter = TextUtils.SimpleStringSplitter(':')
      colonSplitter.setString(enabledServices)
      while (colonSplitter.hasNext()) {
        val componentName = ComponentName.unflattenFromString(colonSplitter.next())
        if (componentName != null && componentName == expectedComponent) return true
      }
      return false
    }
  }

  private var blockedPackages: Set<String> = emptySet()
  private var sessionEndMs: Long = 0L
  private lateinit var prefs: SharedPreferences

  override fun onCreate() {
    super.onCreate()
    instance = this
    prefs = getSharedPreferences(AppBlockerModule.PREFS_NAME, Context.MODE_PRIVATE)
    restoreSessionState()
  }

  override fun onServiceConnected() {
    val info = AccessibilityServiceInfo().apply {
      eventTypes          = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
      feedbackType        = AccessibilityServiceInfo.FEEDBACK_GENERIC
      flags               = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
      notificationTimeout = 50
    }
    serviceInfo = info
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    if (pkg == packageName) return // never block Hadaf itself

    val now = System.currentTimeMillis()
    var shouldBlock = false

    // 1) Live focus session
    if (sessionEndMs > 0L) {
      if (now > sessionEndMs) {
        // Auto-expire sessions
        onSessionStopped()
      } else if (blockedPackages.contains(pkg)) {
        shouldBlock = true
      }
    }

    // 2) Scheduled goal windows (work even when the Hadaf app process is not running)
    if (!shouldBlock && isInScheduledWindow(pkg, now)) {
      shouldBlock = true
    }

    if (shouldBlock) {
      try {
        val launchIntent = packageManager
          .getLaunchIntentForPackage(packageName)
          ?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
          }
        launchIntent?.let { startActivity(it) }
      } catch (_: Exception) {}
    }
  }

  override fun onInterrupt() {}

  override fun onDestroy() {
    instance = null
    super.onDestroy()
  }

  // ── Session state ──────────────────────────────────────────────────────────

  fun onSessionStarted(packages: Set<String>, endMs: Long) {
    blockedPackages = packages
    sessionEndMs    = endMs
  }

  fun onSessionStopped() {
    blockedPackages = emptySet()
    sessionEndMs    = 0L
    prefs.edit().putBoolean(AppBlockerModule.KEY_ACTIVE, false).apply()
  }

  private fun restoreSessionState() {
    val active = prefs.getBoolean(AppBlockerModule.KEY_ACTIVE, false)
    val endMs  = prefs.getLong(AppBlockerModule.KEY_SESSION_END, 0L)
    if (active && System.currentTimeMillis() < endMs) {
      blockedPackages = prefs.getStringSet(AppBlockerModule.KEY_BLOCKED, emptySet()) ?: emptySet()
      sessionEndMs    = endMs
    }
  }

  // ── Scheduled windows ──────────────────────────────────────────────────────

  private fun isInScheduledWindow(pkg: String, now: Long): Boolean {
    try {
      val raw = prefs.getString(AppBlockerModule.KEY_SCHEDULED, null)
      if (raw.isNullOrEmpty()) return false
      val windows = JSONArray(raw)
      for (i in 0 until windows.length()) {
        val window = windows.optJSONObject(i) ?: continue
        val start = window.optLong("start", 0L)
        val end = window.optLong("end", 0L)
        if (now < start || now >= end) continue
        val pkgs = window.optJSONArray("pkgs") ?: continue
        for (j in 0 until pkgs.length()) {
          if (pkgs.optString(j) == pkg) return true
        }
      }
    } catch (_: Exception) {
      // Malformed JSON must never crash the accessibility service.
    }
    return false
  }
}
