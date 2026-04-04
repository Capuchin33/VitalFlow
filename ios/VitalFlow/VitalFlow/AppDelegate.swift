import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    BackgroundSync.register()
    BackgroundSync.scheduleNext(intervalHours: 24)
    return true
  }

  func applicationDidEnterBackground(_ application: UIApplication) {
    BackgroundSync.scheduleNext(intervalHours: 24)
  }
}
