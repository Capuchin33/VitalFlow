import Foundation

/// Replace with real values from Supabase → Project Settings → API (URL and anon key).
/// Do not commit production keys to a public repo — copy from the Supabase dashboard locally.
enum Secrets {
  static let supabaseURL = URL(string: "https://YOUR_PROJECT.supabase.co")!
  static let supabaseAnonKey = "your_anon_key"
}
