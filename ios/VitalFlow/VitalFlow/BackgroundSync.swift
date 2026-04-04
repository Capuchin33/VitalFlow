import BackgroundTasks
import Foundation
import Supabase
import UIKit

/// Background sync of HealthKit → Supabase via BGTaskScheduler.
/// Note: iOS does **not** guarantee when or how often tasks run — best-effort only.
enum BackgroundSync {
  /// Must match Info.plist → BGTaskSchedulerPermittedIdentifiers
  static let taskIdentifier = "Capuchin33.VitalFlow.refresh"

  /// Register the handler — call at app launch (e.g. from AppDelegate).
  static func register() {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
      guard let refresh = task as? BGAppRefreshTask else {
        task.setTaskCompleted(success: false)
        return
      }
      handle(refresh)
    }
  }

  /// Schedule the next attempt. `intervalHours` is the minimum interval until the **next** possible run (often 24).
  static func scheduleNext(intervalHours: Double = 24) {
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskIdentifier)

    let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
    request.earliestBeginDate = Date().addingTimeInterval(intervalHours * 3600)

    do {
      try BGTaskScheduler.shared.submit(request)
    } catch {
      print("BackgroundSync schedule: \(error.localizedDescription)")
    }
  }

  private static func handle(_ task: BGAppRefreshTask) {
    scheduleNext(intervalHours: 24)

    let work = Task {
      do {
        let client = SupabaseClient(
          supabaseURL: Secrets.supabaseURL,
          supabaseKey: Secrets.supabaseAnonKey
        )
        _ = try await client.auth.session

        let enabled = SyncPreferencesStorage.loadEnabled()
        guard !enabled.isEmpty else {
          task.setTaskCompleted(success: true)
          return
        }

        let health = HealthKitManager()
        try await health.requestAuthorization(enabledMetrics: enabled)
        let samples = try await VitalFlowSync.collectAll(health: health, enabled: enabled)
        _ = try await VitalFlowSync.upload(samples: samples, supabase: client)
        let waveforms = try await health.fetchECGWaveforms(enabledMetrics: enabled)
        _ = try await VitalFlowSync.uploadECGWaveforms(waveforms: waveforms, supabase: client)
        task.setTaskCompleted(success: true)
      } catch {
        print("BackgroundSync: \(error.localizedDescription)")
        task.setTaskCompleted(success: false)
      }
    }

    task.expirationHandler = {
      work.cancel()
    }
  }
}
