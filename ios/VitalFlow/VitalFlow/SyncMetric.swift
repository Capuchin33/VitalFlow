import Combine
import Foundation
import HealthKit

/// Metrics that can be synced from HealthKit to Supabase (`metric_type` in the database).
enum SyncMetric: String, CaseIterable, Identifiable, Hashable {
  case heartRate = "heart_rate"
  case respiratoryRate = "respiratory_rate"
  case bodyTemperature = "body_temperature"
  case oxygenSaturation = "oxygen_saturation"
  case ecg = "ecg_classification"
  case sleep = "sleep_asleep_hours"

  var id: String { rawValue }

  var title: String {
    switch self {
    case .heartRate:
      "Пульс"
    case .respiratoryRate:
      "Дихання (частота)"
    case .bodyTemperature:
      "Температура тіла"
    case .oxygenSaturation:
      "Насичення крові киснем (SpO₂)"
    case .ecg:
      "Кардіограма (ECG)"
    case .sleep:
      "Сон (години сну за ніч)"
    }
  }

  /// Quantity types in HealthKit (not sleep).
  var quantityIdentifier: HKQuantityTypeIdentifier? {
    switch self {
    case .heartRate:
      .heartRate
    case .respiratoryRate:
      .respiratoryRate
    case .bodyTemperature:
      .bodyTemperature
    case .oxygenSaturation:
      .oxygenSaturation
    case .ecg, .sleep:
      nil
    }
  }

  var isSleep: Bool {
    self == .sleep
  }
}

enum SyncPreferencesKey {
  static let enabledMetrics = "VitalFlow.enabledSyncMetrics"
}

/// Persists metric selection in UserDefaults (shared by UI and background sync).
enum SyncPreferencesStorage {
  /// The five-metric set from before ECG existed — if this exact set is stored in UserDefaults, add ECG (user effectively had “all”).
  private static let legacyEnabledBeforeEcg: Set<SyncMetric> = [
    .heartRate,
    .respiratoryRate,
    .bodyTemperature,
    .oxygenSaturation,
    .sleep,
  ]

  static func loadEnabled() -> Set<SyncMetric> {
    guard let arr = UserDefaults.standard.array(forKey: SyncPreferencesKey.enabledMetrics) as? [String] else {
      return Set(SyncMetric.allCases)
    }
    var parsed = Set(arr.compactMap { SyncMetric(rawValue: $0) })
    if parsed.isEmpty {
      return Set(SyncMetric.allCases)
    }
    if parsed == legacyEnabledBeforeEcg {
      parsed.insert(.ecg)
      saveEnabled(parsed)
    }
    return parsed
  }

  static func saveEnabled(_ set: Set<SyncMetric>) {
    UserDefaults.standard.set(Array(set.map(\.rawValue)), forKey: SyncPreferencesKey.enabledMetrics)
  }
}

@MainActor
final class SyncPreferencesStore: ObservableObject {
  @Published var enabled: Set<SyncMetric> {
    didSet {
      SyncPreferencesStorage.saveEnabled(enabled)
    }
  }

  init() {
    enabled = SyncPreferencesStorage.loadEnabled()
  }

  func setEnabled(_ metric: SyncMetric, _ value: Bool) {
    var next = enabled
    if value {
      next.insert(metric)
    } else {
      next.remove(metric)
    }
    enabled = next
  }

  var hasAnyEnabled: Bool {
    !enabled.isEmpty
  }
}
