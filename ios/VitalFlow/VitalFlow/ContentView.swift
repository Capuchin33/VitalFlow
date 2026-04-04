import Auth
import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var appModel: AppModel
  @StateObject private var syncPrefs = SyncPreferencesStore()
  @State private var health = HealthKitManager()

  @State private var email = ""
  @State private var password = ""
  @State private var busy = false
  @State private var banner: String?

  var body: some View {
    NavigationStack {
      Form {
        if appModel.session == nil {
          Section("Акаунт Supabase") {
            TextField("Email", text: $email)
              .textContentType(.username)
              .keyboardType(.emailAddress)
              .textInputAutocapitalization(.never)
            SecureField("Пароль", text: $password)
              .textContentType(.password)
            Button("Увійти") { Task { await signIn() } }
              .disabled(busy || email.isEmpty || password.count < 6)
            Button("Зареєструватись") { Task { await signUp() } }
              .disabled(busy || email.isEmpty || password.count < 6)
          }
        } else if let s = appModel.session {
          Section {
            Text(s.user.email ?? s.user.id.uuidString)
              .font(.subheadline)
            Button("Вийти", role: .destructive) { Task { await signOut() } }
          }

          Section("Що синхронізувати") {
            ForEach(SyncMetric.allCases) { m in
              Toggle(
                m.title,
                isOn: Binding(
                  get: { syncPrefs.enabled.contains(m) },
                  set: { syncPrefs.setEnabled(m, $0) }
                )
              )
            }
            Text("Вимкнені метрики не зчитуються з «Здоров’я» і не відправляються в хмару.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }

          Section("Здоров’я") {
            if !health.isHealthDataAvailable {
              Text("HealthKit недоступний на цьому пристрої.")
                .foregroundStyle(.secondary)
            } else {
              Button("Запитати доступ до даних") { Task { await requestHealth() } }
                .disabled(busy)
              Button("Синхронізувати зараз") { Task { await syncNow() } }
                .disabled(busy || !syncPrefs.hasAnyEnabled)
            }
          }

          Section("Підказка") {
            Text(
              "Після першого входу обери метрики, натисни «Запитати доступ», потім «Синхронізувати». Ті самі email/пароль — на веб-дашборді."
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
          }
        }

        if let banner {
          Section {
            Text(banner)
              .foregroundStyle(.red)
          }
        }
      }
      .navigationTitle("VitalFlow")
      // Run once at startup; without a stable id, `.task` restarts after sign-in and could clear the session.
      .task(id: "bootstrap-session") {
        await appModel.refreshSession()
      }
    }
  }

  private func signIn() async {
    busy = true
    banner = nil
    defer { busy = false }
    do {
      try await appModel.signIn(email: email, password: password)
      BackgroundSync.scheduleNext(intervalHours: 24)
    } catch {
      banner = error.localizedDescription
    }
  }

  private func signUp() async {
    busy = true
    banner = nil
    defer { busy = false }
    do {
      try await appModel.signUp(email: email, password: password)
      banner = "Якщо увімкнено підтвердження пошти — перевірте скриньку, потім увійдіть."
    } catch {
      banner = error.localizedDescription
    }
  }

  private func signOut() async {
    busy = true
    banner = nil
    defer { busy = false }
    do {
      try await appModel.signOut()
    } catch {
      banner = error.localizedDescription
    }
  }

  private func requestHealth() async {
    busy = true
    banner = nil
    defer { busy = false }
    guard syncPrefs.hasAnyEnabled else {
      banner = "Увімкни хоча б одну метрику в секції «Що синхронізувати»."
      return
    }
    do {
      try await health.requestAuthorization(enabledMetrics: syncPrefs.enabled)
      banner = "Доступ до Здоров’я надано (або частково — перевір у Налаштуваннях → Здоров’я)."
    } catch {
      banner = error.localizedDescription
    }
  }

  private func syncNow() async {
    busy = true
    banner = nil
    defer { busy = false }
    guard syncPrefs.hasAnyEnabled else {
      banner = "Увімкни хоча б одну метрику в секції «Що синхронізувати»."
      return
    }
    do {
      try await health.requestAuthorization(enabledMetrics: syncPrefs.enabled)
      let samples = try await VitalFlowSync.collectAll(health: health, enabled: syncPrefs.enabled)
      let n = try await VitalFlowSync.upload(samples: samples, supabase: appModel.supabase)
      let waveforms = try await health.fetchECGWaveforms(enabledMetrics: syncPrefs.enabled)
      let wn = try await VitalFlowSync.uploadECGWaveforms(waveforms: waveforms, supabase: appModel.supabase)
      BackgroundSync.scheduleNext(intervalHours: 24)
      let ecgCollected = samples.filter { $0.metricType == "ecg_classification" }.count
      if syncPrefs.enabled.contains(.ecg) {
        banner =
          "Надіслано записів: \(n). ECG (класифікація): \(ecgCollected). Ритми (хвилі) надіслано: \(wn). Якщо 0 — перевір дозвіл ECG і «Кардіограма»."
      } else {
        banner = "Надіслано записів: \(n)."
      }
    } catch {
      banner = error.localizedDescription
    }
  }
}

#Preview {
  ContentView()
    .environmentObject(AppModel())
}
