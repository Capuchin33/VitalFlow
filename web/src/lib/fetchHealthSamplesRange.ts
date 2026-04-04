import { supabase, type HealthSampleRow } from "./supabase";

/** PostgREST typically caps at ~1000 rows per request; fetch all pages. */
const PAGE_SIZE = 1000;

/** Guard against runaway work on huge datasets (e.g. minute-by-minute heart rate). */
const MAX_ROWS = 500_000;

export type FetchHealthSamplesResult = {
  data: HealthSampleRow[];
  error: string | null;
  /** Partial data due to MAX_ROWS — chart may still render, but not all points included. */
  truncatedWarning: string | null;
};

/**
 * All samples for one metric in [fromIso, toIso] without truncation to the oldest N points.
 */
export async function fetchHealthSamplesInRange(
  userId: string,
  metricType: string,
  fromIso: string,
  toIso: string,
): Promise<FetchHealthSamplesResult> {
  const out: HealthSampleRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("health_samples")
      .select("*")
      .eq("user_id", userId)
      .eq("metric_type", metricType)
      .gte("recorded_at", fromIso)
      .lte("recorded_at", toIso)
      .order("recorded_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      return { data: [], error: error.message, truncatedWarning: null };
    }

    const rows = (data as HealthSampleRow[]) ?? [];
    if (!rows.length) break;

    out.push(...rows);

    if (out.length >= MAX_ROWS) {
      return {
        data: out.slice(0, MAX_ROWS),
        error: null,
        truncatedWarning: `Завантажено лише перші ${MAX_ROWS.toLocaleString("uk-UA")} записів — дуже багато точок (наприклад, пульс). Скоротіть період порівняння, щоб усі дані враховувались.`,
      };
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { data: out, error: null, truncatedWarning: null };
}

/**
 * All samples for all metrics in [fromIso, toIso] with pagination.
 * Needed for the dashboard: a single `.limit(N)` returns only the oldest N rows — with dense heart rate,
 * sleep at the end of the range may be missing.
 */
export async function fetchAllHealthSamplesInDateRange(
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<FetchHealthSamplesResult> {
  const out: HealthSampleRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("health_samples")
      .select("*")
      .eq("user_id", userId)
      .gte("recorded_at", fromIso)
      .lte("recorded_at", toIso)
      .order("recorded_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      return { data: [], error: error.message, truncatedWarning: null };
    }

    const rows = (data as HealthSampleRow[]) ?? [];
    if (!rows.length) break;

    out.push(...rows);

    if (out.length >= MAX_ROWS) {
      return {
        data: out.slice(0, MAX_ROWS),
        error: null,
        truncatedWarning: `Завантажено лише перші ${MAX_ROWS.toLocaleString("uk-UA")} записів — дуже багато точок (наприклад, пульс). Скоротіть період, щоб усі дані враховувались.`,
      };
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { data: out, error: null, truncatedWarning: null };
}

/**
 * All samples for one metric for the user (no date filter), with pagination.
 * For ECG and other sparse metrics — full set of rows stored in the DB.
 */
export async function fetchAllHealthSamplesForMetric(
  userId: string,
  metricType: string,
): Promise<FetchHealthSamplesResult> {
  const out: HealthSampleRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("health_samples")
      .select("*")
      .eq("user_id", userId)
      .eq("metric_type", metricType)
      .order("recorded_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      return { data: [], error: error.message, truncatedWarning: null };
    }

    const rows = (data as HealthSampleRow[]) ?? [];
    if (!rows.length) break;

    out.push(...rows);

    if (out.length >= MAX_ROWS) {
      return {
        data: out.slice(0, MAX_ROWS),
        error: null,
        truncatedWarning: `Завантажено лише перші ${MAX_ROWS.toLocaleString("uk-UA")} записів — обсяг занадто великий.`,
      };
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { data: out, error: null, truncatedWarning: null };
}
