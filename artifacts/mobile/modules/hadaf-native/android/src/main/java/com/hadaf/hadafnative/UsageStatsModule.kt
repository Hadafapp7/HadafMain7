package com.hadaf.hadafnative

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.os.Build
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.ByteArrayOutputStream
import java.util.Calendar
import java.util.concurrent.ConcurrentHashMap

class UsageStatsModule : Module() {
  companion object {
    private val bwIconCache = ConcurrentHashMap<String, String>()

    fun getBlackAndWhiteIconDataUri(pm: PackageManager, pkg: String): String {
      bwIconCache[pkg]?.let { return it }
      return try {
        val drawable = pm.getApplicationIcon(pkg)
        val size = 72
        val rawBmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val rawCanvas = Canvas(rawBmp)
        drawable.setBounds(0, 0, size, size)
        drawable.draw(rawCanvas)

        val bwBmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val bwCanvas = Canvas(bwBmp)
        val grayMatrix = ColorMatrix().apply { setSaturation(0f) }
        val contrast = 1.25f
        val translate = (-0.5f * contrast + 0.5f) * 255f
        val contrastMatrix = ColorMatrix(
          floatArrayOf(
            contrast, 0f, 0f, 0f, translate,
            0f, contrast, 0f, 0f, translate,
            0f, 0f, contrast, 0f, translate,
            0f, 0f, 0f, 1f, 0f
          )
        )
        grayMatrix.postConcat(contrastMatrix)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
          colorFilter = ColorMatrixColorFilter(grayMatrix)
        }
        bwCanvas.drawBitmap(rawBmp, 0f, 0f, paint)
        rawBmp.recycle()

        val baos = ByteArrayOutputStream()
        bwBmp.compress(Bitmap.CompressFormat.PNG, 90, baos)
        bwBmp.recycle()
        val b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
        val dataUri = "data:image/png;base64,$b64"
        bwIconCache[pkg] = dataUri
        dataUri
      } catch (_: Exception) {
        ""
      }
    }
  }

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
        "com.android.phone",
        "com.android.incallui",
        "com.android.server.telecom",
        "com.android.dialer",
        "com.android.contacts",
        "com.samsung.android.incallui",
        "com.samsung.android.dialer",
        "com.samsung.android.contacts",
        "com.samsung.android.app.telephonyui",
        "com.google.android.dialer",
        "com.google.android.contacts",
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
          lower.contains("wallpaper") ||
          lower.contains("incallui") ||
          lower.contains("telephonyui") ||
          lower.contains("server.telecom") ||
          lower.endsWith(".dialer") ||
          lower.endsWith(".phone")
      }

      // 1) Digital Wellbeing exact foreground calculation from UsageEvents:
      // Tracks active resumed activities per package and ONLY closes a package when its last resumed
      // activity pauses, another package enters foreground, or the screen turns off (never on delayed ACTIVITY_STOPPED!).
      val eventsAggregated = mutableMapOf<String, Long>()
      try {
        val events = usageManager.queryEvents(startTime, endTime)
        val activeActivitiesByPkg = mutableMapOf<String, MutableSet<String>>()
        val pkgResumeTime = mutableMapOf<String, Long>()
        val event = UsageEvents.Event()

        fun closePkg(targetPkg: String, timestamp: Long) {
          val resumedAt = pkgResumeTime.remove(targetPkg)
          activeActivitiesByPkg.remove(targetPkg)
          if (resumedAt != null && timestamp > resumedAt) {
            val delta = (timestamp - resumedAt).coerceAtMost(6 * 3600_000L)
            eventsAggregated[targetPkg] = (eventsAggregated[targetPkg] ?: 0L) + delta
          }
        }

        fun closeAllPkgs(timestamp: Long) {
          val openPkgs = pkgResumeTime.keys.toList()
          for (openPkg in openPkgs) {
            closePkg(openPkg, timestamp)
          }
        }

        while (events != null && events.hasNextEvent()) {
          events.getNextEvent(event)
          val evType = event.eventType
          val ts = event.timeStamp

          // Screen turned off or device shut down -> all foreground activities stop accumulating screen time
          if (evType == UsageEvents.Event.SCREEN_NON_INTERACTIVE || evType == UsageEvents.Event.DEVICE_SHUTDOWN) {
            closeAllPkgs(ts)
            continue
          }

          val pkg = event.packageName ?: continue
          if (isIgnoredPkg(pkg)) {
            if (evType == UsageEvents.Event.ACTIVITY_RESUMED) {
              // User went to home launcher / system UI -> close any currently open app
              closeAllPkgs(ts)
            }
            continue
          }

          val cls = event.className ?: "__default__"

          when (evType) {
            UsageEvents.Event.ACTIVITY_RESUMED -> {
              // Close any OTHER package that was previously in foreground
              val otherOpen = pkgResumeTime.keys.filter { it != pkg }
              for (other in otherOpen) {
                closePkg(other, ts)
              }
              val set = activeActivitiesByPkg.getOrPut(pkg) { mutableSetOf() }
              set.add(cls)
              if (!pkgResumeTime.containsKey(pkg)) {
                pkgResumeTime[pkg] = ts
              }
            }
            UsageEvents.Event.ACTIVITY_PAUSED -> {
              val set = activeActivitiesByPkg[pkg]
              set?.remove(cls)
              if (set == null || set.isEmpty()) {
                closePkg(pkg, ts)
              }
            }
          }
        }
        // Close any still-resumed foreground app up to endTime
        closeAllPkgs(endTime)
      } catch (_: Exception) {
        // Ignore and merge with stats below
      }

      // 2) Also check queryUsageStats buckets strictly within [startTime, endTime]
      val statsAggregated = mutableMapOf<String, Long>()
      try {
        val stats = usageManager.queryUsageStats(
          UsageStatsManager.INTERVAL_DAILY,
          startTime,
          endTime
        )
        for (stat in stats) {
          if (stat.totalTimeInForeground <= 0) continue
          if (isIgnoredPkg(stat.packageName)) continue
          if (stat.lastTimeStamp < startTime) continue
          // Skip yesterday's daily bucket whose firstTimeStamp started well before startTime
          if (stat.firstTimeStamp < startTime - 3 * 3600_000L) continue
          statsAggregated[stat.packageName] =
            (statsAggregated[stat.packageName] ?: 0L) + stat.totalTimeInForeground
        }
      } catch (_: Exception) {}

      // Combine: prefer exact UsageEvents sum; for multi-day queries (>1 day) where Android may prune raw events,
      // or if queryEvents missed an early-morning session, take the accurate value.
      val aggregated = mutableMapOf<String, Long>()
      val allPkgs = eventsAggregated.keys + statsAggregated.keys
      for (pkg in allPkgs) {
        val evMs = eventsAggregated[pkg] ?: 0L
        val stMs = statsAggregated[pkg] ?: 0L
        aggregated[pkg] = if (days == 1) {
          if (evMs > 0L) evMs else stMs
        } else {
          maxOf(evMs, stMs)
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
            // 1. Check Browsers FIRST so browsers like Chrome & Brave are never misclassified as Social
            lowerPkg.contains("chrome") || lowerPkg.contains("brave") ||
            lowerPkg.contains("firefox") || lowerPkg.contains("safari") ||
            lowerPkg.contains("sbrowser") || lowerPkg.contains("opera") ||
            lowerPkg.contains("emmx") || lowerPkg.contains("duckduckgo") ||
            lowerPkg.contains("browser") || lowerLabel == "chrome" ||
            lowerLabel == "brave" -> "Browser"

            // 2. Games
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

            // 3. Social Media
            lowerPkg.contains("instagram") || lowerPkg.contains("facebook") ||
            lowerPkg.contains("twitter") || lowerPkg.contains("snapchat") ||
            lowerPkg.contains("tiktok") || lowerPkg.contains("musically") ||
            lowerPkg.contains("trill") || lowerPkg.contains("reddit") ||
            lowerPkg.contains("discord") || lowerPkg.contains("whatsapp") ||
            lowerPkg.contains("telegram") || lowerPkg.contains("pinterest") ||
            lowerPkg.contains("threads") || lowerPkg.contains("barcelona") ||
            lowerPkg.contains("linkedin") || lowerPkg.contains("youtube") ||
            lowerPkg.contains("twitch") ||
            osCategory == ApplicationInfo.CATEGORY_SOCIAL -> "Social"

            // 4. Entertainment
            lowerPkg.contains("netflix") || lowerPkg.contains("spotify") ||
            lowerPkg.contains("prime") || lowerPkg.contains("hotstar") -> "Entertainment"

            // 5. Productivity
            osCategory == ApplicationInfo.CATEGORY_PRODUCTIVITY ||
            lowerPkg.contains("gmail") || lowerPkg.contains("outlook") ||
            lowerPkg.contains("slack") || lowerPkg.contains("teams") -> "Productivity"

            else -> "Other"
          }

          val iconUri = getBlackAndWhiteIconDataUri(pm, pkg)

          mapOf(
            "appName" to label,
            "packageName" to pkg,
            "totalMinutes" to minutes,
            "category" to category,
            "iconUri" to iconUri
          )
        }

      promise.resolve(result)
    }
  }
}
