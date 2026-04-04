import type { User } from "@supabase/supabase-js";

/** Key in `user.user_metadata` for which metrics to show on the dashboard. */
export const DASHBOARD_VISIBLE_METRICS_KEY = "dashboard_visible_metrics";

/** `health_samples` metric id for Apple Watch ECG (aligned with iOS). */
export const ECG_METRIC_ID = "ecg_classification" as const;

/** Vital signs only (no sleep, no ECG). */
export const VITAL_METRIC_OPTIONS: { id: string }[] = [
  { id: "heart_rate" },
  { id: "respiratory_rate" },
  { id: "body_temperature" },
  { id: "oxygen_saturation" },
];

/** Sleep metrics only — for the Sleep page. */
export const SLEEP_METRIC_OPTIONS: { id: string }[] = [
  { id: "sleep_asleep_hours" },
  { id: "sleep_phase_core_hours" },
  { id: "sleep_phase_deep_hours" },
  { id: "sleep_phase_rem_hours" },
  { id: "sleep_phase_awake_hours" },
  { id: "sleep_phase_unspecified_hours" },
];

/** Data home: vitals + sleep, no ECG (ECG classification lives under ECG). */
export const DATA_METRIC_OPTIONS: { id: string }[] = [...VITAL_METRIC_OPTIONS, ...SLEEP_METRIC_OPTIONS];

/** All toggles in settings (including ECG — for compatibility with saved profiles). */
export const DASHBOARD_METRIC_OPTIONS: { id: string }[] = [...DATA_METRIC_OPTIONS, { id: ECG_METRIC_ID }];

/** Comparison: same as Data (no ECG). */
export const COMPARISON_METRIC_OPTIONS: { id: string }[] = DATA_METRIC_OPTIONS;

const ALLOWED = new Set(DASHBOARD_METRIC_OPTIONS.map((o) => o.id));

/** Hours of sleep per night or sleep phase (values in hours). */
export function isSleepHoursMetric(metric: string): boolean {
  return metric === "sleep_asleep_hours" || metric.startsWith("sleep_phase_");
}

/**
 * `null` — user has not saved a choice yet; show every metric that has data.
 * Array (may be empty) — explicit selection.
 */
export function getDashboardVisibleMetrics(user: User): string[] | null {
  const v = user.user_metadata?.[DASHBOARD_VISIBLE_METRICS_KEY];
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string" && ALLOWED.has(x));
}

/** Default form selection: all enabled when there was no saved restriction. */
export function getDefaultMetricSelection(user: User): string[] {
  const pref = getDashboardVisibleMetrics(user);
  if (pref === null) return DASHBOARD_METRIC_OPTIONS.map((o) => o.id);
  return pref;
}
