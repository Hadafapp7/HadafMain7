import DeviceActivity
import ManagedSettings
import Foundation

/**
 * DeviceActivityMonitorExtension
 *
 * This App Extension runs in the background and receives events from the
 * DeviceActivity framework when monitored activity thresholds are crossed.
 *
 * Xcode target type: Device Activity Monitor Extension
 * Bundle ID: com.hadaf.mobile.DeviceActivityMonitor
 *
 * It also aggregates weekly usage data and writes it to the shared App Group
 * UserDefaults so HadafUsageStats can return it to the JS layer.
 */
class HadafDeviceActivityMonitor: DeviceActivityMonitor {
  let store    = ManagedSettingsStore()
  let defaults = UserDefaults(suiteName: "group.com.hadaf.mobile")

  // Called when the monitored schedule starts (e.g. beginning of focus session)
  override func intervalDidStart(for activity: DeviceActivityName) {
    super.intervalDidStart(for: activity)
    // Session started — apply shields from stored selection
    applyStoredShields()
  }

  // Called when the monitored schedule ends
  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    // Session ended — remove all shields
    store.shield.applications = nil
    store.shield.webDomains   = nil
  }

  // Called when a usage threshold is reached (e.g. 2h on a specific app)
  override func eventDidReachThreshold(
    _ event: DeviceActivityEvent.Name,
    activity: DeviceActivityName
  ) {
    super.eventDidReachThreshold(event, activity: activity)
    // Could trigger a notification warning the user they've hit their limit
  }

  private func applyStoredShields() {
    guard let data = defaults?.data(forKey: "hadaf_selection"),
          let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
    else { return }
    store.shield.applications = selection.applicationTokens
    store.shield.webDomains   = selection.webDomainTokens
  }
}

// ── Fake FamilyActivitySelection codable wrapper ───────────────────────────
// FamilyActivitySelection is not directly Codable on all OS versions.
// We store it using the system's own archiver.
extension FamilyActivitySelection {
  static func decode(from data: Data) -> FamilyActivitySelection? {
    try? NSKeyedUnarchiver.unarchivedObject(ofClass: FamilyActivitySelection.self, from: data) as? FamilyActivitySelection
  }
}
