import ExpoModulesCore

// This file is the Expo Modules entry point for iOS.
// It registers both modules with the Expo runtime.
// The actual implementations live in HadafUsageStats.swift and HadafAppBlocker.swift.

public class HadafNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HadafNative")
    // Sub-modules are registered separately via AppDelegateSubscriber
  }
}
