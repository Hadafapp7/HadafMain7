import ManagedSettings
import ManagedSettingsUI
import UIKit
import SwiftUI

/**
 * ShieldConfigurationExtension
 *
 * This App Extension customises the "App Blocked" shield that Apple shows
 * when a user tries to open a blocked app during a Hadaf focus session.
 *
 * Xcode target type: Shield Configuration Extension
 * Bundle ID: com.hadaf.mobile.ShieldConfiguration
 *
 * The shield replaces the entire screen of the blocked app. The user sees
 * Hadaf's branding and a "Back to Hadaf" button instead of the blocked app.
 */
class ShieldConfigurationExtension: ShieldConfigurationDataSource {

  override func configuration(
    shielding application: Application
  ) -> ShieldConfiguration {
    ShieldConfiguration(
      backgroundBlurStyle: .systemUltraThinMaterial,
      backgroundColor:     UIColor(red: 0.96, green: 0.96, blue: 0.96, alpha: 1),
      icon:                UIImage(systemName: "lock.fill"),
      title:               ShieldConfiguration.Label(
        text:  "Focus Mode Active",
        color: UIColor(red: 0.07, green: 0.07, blue: 0.07, alpha: 1)
      ),
      subtitle:            ShieldConfiguration.Label(
        text:  "\(application.localizedDisplayName ?? "This app") is blocked during your Hadaf focus session. Stay on track.",
        color: UIColor(red: 0.4, green: 0.4, blue: 0.4, alpha: 1)
      ),
      primaryButtonLabel:  ShieldConfiguration.Label(
        text:  "Back to Hadaf",
        color: .white
      ),
      primaryButtonBackgroundColor: UIColor(red: 0.07, green: 0.07, blue: 0.07, alpha: 1)
    )
  }

  override func configuration(
    shielding application: Application,
    in category: ActivityCategory
  ) -> ShieldConfiguration {
    configuration(shielding: application)
  }

  override func configuration(
    shielding webDomain: WebDomain
  ) -> ShieldConfiguration {
    ShieldConfiguration(
      backgroundBlurStyle: .systemUltraThinMaterial,
      backgroundColor:     UIColor(red: 0.96, green: 0.96, blue: 0.96, alpha: 1),
      icon:                UIImage(systemName: "lock.fill"),
      title:               ShieldConfiguration.Label(
        text:  "Site Blocked",
        color: UIColor(red: 0.07, green: 0.07, blue: 0.07, alpha: 1)
      ),
      subtitle:            ShieldConfiguration.Label(
        text:  "\(webDomain.domain ?? "This site") is blocked during your Hadaf focus session.",
        color: UIColor(red: 0.4, green: 0.4, blue: 0.4, alpha: 1)
      ),
      primaryButtonLabel:  ShieldConfiguration.Label(
        text:  "Back to Hadaf",
        color: .white
      ),
      primaryButtonBackgroundColor: UIColor(red: 0.07, green: 0.07, blue: 0.07, alpha: 1)
    )
  }
}
