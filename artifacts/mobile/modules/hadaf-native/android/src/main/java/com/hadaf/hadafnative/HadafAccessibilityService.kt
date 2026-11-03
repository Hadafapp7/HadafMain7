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

/**
 * HadafAccessibilityService
 *
 * Runs as a persistent background Accessibility Service.
 * When a focus session is active, every time a blocked app is detected in foreground,
 * this service immediately brings Hadaf directly back to the foreground so the user
 * cannot access the blocked app and is returned straight to the active focus screen.
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

    // Auto-expire sessions
    if (System.currentTimeMillis() > sessionEndMs) {
      onSessionStopped()
      return
    }

    if (blockedPackages.contains(pkg)) {
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
}
