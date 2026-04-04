import SwiftUI

@main
struct VitalFlowApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var appModel = AppModel()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(appModel)
    }
  }
}
