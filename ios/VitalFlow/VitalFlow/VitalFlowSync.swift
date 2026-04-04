import Foundation
import Supabase

enum VitalFlowSync {
  private static let iso8601: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    f.timeZone = TimeZone(secondsFromGMT: 0)
    return f
  }()

  private struct Row: Encodable {
    let user_id: UUID
    let metric_type: String
    let value: Double
    let unit: String?
    let recorded_at: String
  }

  /// A single upsert cannot update the same row twice — drop duplicate keys (metric_type + recorded_at).
  /// On collision, keep the last value.
  private static func dedupeSamples(_ samples: [LocalMetricSample]) -> [LocalMetricSample] {
    var byKey: [String: LocalMetricSample] = [:]
    byKey.reserveCapacity(samples.count)
    for s in samples {
      let at = iso8601.string(from: s.recordedAt)
      let key = "\(s.metricType)|\(at)"
      byKey[key] = s
    }
    return byKey.values.sorted { $0.recordedAt < $1.recordedAt }
  }

  /// Returns the number of rows sent to Supabase.
  static func upload(samples: [LocalMetricSample], supabase: SupabaseClient) async throws -> Int {
    let session = try await supabase.auth.session
    let uid = session.user.id

    let unique = dedupeSamples(samples)

    let rows: [Row] = unique.map { s in
      Row(
        user_id: uid,
        metric_type: s.metricType,
        value: s.value,
        unit: s.unit,
        recorded_at: iso8601.string(from: s.recordedAt)
      )
    }

    let chunkSize = 120
    var sent = 0
    var start = rows.startIndex
    while start < rows.endIndex {
      let end = rows.index(start, offsetBy: chunkSize, limitedBy: rows.endIndex) ?? rows.endIndex
      let chunk = Array(rows[start..<end])
      try await supabase
        .from("health_samples")
        .upsert(chunk, onConflict: "user_id,metric_type,recorded_at")
        .execute()
      sent += chunk.count
      start = end
    }

    return sent
  }

  private struct ECGWaveformRow: Encodable {
    let user_id: UUID
    let hk_sample_uuid: String
    let recorded_at: String
    let sampling_frequency_hz: Double
    let classification_code: Int
    let voltages_mv: [Double]
  }

  /// Stores full ECG waveforms (Lead I voltages, mV) in `ecg_waveforms`.
  static func uploadECGWaveforms(waveforms: [LocalECGWaveform], supabase: SupabaseClient) async throws -> Int {
    guard !waveforms.isEmpty else {
      return 0
    }
    let session = try await supabase.auth.session
    let uid = session.user.id

    let rows: [ECGWaveformRow] = waveforms.map { w in
      ECGWaveformRow(
        user_id: uid,
        hk_sample_uuid: w.hkSampleUUID.uuidString,
        recorded_at: iso8601.string(from: w.recordedAt),
        sampling_frequency_hz: w.samplingFrequencyHz,
        classification_code: w.classificationCode,
        voltages_mv: w.voltagesMillivolts
      )
    }

    var sent = 0
    for row in rows {
      try await supabase
        .from("ecg_waveforms")
        .upsert([row], onConflict: "user_id,hk_sample_uuid")
        .execute()
      sent += 1
    }
    return sent
  }

  /// All available HealthKit history (quantity metrics and sleep in 90-day windows in the manager; ECG in full).
  static func collectAll(health: HealthKitManager, enabled: Set<SyncMetric>) async throws -> [LocalMetricSample] {
    let q = try await health.fetchQuantitySeries(enabledMetrics: enabled)
    let s = try await health.fetchSleepHoursByDay(enabledMetrics: enabled)
    let e = try await health.fetchECGClassificationSamples(enabledMetrics: enabled)
    return q + s + e
  }
}
