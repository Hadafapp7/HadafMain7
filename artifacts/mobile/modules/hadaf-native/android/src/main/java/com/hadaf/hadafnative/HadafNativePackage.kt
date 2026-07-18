package com.hadaf.hadafnative

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.package.Package

class HadafNativePackage : Package {
  override fun createModules(): List<Module> = listOf(
    UsageStatsModule(),
    AppBlockerModule(),
  )
}
