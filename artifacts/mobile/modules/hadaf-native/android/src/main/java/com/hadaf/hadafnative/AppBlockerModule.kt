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
    const val PHONE_HINT_REQUEST_CODE = 4202
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
        prefs(ctx).edit()
          .putBoolean(KEY_ACTIVE, true)
          .putStringSet(KEY_BLOCKED, packageNames.toSet())
          .putLong(KEY_SESSION_END, endMs)
          .apply()
        // Notify the running service immediately if it's active
        HadafAccessibilityService.instance?.onSessionStarted(packageNames.toSet(), endMs)
      }
      Unit
    }

    Function("stopSession") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        prefs(ctx).edit()
          .putBoolean(KEY_ACTIVE, false)
          .putStringSet(KEY_BLOCKED, emptySet<String>())
          .putLong(KEY_SESSION_END, 0L)
          .apply()
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

    Function("showNotification") { title: String, body: String, sticky: Boolean, durationMinutes: Int ->
      val ctx = appContext.reactContext
      if (ctx != null) {
        val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "hadaf_focus_channel"
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          val channel = NotificationChannel(
            channelId,
            "Hadaf Focus Session",
            NotificationManager.IMPORTANCE_LOW
          )
          manager.createNotificationChannel(channel)
        }
        
        val launchIntent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        val pendingIntent = PendingIntent.getActivity(
          ctx,
          0,
          launchIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(ctx, channelId)
          .setSmallIcon(android.R.drawable.ic_dialog_info)
          .setContentTitle(title)
          .setContentText(body)
          .setPriority(NotificationCompat.PRIORITY_LOW)
          .setOngoing(sticky)
          .setContentIntent(pendingIntent)
          .setAutoCancel(!sticky)

        if (sticky && durationMinutes > 0) {
          val endMs = System.currentTimeMillis() + durationMinutes * 60_000L
          builder.setWhen(endMs)
          builder.setUsesChronometer(true)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setChronometerCountDown(true)
          }
        }
          
        manager.notify(999, builder.build())
      }
      Unit
    }

    Function("dismissNotification") {
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

    Function("getBlockedPackages") {
      val ctx = appContext.reactContext
      if (ctx == null) {
        emptyList<String>()
      } else {
        prefs(ctx).getStringSet(KEY_BLOCKED, emptySet<String>())?.toList() ?: emptyList<String>()
      }
    }
  }
}
