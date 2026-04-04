import Foundation
import HealthKit

/// Reads selected metrics from HealthKit.
final class HealthKitManager {
  private let store = HKHealthStore()

  var isHealthDataAvailable: Bool {
    HKHealthStore.isHealthDataAvailable()
  }

  /// Request authorization only for the selected data types.
  func requestAuthorization(enabledMetrics: Set<SyncMetric>) async throws {
    let read = hkObjectTypes(for: enabledMetrics)
    guard !read.isEmpty else { return }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      store.requestAuthorization(toShare: [], read: read) { ok, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        if !ok {
          continuation.resume(throwing: HealthKitError.authorizationDenied)
          return
        }
        continuation.resume()
      }
    }
  }

  /// Quantity metrics for **all** available HealthKit history (enabled types only). Fetched in 90-day windows to avoid loading millions of points in one query.
  func fetchQuantitySeries(enabledMetrics: Set<SyncMetric>) async throws -> [LocalMetricSample] {
    let end = Date()
    let epochStart = Date(timeIntervalSince1970: 0)
    let window: TimeInterval = 90 * 24 * 3600
    var out: [LocalMetricSample] = []

    for metric in enabledMetrics where metric.quantityIdentifier != nil {
      guard let id = metric.quantityIdentifier,
            let type = HKObjectType.quantityType(forIdentifier: id) else { continue }
      let (metricType, unitLabel, hkUnit) = mapQuantity(id: id)

      var windowEnd = end
      var iteration = 0
      while windowEnd > epochStart && iteration < 500 {
        iteration += 1
        let windowStart = max(windowEnd.addingTimeInterval(-window), epochStart)
        let samples = try await fetchQuantitySamples(type: type, start: windowStart, end: windowEnd)
        for s in samples {
          let value = s.quantity.doubleValue(for: hkUnit)
          out.append(
            LocalMetricSample(
              metricType: metricType,
              value: value,
              unit: unitLabel,
              recordedAt: s.startDate
            )
          )
        }
        if windowStart <= epochStart {
          break
        }
        windowEnd = windowStart
      }
    }

    return out
  }

  /// Total sleep per night — full available history (90-day windows), only if Sleep is enabled.
  func fetchSleepHoursByDay(enabledMetrics: Set<SyncMetric>) async throws -> [LocalMetricSample] {
    guard enabledMetrics.contains(.sleep) else {
      return []
    }

    guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
      return []
    }

    let epochStart = Date(timeIntervalSince1970: 0)
    let window: TimeInterval = 90 * 24 * 3600

    let asleepValues: Set<Int> = [
      HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
      HKCategoryValueSleepAnalysis.asleepCore.rawValue,
      HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
      HKCategoryValueSleepAnalysis.asleepREM.rawValue,
    ]

    /// Sleep phase → Supabase key (`health_samples.metric_type`).
    let phaseMetricTypes: [Int: String] = [
      HKCategoryValueSleepAnalysis.awake.rawValue: "sleep_phase_awake_hours",
      HKCategoryValueSleepAnalysis.asleepCore.rawValue: "sleep_phase_core_hours",
      HKCategoryValueSleepAnalysis.asleepDeep.rawValue: "sleep_phase_deep_hours",
      HKCategoryValueSleepAnalysis.asleepREM.rawValue: "sleep_phase_rem_hours",
      HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue: "sleep_phase_unspecified_hours",
    ]

    var secondsAsleepByDay: [Date: TimeInterval] = [:]
    var secondsByPhaseAndDay: [String: [Date: TimeInterval]] = [:]

    var windowEnd = Date()
    var iteration = 0
    while windowEnd > epochStart && iteration < 500 {
      iteration += 1
      let windowStart = max(windowEnd.addingTimeInterval(-window), epochStart)
      let samples = try await fetchCategorySamples(type: sleepType, start: windowStart, end: windowEnd)
      for s in samples {
        let day = Calendar.current.startOfDay(for: s.startDate)
        let dur = s.endDate.timeIntervalSince(s.startDate)
        guard dur >= 0 else { continue }

        let v = s.value

        if asleepValues.contains(v) {
          secondsAsleepByDay[day, default: 0] += dur
        }

        if let metricType = phaseMetricTypes[v] {
          secondsByPhaseAndDay[metricType, default: [:]][day, default: 0] += dur
        }
      }
      if windowStart <= epochStart {
        break
      }
      windowEnd = windowStart
    }

    var out: [LocalMetricSample] = []

    for day in secondsAsleepByDay.keys.sorted() {
      let hours = (secondsAsleepByDay[day] ?? 0) / 3600.0
      out.append(
        LocalMetricSample(
          metricType: "sleep_asleep_hours",
          value: hours,
          unit: "h",
          recordedAt: day
        )
      )
    }

    for (metricType, byDay) in secondsByPhaseAndDay {
      for day in byDay.keys.sorted() {
        let hours = (byDay[day] ?? 0) / 3600.0
        out.append(
          LocalMetricSample(
            metricType: metricType,
            value: hours,
            unit: "h",
            recordedAt: day
          )
        )
      }
    }

    return out
  }

  /// ECG classification (Apple Watch) — all available samples (`start: nil` in the query).
  func fetchECGClassificationSamples(enabledMetrics: Set<SyncMetric>) async throws -> [LocalMetricSample] {
    guard enabledMetrics.contains(.ecg) else {
      return []
    }

    let end = Date()
    let samples = try await fetchElectrocardiogramSamples(start: nil, end: end)

    var out: [LocalMetricSample] = []
    out.reserveCapacity(samples.count)
    for s in samples {
      let code = Double(ecgClassificationCode(s.classification))
      out.append(
        LocalMetricSample(
          metricType: "ecg_classification",
          value: code,
          unit: "ECG",
          recordedAt: s.startDate
        )
      )
    }
    return out
  }

  /// Full ECG waveforms (Lead I voltage, mV) for **all** available samples.
  func fetchECGWaveforms(enabledMetrics: Set<SyncMetric>) async throws -> [LocalECGWaveform] {
    guard enabledMetrics.contains(.ecg) else {
      return []
    }

    let end = Date()
    let samples = try await fetchElectrocardiogramSamples(start: nil, end: end)

    var out: [LocalECGWaveform] = []
    out.reserveCapacity(samples.count)
    for s in samples {
      let mV = try await fetchVoltageMillivolts(for: s)
      guard !mV.isEmpty else {
        continue
      }
      let hz = s.samplingFrequency?.doubleValue(for: HKUnit.hertz()) ?? 0
      out.append(
        LocalECGWaveform(
          hkSampleUUID: s.uuid,
          recordedAt: s.startDate,
          samplingFrequencyHz: hz,
          classificationCode: ecgClassificationCode(s.classification),
          voltagesMillivolts: mV
        )
      )
    }
    return out
  }

  // MARK: - Private

  private func fetchVoltageMillivolts(for sample: HKElectrocardiogram) async throws -> [Double] {
    let microVolts = HKUnit.voltUnit(with: .micro)
    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[Double], Error>) in
      var values: [Double] = []
      values.reserveCapacity(sample.numberOfVoltageMeasurements)
      let query = HKElectrocardiogramQuery(sample) { _, result in
        switch result {
        case .measurement(let measurement):
          guard let q = measurement.quantity(for: .appleWatchSimilarToLeadI) else {
            return
          }
          let uV = q.doubleValue(for: microVolts)
          values.append(uV / 1000.0)
        case .done:
          continuation.resume(returning: values)
        case .error(let error):
          continuation.resume(throwing: error)
        @unknown default:
          continuation.resume(throwing: HealthKitError.ecgVoltageQueryFailed)
        }
      }
      store.execute(query)
    }
  }

  private func ecgClassificationCode(_ v: HKElectrocardiogram.Classification) -> Int {
    switch v {
    case .sinusRhythm:
      0
    case .atrialFibrillation:
      1
    case .inconclusiveOther:
      2
    case .inconclusivePoorReading:
      3
    case .inconclusiveHighHeartRate:
      4
    case .inconclusiveLowHeartRate:
      5
    case .notSet:
      98
    case .unrecognized:
      99
    @unknown default:
      99
    }
  }

  private func fetchElectrocardiogramSamples(start: Date?, end: Date) async throws -> [HKElectrocardiogram] {
    let ecgType = HKObjectType.electrocardiogramType()
    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKElectrocardiogram], Error>) in
      // Without strictStartDate: ECG samples on window boundaries are included more often.
      let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
      let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
      let q = HKSampleQuery(
        sampleType: ecgType,
        predicate: pred,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort]
      ) { _, samples, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        let ecgs = (samples as? [HKElectrocardiogram]) ?? []
        continuation.resume(returning: ecgs)
      }
      store.execute(q)
    }
  }

  private func hkObjectTypes(for metrics: Set<SyncMetric>) -> Set<HKObjectType> {
    var read = Set<HKObjectType>()
    if metrics.contains(.sleep), let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      read.insert(sleep)
    }
    if metrics.contains(.ecg) {
      read.insert(HKObjectType.electrocardiogramType())
    }
    for id in metrics.compactMap({ $0.quantityIdentifier }) {
      if let t = HKObjectType.quantityType(forIdentifier: id) {
        read.insert(t)
      }
    }
    return read
  }

  private func mapQuantity(id: HKQuantityTypeIdentifier) -> (String, String, HKUnit) {
    switch id {
    case .heartRate:
      ("heart_rate", "count/min", HKUnit.count().unitDivided(by: .minute()))
    case .respiratoryRate:
      ("respiratory_rate", "count/min", HKUnit.count().unitDivided(by: .minute()))
    case .bodyTemperature:
      ("body_temperature", "°C", .degreeCelsius())
    case .oxygenSaturation:
      ("oxygen_saturation", "%", .percent())
    default:
      ("unknown", "", HKUnit.count())
    }
  }

  private func fetchQuantitySamples(
    type: HKQuantityType,
    start: Date,
    end: Date
  ) async throws -> [HKQuantitySample] {
    try await withCheckedThrowingContinuation { continuation in
      let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
      let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
      let q = HKSampleQuery(
        sampleType: type,
        predicate: pred,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort]
      ) { _, samples, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        let qs = (samples as? [HKQuantitySample]) ?? []
        continuation.resume(returning: qs)
      }
      store.execute(q)
    }
  }

  private func fetchCategorySamples(
    type: HKCategoryType,
    start: Date,
    end: Date
  ) async throws -> [HKCategorySample] {
    try await withCheckedThrowingContinuation { continuation in
      let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
      let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
      let q = HKSampleQuery(
        sampleType: type,
        predicate: pred,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort]
      ) { _, samples, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        let cs = (samples as? [HKCategorySample]) ?? []
        continuation.resume(returning: cs)
      }
      store.execute(q)
    }
  }
}

struct LocalMetricSample: Sendable {
  let metricType: String
  let value: Double
  let unit: String
  let recordedAt: Date
}

/// One recorded ECG with a voltage array (mV) for Lead I (Apple Watch).
struct LocalECGWaveform: Sendable {
  let hkSampleUUID: UUID
  let recordedAt: Date
  let samplingFrequencyHz: Double
  let classificationCode: Int
  let voltagesMillivolts: [Double]
}

enum HealthKitError: LocalizedError {
  case authorizationDenied
  case ecgVoltageQueryFailed

  var errorDescription: String? {
    switch self {
    case .authorizationDenied:
      "Немає дозволу на доступ до даних Здоров’я."
    case .ecgVoltageQueryFailed:
      "Не вдалося зчитати напругу ECG з HealthKit."
    }
  }
}
