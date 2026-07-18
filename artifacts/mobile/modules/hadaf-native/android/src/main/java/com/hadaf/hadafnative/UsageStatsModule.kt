package com.hadaf.hadafnative

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.util.Calendar

class UsageStatsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HadafUsageStats")

    // Check whether the PACKAGE_USAGE_STATS permission is granted.
    // This permission cannot be granted programmatically — the user must
    // enable it manually in Settings > Apps > Special app access > Usage access.
    Function("hasUsagePermission") {
      val ctx = appContext.reactContext
      if (ctx == null) {
        false
      } else {
        val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          appOps.unsafeCheckOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(),
            ctx.packageName
          )
        } else {
          @Suppress("DEPRECATION")
          appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(),
            ctx.packageName
          )
        }
        mode == AppOpsManager.MODE_ALLOWED
      }
    }

    // Open the system Usage Access settings screen so the user can grant permission.
    Function("openUsageAccessSettings") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        ctx.startActivity(intent)
      }
    }

    // Return per-app usage stats for the last N days (default 7).
    // Each entry: { appName, packageName, totalMinutes, category, lastUsed }
    AsyncFunction("getUsageStats") { days: Int, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) {
        promise.reject("ERR_NO_CONTEXT", "No React context available", null)
        return@AsyncFunction
      }

      val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        appOps.unsafeCheckOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          android.os.Process.myUid(),
          ctx.packageName
        )
      } else {
        @Suppress("DEPRECATION")
        appOps.checkOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          android.os.Process.myUid(),
          ctx.packageName
        )
      }

      if (mode != AppOpsManager.MODE_ALLOWED) {
        promise.reject("ERR_NO_PERMISSION", "Usage access permission not granted", null)
        return@AsyncFunction
      }

      val usageManager = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val pm = ctx.packageManager

      val calendar = Calendar.getInstance()
      val endTime = calendar.timeInMillis
      calendar.add(Calendar.DAY_OF_YEAR, -(days.coerceIn(1, 30)))
      val startTime = calendar.timeInMillis

      val stats = usageManager.queryUsageStats(
        UsageStatsManager.INTERVAL_DAILY,
        startTime,
        endTime
      )

      // Aggregate by package, filter out system apps and our own app
      val aggregated = mutableMapOf<String, Long>()
      for (stat in stats) {
        if (stat.totalTimeInForeground <= 0) continue
        if (stat.packageName == ctx.packageName) continue
        aggregated[stat.packageName] =
          (aggregated[stat.packageName] ?: 0L) + stat.totalTimeInForeground
      }

      val result = aggregated.entries
        .sortedByDescending { it.value }
        .take(30)
        .mapNotNull { (pkg, timeMs) ->
          try {
            val appInfo = pm.getApplicationInfo(pkg, 0)
            val label = pm.getApplicationLabel(appInfo).toString()
            val minutes = (timeMs / 60_000).toInt()
            if (minutes < 1) return@mapNotNull null

            val category = when {
              pkg.contains("instagram") || pkg.contains("facebook") ||
              pkg.contains("twitter") || pkg.contains("snapchat") ||
              pkg.contains("tiktok") || pkg.contains("reddit") ||
              pkg.contains("discord") || pkg.contains("whatsapp") ||
              pkg.contains("telegram") -> "Social"
              pkg.contains("youtube") || pkg.contains("netflix") ||
              pkg.contains("twitch") || pkg.contains("spotify") ||
              pkg.contains("prime") -> "Entertainment"
              pkg.contains("chrome") || pkg.contains("firefox") ||
              pkg.contains("safari") || pkg.contains("browser") -> "Browser"
              pkg.contains("gmail") || pkg.contains("outlook") ||
              pkg.contains("slack") || pkg.contains("teams") -> "Productivity"
              pkg.contains("game") || pkg.contains("games") -> "Gaming"
              else -> "Other"
            }

            mapOf(
              "appName" to label,
              "packageName" to pkg,
              "totalMinutes" to minutes,
              "category" to category
            )
          } catch (_: Exception) {
            null
          }
        }

      promise.resolve(result)
    }
  }
}
