# VitalFlow iOS

Native **SwiftUI** client: **HealthKit** → **Supabase** (primarily the `health_samples` table).

## Requirements

- Xcode 15+.
- iOS **16+** on a physical iPhone.
- A free Apple ID (**Personal Team**) is enough to build **to your own** iPhone. `VitalFlow.entitlements` should only include **`com.apple.developer.healthkit`** — **not** **`healthkit.access`**, or Xcode will require a paid program (Verifiable Health Records).
- The Simulator is **not** suitable for real HealthKit testing.

---

## From scratch to running on iPhone

### Step A. Create an Xcode project (optional if you use the repo project)

1. Open **Xcode** → **File → New → Project…** (or *Create New Project* on the welcome screen).
2. Choose **iOS → App** → **Next**.
3. Fill in:
   - **Product Name:** `VitalFlow`
   - **Team:** your Apple ID (Add an account… if empty).
   - **Organization Identifier:** e.g. `com.yourname` (any unique reverse-DNS string).
   - **Interface:** **SwiftUI**
   - **Language:** **Swift**
   - **Storage:** None
4. **Next** → save the project **inside this repo**, e.g. under `…/VitalFlow/ios/` (you only need a stable path to `.xcodeproj`).

**Or** open the bundled project: **`ios/VitalFlow/VitalFlow.xcodeproj`** — then you can skip steps A–B about “new project” if the layout already matches.

### Step B. Use our Swift sources instead of the template

The repo already has **`ios/VitalFlow/VitalFlow/`** with app code (`VitalFlowApp.swift`, `ContentView.swift`, …) and **`VitalFlow.xcodeproj`** next to it.

If you created a **new** project, Xcode also generated **`VitalFlowApp.swift`** and **`ContentView.swift`** — you would end up with **duplicates** and **two `@main`** entries. Avoid that.

Do this:

1. In **Project Navigator** (left pane), **delete the template** files Xcode created:
   - If **`App.swift`** exists with `@main` — **delete** it.
   - If Xcode’s **`VitalFlowApp.swift`** is not ours — **delete** it.
   - **Template `ContentView.swift`** from Xcode — **delete** it.
2. Add **our** files from disk:
   - **File → Add Files to "VitalFlow"…**
   - Select **`ios/VitalFlow/VitalFlow/`** (app sources), enable **Create groups**, select the **VitalFlow** target → **Add**.
3. Ensure there is **exactly one** file with **`@main`** — it must be **`VitalFlowApp.swift`** from this repo.

If files are not in the target: select the file → **File Inspector** (right pane) → **Target Membership** → check **VitalFlow**.

### Step C. Swift Package — Supabase

1. **File → Add Package Dependencies…**
2. URL: `https://github.com/supabase/supabase-swift`
3. **Dependency Rule:** *Up to Next Major Version*, minimum **2.0.0** → **Add Package**.
4. Add the **Supabase** product to the **VitalFlow** target → **Add Package**.

### Step D. Deployment target

1. Select the **VitalFlow** project → target **VitalFlow** → **General**.
2. **Minimum Deployments → iOS:** set **16.0** (or newer).

### Step E. HealthKit

1. Target **VitalFlow** → **Signing & Capabilities**.
2. **+ Capability** → **HealthKit** (a HealthKit row appears).

### Step F. Health usage strings (required)

1. Same target **VitalFlow** → **Info** (or your **Info.plist** if you use a separate file).
2. Add keys (type **String**):

| Key | Value (example) |
|-----|-----------------|
| **Privacy - Health Share Usage Description** | `VitalFlow reads sleep, heart rate, respiratory rate, and body temperature to sync them with your VitalFlow account.` |
| **Privacy - Health Update Usage Description** | Same text (we don’t write to Health, but the key is often required together with the capability). |

If the UI shows raw names: `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`.

### Step G. Secrets.swift

1. Open **`ios/VitalFlow/VitalFlow/Secrets.swift`** in Xcode (or your editor).
2. Use the same values as **`web/.env`**:
   - **URL** — `https://xxxx.supabase.co` (no `/rest/v1` suffix).
   - **Publishable / anon key** — not **service_role**.

### Step H. Signing and run on iPhone

1. Connect the iPhone with a cable; unlock it.
2. **Signing & Capabilities** → **Team** — your Apple ID (Personal Team).
3. In the Xcode toolbar **Run destination** — pick **your iPhone** (not *Any iOS Simulator*).
4. **Product → Run** (▶).

The first time you may see *Untrusted Developer* — on the device go to **Settings → General → VPN & Device Management** (wording may vary by iOS version) and trust the developer.

### Step I. In the app

1. Sign in with the **same email/password** as on the web dashboard.
2. **Request access to data** → allow in the system sheet.
3. If needed: **Settings → Health → Data Access & Devices → VitalFlow** — enable the categories you want.
4. **Sync now** — you should see something like “Sent N records”.

Then refresh the VitalFlow page in the browser.

---

## Quick checklist

| # | Action |
|---|--------|
| 1 | Open **`ios/VitalFlow/VitalFlow.xcodeproj`** or create a new **App** (SwiftUI) under `ios/` |
| 2 | Remove template `App`/`ContentView`; add files from **`ios/VitalFlow/VitalFlow/`** |
| 3 | **SPM:** `supabase-swift` → product **Supabase** |
| 4 | **iOS 16+**, **HealthKit** capability, **Info** keys for Health |
| 5 | **`Secrets.swift`** = URL + publishable (anon) key |
| 6 | **Run** on a physical **iPhone** |

---

## Metrics

| DB key | HealthKit source |
|--------|------------------|
| `heart_rate` | Heart rate |
| `respiratory_rate` | Respiratory rate |
| `body_temperature` | Body temperature |
| `sleep_asleep_hours` | Sleep (sum of “asleep” for the day) |

Heart rate / respiratory rate / temperature: last **72 hours**. Sleep: **30 days** by day.

The app also syncs **SpO₂**, **ECG classification**, **sleep phases**, and full **ECG waveforms** (see `SyncMetric.swift`, `VitalFlowSync.swift`, and `ecg_waveforms` in Supabase). The table above is a short overview.

## Background sync (BGAppRefresh)

In the repo: **`BackgroundSync.swift`**, **`AppDelegate.swift`**, and the allowed identifier in **`Info-bg.plist`** (currently `Capuchin33.VitalFlow.refresh` — keep it in sync with **`BackgroundSync.taskIdentifier`**). After sign-in and a manual sync, the next background attempt is scheduled about **24 hours** later.

### Apple limitations

- iOS **does not guarantee** timing or how many times the app runs. `BGAppRefreshTask` runs **at the system’s discretion** (battery, usage, limits).
- In practice: often **0–1** successful background syncs **per day**; sometimes fewer.
- A reliable fallback is to open the app and tap **Sync now**.

### How often to schedule

- **`intervalHours`** in `scheduleNext` is the minimum time before the **next allowed** submission. You can set `12` or `6`, but **more frequent requests ≠ more actual runs**.
- Don’t call `scheduleNext` in a tight loop — `submit` may fail.

### Changing the bundle ID

- Update **`BackgroundSync.taskIdentifier`** and the entry in **`Info-bg.plist`** so they match your app (e.g. `$(PRODUCT_BUNDLE_IDENTIFIER).refresh`).

## Next steps (later)

- More screens / charts in the app.
- Optionally **`BGProcessingTask`** for heavier work.
