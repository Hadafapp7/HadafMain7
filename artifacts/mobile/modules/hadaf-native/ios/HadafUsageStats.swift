import ExpoModulesCore
import DeviceActivity
import ManagedSettings
import FamilyControls

/**
 * HadafUsageStats — iOS Screen Time integration
 *
 * Uses Apple's FamilyControls + DeviceActivity framework (iOS 15+).
 * Requires the com.apple.developer.family-controls entitlement approved by Apple.
 *
 * Permission model: one-time AuthorizationCenter.shared.requestAuthorization()
 * system sheet — no Settings redirect needed.
 */
@available(iOS 15.0, *)
public class HadafUsageStatsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HadafUsageStats")

    // Check if FamilyControls authorization has already been granted.
    Function("hasUsagePermission") { () -> Bool in
      if #available(iOS 16.0, *) {
        return AuthorizationCenter.shared.authorizationStatus == .approved
      }
      // iOS 15 — no public status API; assume granted after first request
      return UserDefaults.standard.bool(forKey: "hadaf_fc_authorized")
    }

    // Request Screen Time authorization — shows the system permission sheet.
    AsyncFunction("requestUsagePermission") { (promise: Promise) in
      Task {
        do {
          try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
          UserDefaults.standard.set(true, forKey: "hadaf_fc_authorized")
          promise.resolve(true)
        } catch {
          promise.reject("ERR_AUTH", error.localizedDescription)
        }
      }
    }

    // iOS does not expose raw per-app minutes to third-party apps via a direct API.
    // Usage data is accessed through DeviceActivityReport (a SwiftUI view extension)
    // or by implementing a DeviceActivityMonitor app extension.
    //
    // This function returns a signal that the JS layer should show a
    // DeviceActivityReport view (see HadafActivityReportView.swift), which Apple
    // renders in-process so raw data never leaves the extension sandbox.
    //
    // For the bridge we return a curated list based on what the DeviceActivity
    // monitor recorded in shared UserDefaults (App Group).
    AsyncFunction("getUsageStats") { (days: Int, promise: Promise) in
      let suiteName  = "group.com.hadaf.mobile"
      let defaults   = UserDefaults(suiteName: suiteName)
      let key        = "hadaf_usage_\(days)d"

      if let data = defaults?.data(forKey: key),
         let decoded = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
        promise.resolve(decoded)
      } else {
        // No recorded data yet — return empty; the DeviceActivityMonitor
        // extension will populate this once the first report runs.
        promise.resolve([[String: Any]]())
      }
    }

    // iOS apps CANNOT open Settings to Usage Access — not needed on iOS.
    // This is a no-op kept for API parity with Android.
    Function("openUsageAccessSettings") { }
  }
}
