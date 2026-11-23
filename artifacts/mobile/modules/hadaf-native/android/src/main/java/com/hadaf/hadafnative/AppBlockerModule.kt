package com.hadaf.hadafnative

import android.content.Context

import android.app.Activity
import android.content.Intent
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.identity.GetPhoneNumberHintIntentRequest

import android.telephony.TelephonyManager

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import androidx.core.app.NotificationCompat
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
    const val PHONE_HINT_REQUEST_CODE = 4202
    const val PREFS_NAME      = "HadafBlocker"
    const val KEY_ACTIVE      = "sessionActive"
    const val KEY_BLOCKED     = "blockedPackages"
    const val KEY_SESSION_END = "sessionEndMs"
    // JSON array of upcoming blocking windows, e.g. [{"start":1700000000000,"end":1700003600000,"pkgs":["com.instagram.android"]}]
    // Written by JS (goal schedules) and enforced by HadafAccessibilityService even if the app process is dead.
    const val KEY_SCHEDULED   = "scheduledBlocks"
    private var activeAlarmRingtone: Ringtone? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var timerRunnable: Runnable? = null
    private var timerEndMs: Long = 0L
    private var timerTotalDurationLabel: String = ""
    private var cachedHourglassBitmap: Bitmap? = null

    fun getHourglassBitmap(): Bitmap {
      cachedHourglassBitmap?.let { return it }
      val size = 128
      val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bmp)

      // Rounded purple-indigo circle background matching the screenshot
      val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF5B5CEB.toInt()
        style = Paint.Style.FILL
      }
      canvas.drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), 44f, 44f, bgPaint)

      // White hourglass icon in the center
      val fgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        style = Paint.Style.FILL
      }
      val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        style = Paint.Style.STROKE
        strokeWidth = 7f
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
      }

      // Top and bottom horizontal bars
      canvas.drawLine(36f, 28f, 92f, 28f, strokePaint)
      canvas.drawLine(36f, 100f, 92f, 100f, strokePaint)

      // Upper triangle of hourglass
      val topPath = Path().apply {
        moveTo(40f, 32f)
        lineTo(88f, 32f)
        lineTo(64f, 64f)
        close()
      }
      canvas.drawPath(topPath, fgPaint)

      // Lower triangle of hourglass
      val botPath = Path().apply {
        moveTo(64f, 64f)
        lineTo(88f, 96f)
        lineTo(40f, 96f)
        close()
      }
      canvas.drawPath(botPath, fgPaint)

      cachedHourglassBitmap = bmp
      return bmp
    }

    fun formatDurationShort(totalSecs: Int): String {
      val h = totalSecs / 3600
      val m = (totalSecs % 3600) / 60
      val s = totalSecs % 60
      return when {
        h > 0 && m > 0 -> "${h} h ${m} m"
        h > 0 -> "${h} h"
        m > 0 -> "${m} m"
        else -> "${s} s"
      }
    }

    fun getStatusBarSmallIcon(ctx: Context): Int {
      val resId = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
      if (resId != 0) return resId
      val appIcon = ctx.applicationInfo.icon
      return if (appIcon != 0) appIcon else android.R.drawable.ic_lock_idle_alarm
    }

    fun getAppLogoLargeIcon(ctx: Context): Bitmap? {
      return try {
        val appIcon = ctx.applicationInfo.icon
        if (appIcon != 0) {
          android.graphics.BitmapFactory.decodeResource(ctx.resources, appIcon)
        } else null
      } catch (_: Exception) {
        null
      }
    }
  }

  private fun prefs(ctx: Context) =
    ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    Name("HadafAppBlocker")

    // ── Permission checks ──────────────────────────────────────────────────

    Function("hasAccessibilityPermission") {
      val ctx = appContext.reactContext
      if (ctx == null) {
        false
      } else {
        HadafAccessibilityService.isEnabled(ctx)
      }
    }

    Function("openAccessibilitySettings") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        ctx.startActivity(intent)
      }
      Unit
    }

    Function("hasOverlayPermission") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        true
      } else {
        val ctx = appContext.reactContext
        if (ctx == null) {
          false
        } else {
          Settings.canDrawOverlays(ctx)
        }
      }
    }

    Function("openOverlaySettings") {
      val ctx = appContext.reactContext
      if (ctx != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val intent = Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${ctx.packageName}")
        ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
        ctx.startActivity(intent)
      }
      Unit
    }

    // ── Session management ─────────────────────────────────────────────────

    /**
     * Start a focus session.
     * @param packageNames  list of package names to block
     * @param durationMinutes  session length in minutes
     */
    Function("startSession") { packageNames: List<String>, durationMinutes: Int ->
      val ctx = appContext.reactContext
      if (ctx != null) {
        val endMs = System.currentTimeMillis() + durationMinutes * 60_000L
        val pkgSet = HashSet<String>(packageNames)
        prefs(ctx).edit()
          .remove(KEY_BLOCKED)
          .commit()
        prefs(ctx).edit()
          .putBoolean(KEY_ACTIVE, true)
          .putStringSet(KEY_BLOCKED, pkgSet)
          .putLong(KEY_SESSION_END, endMs)
          .commit()
        // Notify the running service immediately if it's active
        HadafAccessibilityService.instance?.onSessionStarted(pkgSet, endMs)
      }
      Unit
    }

    Function("stopSession") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        prefs(ctx).edit()
          .putBoolean(KEY_ACTIVE, false)
          .remove(KEY_BLOCKED)
          .putLong(KEY_SESSION_END, 0L)
          .commit()
        HadafAccessibilityService.instance?.onSessionStopped()
      }
      Unit
    }

    Function("isSessionActive") {
      val ctx = appContext.reactContext
      if (ctx == null) {
        false
      } else {
        val p = prefs(ctx)
        val active = p.getBoolean(KEY_ACTIVE, false)
        val endMs  = p.getLong(KEY_SESSION_END, 0L)
        active && System.currentTimeMillis() < endMs
      }
    }

    Function("requestNotificationPermission") {
      if (Build.VERSION.SDK_INT >= 33) {
        val activity = appContext.currentActivity
        if (activity != null) {
          val perm = "android.permission.POST_NOTIFICATIONS"
          if (ContextCompat.checkSelfPermission(activity, perm) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(activity, arrayOf(perm), 101)
          }
        }
      }
      Unit
    }

    Function("showNotification") { title: String, body: String, sticky: Boolean, secondsRemaining: Int ->
      val ctx = appContext.reactContext
      if (ctx != null) {
        val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "hadaf_live_timer_channel_v3"
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          val channel = NotificationChannel(
            channelId,
            "Hadaf Live Timer",
            NotificationManager.IMPORTANCE_LOW
          ).apply {
            description = "Displays the live countdown timer for Focus and Goal sessions"
            setShowBadge(false)
            setSound(null, null)
            enableVibration(false)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
          }
          manager.createNotificationChannel(channel)
        }
        
        val launchIntent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
          ctx,
          0,
          launchIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val safeSeconds = if (secondsRemaining > 0) secondsRemaining else 0

        if (!sticky || safeSeconds <= 0) {
          val alertChannelId = "hadaf_focus_channel_v2"
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val alertChannel = NotificationChannel(
              alertChannelId,
              "Hadaf Alerts",
              NotificationManager.IMPORTANCE_HIGH
            )
            manager.createNotificationChannel(alertChannel)
          }
          val smallIcon = getStatusBarSmallIcon(ctx)
          val largeLogo = getAppLogoLargeIcon(ctx)
          val builder = NotificationCompat.Builder(ctx, alertChannelId)
            .setSmallIcon(smallIcon)
            .apply { if (largeLogo != null) setLargeIcon(largeLogo) }
            .setContentTitle(if (title.isNotEmpty()) title else "Hadaf")
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
          manager.notify(998, builder.build())
          return@Function Unit
        }

        // Sticky Live Timer Notification matching the exact screenshot:
        // Title = "MM:SS" (or "HH:MM:SS"), Subtitle = "<totalDuration> / <endClockTime HH:mm>",
        // Purple Hourglass Icon on the left, NO Cancel/Pause/Dismiss buttons!
        val candidateEndMs = System.currentTimeMillis() + (safeSeconds * 1000L)
        if (timerEndMs == 0L || kotlin.math.abs(candidateEndMs - timerEndMs) > 3500L) {
          timerEndMs = candidateEndMs
          timerTotalDurationLabel = if (body.matches(Regex("^\\d+\\s*(h|hr|hrs|m|min|mins|s|sec).*"))) {
            body
          } else {
            formatDurationShort(safeSeconds)
          }
        }

        timerRunnable?.let { mainHandler.removeCallbacks(it) }

        val tickRunnable = object : Runnable {
          override fun run() {
            val now = System.currentTimeMillis()
            val remSecs = ((timerEndMs - now + 500L) / 1000L).toInt()
            if (remSecs <= 0) {
              manager.cancel(999)
              timerEndMs = 0L
              return
            }
            val hrs = remSecs / 3600
            val mins = (remSecs % 3600) / 60
            val secs = remSecs % 60
            val timeStr = if (hrs > 0) {
              String.format("%02d:%02d:%02d", hrs, mins, secs)
            } else {
              String.format("%02d:%02d", mins, secs)
            }

            val endClockStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(timerEndMs))
            val subLine = "$timerTotalDurationLabel / $endClockStr"

            val builder = NotificationCompat.Builder(ctx, channelId)
              .setSmallIcon(getStatusBarSmallIcon(ctx))
              .setLargeIcon(getHourglassBitmap())
              .setColor(0xFF5B5CEB.toInt())
              .setContentTitle(timeStr)
              .setContentText(subLine)
              .setPriority(NotificationCompat.PRIORITY_DEFAULT)
              .setCategory(NotificationCompat.CATEGORY_PROGRESS)
              .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
              .setOngoing(true)
              .setAutoCancel(false)
              .setShowWhen(false)
              .setOnlyAlertOnce(true)
              .setSound(null)
              .setDefaults(0)
              .setContentIntent(pendingIntent)

            manager.notify(999, builder.build())
            mainHandler.postDelayed(this, 1000L)
          }
        }
        timerRunnable = tickRunnable
        tickRunnable.run()
      }
      Unit
    }

    Function("playCompletionAlarm") { title: String, body: String ->
      val ctx = appContext.reactContext
      if (ctx != null) {
        try {
          activeAlarmRingtone?.stop()
        } catch (_: Exception) {}

        val alarmUri: Uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
          ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
          ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        try {
          val ringtone = RingtoneManager.getRingtone(ctx, alarmUri)
          if (ringtone != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
              ringtone.audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            }
            activeAlarmRingtone = ringtone
            ringtone.play()
            // Automatically stop the alarm sound after 6 seconds so it doesn't ring forever
            Handler(Looper.getMainLooper()).postDelayed({
              try {
                if (activeAlarmRingtone == ringtone && ringtone.isPlaying) {
                  ringtone.stop()
                }
              } catch (_: Exception) {}
            }, 6000L)
          }
        } catch (_: Exception) {}

        // Also post a high-priority alarm notification with the default alarm sound
        try {
          val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
          val alarmChannelId = "hadaf_alarm_channel_v1"
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
              alarmChannelId,
              "Hadaf Session Complete Alarm",
              NotificationManager.IMPORTANCE_HIGH
            ).apply {
              description = "Plays default alarm sound when a Focus or Goal session completes"
              enableVibration(true)
              vibrationPattern = longArrayOf(0, 600, 200, 600, 200, 800)
              val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
              setSound(alarmUri, attrs)
              lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(channel)
          }

          val launchIntent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
          }
          val pendingIntent = PendingIntent.getActivity(
            ctx,
            1,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
          )
          val smallIcon = getStatusBarSmallIcon(ctx)
          val largeLogo = getAppLogoLargeIcon(ctx)

          val notif = NotificationCompat.Builder(ctx, alarmChannelId)
            .setSmallIcon(smallIcon)
            .apply { if (largeLogo != null) setLargeIcon(largeLogo) }
            .setContentTitle(if (title.isNotEmpty()) title else "Session Completed ⏰")
            .setContentText(if (body.isNotEmpty()) body else "Your timer is complete!")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setSound(alarmUri)
            .setVibrate(longArrayOf(0, 600, 200, 600, 200, 800))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

          manager.notify(1001, notif)
        } catch (_: Exception) {}
      }
      Unit
    }

    Function("stopCompletionAlarm") {
      try {
        activeAlarmRingtone?.stop()
        activeAlarmRingtone = null
      } catch (_: Exception) {}
      Unit
    }

    Function("dismissNotification") {
      timerRunnable?.let { mainHandler.removeCallbacks(it) }
      timerRunnable = null
      timerEndMs = 0L
      val ctx = appContext.reactContext
      if (ctx != null) {
        val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(999)
      }
      Unit
    }

    Function("getDevicePhoneNumber") {
      val ctx = appContext.reactContext
      var num = ""
      if (ctx != null) {
        try {
          val tMgr = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
          num = tMgr.line1Number ?: ""
        } catch (e: Exception) {
          // ignore
        }
      }
      num
    }

    Function("requestPhoneNumberHint") {
      val activity = appContext.currentActivity ?: return@Function false
      val request = GetPhoneNumberHintIntentRequest.builder().build()
      
      Identity.getSignInClient(activity)
        .getPhoneNumberHintIntent(request)
        .addOnSuccessListener { pendingIntent ->
          try {
            activity.startIntentSenderForResult(
              pendingIntent.intentSender,
              PHONE_HINT_REQUEST_CODE,
              null, 0, 0, 0
            )
          } catch (e: Exception) {
            // ignore
          }
        }
      true
    }

    Events("onPhoneNumberFetched")

    OnActivityResult { _, payload ->
      val requestCode = payload.requestCode
      val resultCode = payload.resultCode
      val data = payload.data
      if (requestCode == PHONE_HINT_REQUEST_CODE && resultCode == Activity.RESULT_OK && data != null) {
        try {
          val ctx = appContext.reactContext
          if (ctx != null) {
            val phoneNumber = Identity.getSignInClient(ctx).getPhoneNumberFromIntent(data)
            sendEvent("onPhoneNumberFetched", mapOf("phoneNumber" to phoneNumber))
          }
        } catch (e: Exception) {
          // ignore
        }
      }
    }

    // ── Scheduled blocking windows (goals) ─────────────────────────────────

    /** Replace the whole list of scheduled blocking windows (JSON array string). */
    Function("setScheduledBlocks") { json: String ->
      val ctx = appContext.reactContext
      if (ctx != null) {
        prefs(ctx).edit().putString(KEY_SCHEDULED, json).apply()
      }
      Unit
    }

    Function("clearScheduledBlocks") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        prefs(ctx).edit().remove(KEY_SCHEDULED).apply()
      }
      Unit
    }

    Function("getScheduledBlocks") {
      val ctx = appContext.reactContext
      if (ctx == null) {
        "[]"
      } else {
        prefs(ctx).getString(KEY_SCHEDULED, "[]") ?: "[]"
      }
    }

    Function("getBlockedPackages") {
      val ctx = appContext.reactContext
      if (ctx == null) {
        emptyList<String>()
      } else {
        prefs(ctx).getStringSet(KEY_BLOCKED, emptySet<String>())?.toList() ?: emptyList<String>()
      }
    }

    // ── Network connectivity check ─────────────────────────────────────────
    Function("isNetworkConnected") {
      val ctx = appContext.reactContext ?: return@Function true
      try {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          val network = cm.activeNetwork ?: return@Function false
          val caps = cm.getNetworkCapabilities(network) ?: return@Function false
          caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
              caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
              caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ||
              caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN))
        } else {
          @Suppress("DEPRECATION")
          val info = cm.activeNetworkInfo
          @Suppress("DEPRECATION")
          info != null && info.isConnected
        }
      } catch (_: Exception) {
        true
      }
    }
  }
}
