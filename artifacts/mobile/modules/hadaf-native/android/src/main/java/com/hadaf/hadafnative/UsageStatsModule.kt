package com.hadaf.hadafnative

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
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
      Unit
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

      val nowCal = Calendar.getInstance()
      val endTime = nowCal.timeInMillis

      // Align startTime to 00:00:00.000 local midnight (Digital Wellbeing standard).
      // days == 1 -> today since 00:00 midnight.
      // days == 7 -> last 7 calendar days including today.
      val startCal = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
        val extraDaysBack = (days.coerceIn(1, 30) - 1).coerceAtLeast(0)
        if (extraDaysBack > 0) {
          add(Calendar.DAY_OF_YEAR, -extraDaysBack)
        }
      }
      val startTime = startCal.timeInMillis

      // Identify the default home launcher package so we never count home screen idle time
      val homeLauncherPkg = try {
        val homeIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        pm.resolveActivity(homeIntent, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
      } catch (_: Exception) {
        null
      }

      val ignoredPackages = setOfNotNull(
        ctx.packageName,
        homeLauncherPkg,
        "com.android.systemui",
        "com.android.settings",
        "com.google.android.gms",
        "com.google.android.gsf",
        "com.google.android.packageinstaller",
        "com.android.packageinstaller",
        "com.google.android.permissioncontroller",
        "com.android.permissioncontroller",
        "com.google.android.inputmethod.latin",
        "com.samsung.android.honeyboard",
        "com.miui.home",
        "com.sec.android.app.launcher",
        "com.google.android.apps.nexuslauncher",
        "com.android.launcher",
        "com.android.launcher3",
        "net.oneplus.launcher",
        "com.oppo.launcher",
        "com.bbk.launcher2"
      )

      fun isIgnoredPkg(pkg: String): Boolean {
        if (ignoredPackages.contains(pkg)) return true
        val lower = pkg.lowercase()
        return lower.contains(".launcher") ||
          lower.contains("inputmethod") ||
          lower.contains("systemui") ||
          lower.contains("wallpaper")
      }

      // 1) Primary Digital Wellbeing calculation: sum exact foreground intervals from queryEvents
      val aggregated = mutableMapOf<String, Long>()
      try {
        val events = usageManager.queryEvents(startTime, endTime)
        val activeStartByPkg = mutableMapOf<String, Long>()
        val event = UsageEvents.Event()

        while (events != null && events.hasNextEvent()) {
          events.getNextEvent(event)
          val pkg = event.packageName ?: continue
          if (isIgnoredPkg(pkg)) continue

          when (event.eventType) {
            UsageEvents.Event.ACTIVITY_RESUMED -> {
              activeStartByPkg[pkg] = event.timeStamp
            }
            UsageEvents.Event.ACTIVITY_PAUSED,
            UsageEvents.Event.ACTIVITY_STOPPED -> {
              val resumedAt = activeStartByPkg.remove(pkg)
              if (resumedAt != null && event.timeStamp > resumedAt) {
                val delta = (event.timeStamp - resumedAt).coerceAtMost(6 * 3600_000L)
                aggregated[pkg] = (aggregated[pkg] ?: 0L) + delta
              }
            }
          }
        }
        // Close any currently open foreground app up to endTime
        for ((pkg, resumedAt) in activeStartByPkg) {
          if (endTime > resumedAt) {
            val delta = (endTime - resumedAt).coerceAtMost(2 * 3600_000L)
            aggregated[pkg] = (aggregated[pkg] ?: 0L) + delta
          }
        }
      } catch (_: Exception) {
        // Fallback below if queryEvents fails
      }

      // 2) Fallback to queryUsageStats if queryEvents returned no events (e.g. older OS retention for >7 days)
      if (aggregated.isEmpty()) {
        val stats = usageManager.queryUsageStats(
          UsageStatsManager.INTERVAL_DAILY,
          startTime,
          endTime
        )
        for (stat in stats) {
          if (stat.totalTimeInForeground <= 0) continue
          if (isIgnoredPkg(stat.packageName)) continue
          // Skip buckets that ended before startTime
          if (stat.lastTimeStamp < startTime) continue
          // For days == 1, skip yesterday's bucket whose firstTimeStamp is before today's midnight
          if (days == 1 && stat.firstTimeStamp < startTime - 2 * 3600_000L) continue
          aggregated[stat.packageName] =
            (aggregated[stat.packageName] ?: 0L) + stat.totalTimeInForeground
        }
      }

      val result = aggregated.entries
        .sortedByDescending { it.value }
        .take(30)
        .mapNotNull { (pkg, timeMs) ->
          val minutes = (timeMs / 60_000).toInt()
          if (minutes < 1) return@mapNotNull null

          val appInfo: ApplicationInfo? = try {
            pm.getApplicationInfo(pkg, 0)
          } catch (_: Exception) {
            null
          }

          val label = try {
            if (appInfo != null) pm.getApplicationLabel(appInfo).toString() else throw Exception("no appInfo")
          } catch (_: Exception) {
            when {
              pkg.contains("instagram") -> "Instagram"
              pkg.contains("tiktok") || pkg.contains("musically") || pkg.contains("trill") -> "TikTok"
              pkg.contains("youtube") -> "YouTube"
              pkg.contains("snapchat") -> "Snapchat"
              pkg.contains("facebook") -> "Facebook"
              pkg.contains("twitter") -> "Twitter"
              pkg.contains("reddit") -> "Reddit"
              pkg.contains("discord") -> "Discord"
              pkg.contains("whatsapp") -> "WhatsApp"
              pkg.contains("telegram") -> "Telegram"
              pkg.contains("netflix") -> "Netflix"
              pkg.contains("twitch") -> "Twitch"
              pkg.contains("spotify") -> "Spotify"
              pkg.contains("chrome") -> "Chrome"
              pkg.contains("firefox") -> "Firefox"
              pkg.contains("bgmi") || pkg.contains("pubg") -> "BGMI / PUBG"
              pkg.contains("freefire") -> "Free Fire"
              else -> pkg.substringAfterLast('.').replaceFirstChar { it.uppercase() }
            }
          }

          val lowerPkg = pkg.lowercase()
          val lowerLabel = label.lowercase()

          val osCategory = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && appInfo != null) {
            appInfo.category
          } else {
            -1
          }

          val category = when {
            osCategory == ApplicationInfo.CATEGORY_GAME ||
            lowerPkg.contains("game") || lowerPkg.contains("games") ||
            lowerPkg.contains("pubg") || lowerPkg.contains("bgmi") ||
            lowerPkg.contains("freefire") || lowerPkg.contains("supercell") ||
            lowerPkg.contains("roblox") || lowerPkg.contains("minecraft") ||
            lowerPkg.contains("genshin") || lowerPkg.contains("candycrush") ||
            lowerPkg.contains("ludo") || lowerPkg.contains("callofduty") ||
            lowerPkg.contains("activision") || lowerPkg.contains("brawlstars") ||
            lowerPkg.contains("clash") || lowerPkg.contains("subwaysurf") ||
            lowerPkg.contains("miniclip") || lowerPkg.contains("zynga") ||
            lowerPkg.contains("gameloft") || lowerPkg.contains("rovio") ||
            lowerPkg.contains("moonton") || lowerLabel.contains("game") -> "Games"

            osCategory == ApplicationInfo.CATEGORY_SOCIAL ||
            lowerPkg.contains("instagram") || lowerPkg.contains("facebook") ||
            lowerPkg.contains("twitter") || lowerPkg.contains("snapchat") ||
            lowerPkg.contains("tiktok") || lowerPkg.contains("musically") ||
            lowerPkg.contains("trill") || lowerPkg.contains("reddit") ||
            lowerPkg.contains("discord") || lowerPkg.contains("whatsapp") ||
            lowerPkg.contains("telegram") || lowerPkg.contains("pinterest") ||
            lowerPkg.contains("threads") || lowerPkg.contains("linkedin") ||
            lowerPkg.contains("youtube") || lowerPkg.contains("twitch") -> "Social"

            lowerPkg.contains("netflix") || lowerPkg.contains("spotify") ||
            lowerPkg.contains("prime") || lowerPkg.contains("hotstar") -> "Entertainment"

            lowerPkg.contains("chrome") || lowerPkg.contains("firefox") ||
            lowerPkg.contains("safari") || lowerPkg.contains("browser") -> "Browser"

            osCategory == ApplicationInfo.CATEGORY_PRODUCTIVITY ||
            lowerPkg.contains("gmail") || lowerPkg.contains("outlook") ||
            lowerPkg.contains("slack") || lowerPkg.contains("teams") -> "Productivity"

            else -> "Other"
          }

          mapOf(
            "appName" to label,
            "packageName" to pkg,
            "totalMinutes" to minutes,
            "category" to category
          )
        }

      promise.resolve(result)
    }
  }
}
