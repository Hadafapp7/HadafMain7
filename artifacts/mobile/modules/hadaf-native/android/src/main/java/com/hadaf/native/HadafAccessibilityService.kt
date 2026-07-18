package com.hadaf.native

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.text.TextUtils
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.Button
import android.widget.TextView

/**
 * HadafAccessibilityService
 *
 * Runs as a persistent background Accessibility Service.
 * When a focus session is active, every time the foreground app changes
 * this service checks if the new app's package is in the blocked list.
 * If it is, it immediately draws a full-screen overlay (SYSTEM_ALERT_WINDOW)
 * over the top of the blocked app so the user cannot interact with it.
 *
 * Registration: declared in AndroidManifest.xml (injected by the Expo plugin).
 * The user must enable it once in:
 *   Settings → Accessibility → Hadaf → Turn on
 */
class HadafAccessibilityService : AccessibilityService() {

  companion object {
    /** Live singleton — null when the service isn't running. */
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
  private var overlayView: View? = null
  private lateinit var windowManager: WindowManager
  private lateinit var prefs: SharedPreferences

  override fun onCreate() {
    super.onCreate()
    instance = this
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    prefs = getSharedPreferences(AppBlockerModule.PREFS_NAME, Context.MODE_PRIVATE)
    // Restore state in case the service was restarted by the OS
    restoreSessionState()
  }

  override fun onServiceConnected() {
    val info = AccessibilityServiceInfo().apply {
      eventTypes       = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
      feedbackType     = AccessibilityServiceInfo.FEEDBACK_GENERIC
      flags            = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
      notificationTimeout = 100
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
      showBlockOverlay(pkg)
    } else {
      hideBlockOverlay()
    }
  }

  override fun onInterrupt() { hideBlockOverlay() }

  override fun onDestroy() {
    instance = null
    hideBlockOverlay()
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
    hideBlockOverlay()
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

  // ── Overlay ────────────────────────────────────────────────────────────────

  private fun showBlockOverlay(blockedPkg: String) {
    if (overlayView != null) return // already shown

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      return
    }

    val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_SYSTEM_ALERT

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      layoutType,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    ).apply { gravity = Gravity.TOP or Gravity.START }

    val view = createBlockView(blockedPkg)
    overlayView = view

    try {
      windowManager.addView(view, params)
    } catch (e: Exception) {
      overlayView = null
    }
  }

  private fun hideBlockOverlay() {
    overlayView?.let {
      try { windowManager.removeView(it) } catch (_: Exception) {}
      overlayView = null
    }
  }

  private fun createBlockView(blockedPkg: String): View {
    // Programmatic layout — no XML resources needed
    val layout = android.widget.LinearLayout(this).apply {
      orientation = android.widget.LinearLayout.VERTICAL
      gravity     = Gravity.CENTER
      setBackgroundColor(0xFFF5F5F5.toInt())
      setPadding(64, 64, 64, 64)
    }

    val lockIcon = TextView(this).apply {
      text     = "🔒"
      textSize = 64f
      gravity  = Gravity.CENTER
    }
    layout.addView(lockIcon)

    val title = TextView(this).apply {
      text      = "Focus Mode Active"
      textSize  = 22f
      gravity   = Gravity.CENTER
      setTypeface(null, android.graphics.Typeface.BOLD)
      setTextColor(0xFF111111.toInt())
      setPadding(0, 24, 0, 12)
    }
    layout.addView(title)

    val pm         = packageManager
    val appLabel   = try {
      pm.getApplicationLabel(pm.getApplicationInfo(blockedPkg, 0)).toString()
    } catch (_: Exception) { blockedPkg }

    val sub = TextView(this).apply {
      text      = "$appLabel is blocked during your focus session.\nStay on track — you've got this."
      textSize  = 15f
      gravity   = Gravity.CENTER
      setTextColor(0xFF666666.toInt())
      lineHeight = (textSize * 1.5f).toInt()
    }
    layout.addView(sub)

    val btn = Button(this).apply {
      text            = "Back to Hadaf"
      textSize        = 14f
      setTextColor(0xFFFFFFFF.toInt())
      setBackgroundColor(0xFF111111.toInt())
      val lp          = android.widget.LinearLayout.LayoutParams(
        android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
        android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply { topMargin = 40 }
      layoutParams    = lp
      setPadding(64, 24, 64, 24)
      setOnClickListener {
        hideBlockOverlay()
        // Bring Hadaf back to the foreground
        val intent = packageManager
          .getLaunchIntentForPackage(packageName)
          ?.apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT }
        intent?.let { startActivity(it) }
      }
    }
    layout.addView(btn)

    return layout
  }
}
