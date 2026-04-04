import Combine
import Foundation
import Supabase

@MainActor
final class AppModel: ObservableObject {
  let supabase: SupabaseClient

  @Published var session: Session?

  init() {
    supabase = SupabaseClient(
      supabaseURL: Secrets.supabaseURL,
      supabaseKey: Secrets.supabaseAnonKey
    )
    session = supabase.auth.currentSession
  }

  /// Refreshes the session from the server. Does not clear `session` if a valid local session (Keychain) exists —
  /// otherwise after a successful sign-in `.task` might hit a network/refresh error and reset the UI to login.
  func refreshSession() async {
    do {
      session = try await supabase.auth.session
    } catch {
      if let existing = supabase.auth.currentSession {
        session = existing
      } else {
        session = nil
      }
    }
  }

  func signIn(email: String, password: String) async throws {
    try await supabase.auth.signIn(email: email, password: password)
    if let s = supabase.auth.currentSession {
      session = s
    } else {
      session = try await supabase.auth.session
    }
  }

  func signUp(email: String, password: String) async throws {
    _ = try await supabase.auth.signUp(email: email, password: password)
  }

  func signOut() async throws {
    try await supabase.auth.signOut()
    session = nil
  }
}
