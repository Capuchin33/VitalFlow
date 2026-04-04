import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchHealthSamplesInRange } from "../lib/fetchHealthSamplesRange";
import {
  formatEcgAxisTick,
  formatEcgTooltip,
  formatSpO2AxisTick,
  formatSpO2Tooltip,
} from "../lib/formatMetricValue";
import { useI18n } from "../lib/i18n/context";
import { dateLocaleForAppLocale } from "../lib/locale";
import { COMPARISON_METRIC_OPTIONS } from "../lib/metricsConfig";
import type { HealthSampleRow } from "../lib/supabase";
import { LoadingOverlay } from "./LoadingOverlay";

const chartTooltipStyles = {
  contentStyle: {
    backgroundColor: "var(--chart-tooltip-bg)",
    border: "1px solid var(--chart-tooltip-border)",
    borderRadius: "8px",
    boxShadow: "var(--chart-tooltip-shadow)",
  },
  labelStyle: {
    color: "var(--chart-tooltip-label)",
    fontWeight: 600,
    marginBottom: "0.35rem",
  },
  itemStyle: {
    color: "var(--chart-tooltip-value)",
  },
} as const;

/** Two series on the chart. */
const SERIES_A = "#0e7490";
const SERIES_B = "#c2410c";

type ComparisonPreset = "month_dom" | "week_wd" | "rolling30";
type ComparisonMode = "preset" | "custom";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday 00:00 in local time. */
function mondayStartLocal(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

/** Mon = 0 … Sun = 6 */
function weekdayIndexMon0(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 6 : day - 1;
}

function formatShortDate(d: Date, dateLocale: string): string {
  return d.toLocaleDateString(dateLocale, { day: "numeric", month: "short" });
}

function formatMonthYear(d: Date, dateLocale: string): string {
  return d.toLocaleDateString(dateLocale, { month: "long", year: "numeric" });
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`;
}

/** Parse YYYY-MM-DD into a local calendar date (noon to avoid TZ skew). */
function parseYMD(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function calendarDaysInclusive(start: Date, end: Date): number {
  const s = startOfDay(start);
  const e = startOfDay(end);
  if (e < s) return 0;
  return Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function initialCustomYMD(): { aStart: string; aEnd: string; bStart: string; bEnd: string } {
  const endA = startOfDay(new Date());
  const startA = addDays(endA, -6);
  const endB = startOfDay(addDays(startA, -1));
  const startB = addDays(endB, -6);
  return {
    aStart: toYMD(startA),
    aEnd: toYMD(endA),
    bStart: toYMD(startB),
    bEnd: toYMD(endB),
  };
}

function filterRowsInRange(rows: HealthSampleRow[], start: Date, end: Date): HealthSampleRow[] {
  return rows.filter((r) => {
    const t = new Date(r.recorded_at);
    return t >= start && t <= end;
  });
}

/** Average by calendar day of month (1–31). */
function avgByDayOfMonth(
  rows: HealthSampleRow[],
): Map<number, { avg: number; count: number }> {
  const map = new Map<number, { sum: number; count: number }>();
  for (const r of rows) {
    const d = new Date(r.recorded_at);
    const dom = d.getDate();
    const prev = map.get(dom) ?? { sum: 0, count: 0 };
    prev.sum += r.value;
    prev.count += 1;
    map.set(dom, prev);
  }
  const out = new Map<number, { avg: number; count: number }>();
  for (const [k, v] of map) {
    out.set(k, { avg: v.sum / v.count, count: v.count });
  }
  return out;
}

/** Average by weekday (Mon=0 … Sun=6) within the period. */
function avgByWeekdayIndex(
  rows: HealthSampleRow[],
  periodStart: Date,
  periodEnd: Date,
): Map<number, { avg: number; count: number }> {
  const map = new Map<number, { sum: number; count: number }>();
  for (const r of rows) {
    const t = new Date(r.recorded_at);
    if (t < periodStart || t > periodEnd) continue;
    const wi = weekdayIndexMon0(t);
    const prev = map.get(wi) ?? { sum: 0, count: 0 };
    prev.sum += r.value;
    prev.count += 1;
    map.set(wi, prev);
  }
  const out = new Map<number, { avg: number; count: number }>();
  for (const [k, v] of map) {
    out.set(k, { avg: v.sum / v.count, count: v.count });
  }
  return out;
}

function avgForCalendarDay(rows: HealthSampleRow[], dayStart: Date, dayEnd: Date): number | null {
  const samples = rows.filter((r) => {
    const t = new Date(r.recorded_at);
    return t >= dayStart && t <= dayEnd;
  });
  if (!samples.length) return null;
  return samples.reduce((s, r) => s + r.value, 0) / samples.length;
}

type PeriodPair = {
  a: { start: Date; end: Date };
  b: { start: Date; end: Date };
  legendA: string;
  legendB: string;
};

function getPeriodPair(
  preset: ComparisonPreset,
  t: (key: string, vars?: Record<string, string | number>) => string,
  dateLocale: string,
): PeriodPair {
  const now = new Date();
  const fs = (d: Date) => formatShortDate(d, dateLocale);
  const fm = (d: Date) => formatMonthYear(d, dateLocale);

  if (preset === "month_dom") {
    const y = now.getFullYear();
    const m = now.getMonth();
    const domToday = now.getDate();

    const startA = new Date(y, m, 1, 0, 0, 0, 0);
    const endA = endOfDay(now);

    const prevM = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    const daysInPrev = new Date(prevY, prevM + 1, 0).getDate();
    const domCap = Math.min(domToday, daysInPrev);
    const startB = new Date(prevY, prevM, 1, 0, 0, 0, 0);
    const endB = endOfDay(new Date(prevY, prevM, domCap, 12, 0, 0, 0));

    return {
      a: { start: startA, end: endA },
      b: { start: startB, end: endB },
      legendA: t("comparison.legendMonthCurrent", { month: fm(startA) }),
      legendB: t("comparison.legendMonthPast", { month: fm(startB) }),
    };
  }

  if (preset === "week_wd") {
    const monday = mondayStartLocal(now);
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysSinceMonday = Math.min(
      6,
      Math.max(0, Math.floor((now.getTime() - monday.getTime()) / msPerDay)),
    );

    const startA = new Date(monday);
    const endA = new Date(now);

    const prevMonday = addDays(monday, -7);
    const startB = new Date(prevMonday);
    const endB = endOfDay(addDays(prevMonday, daysSinceMonday));

    return {
      a: { start: startA, end: endA },
      b: { start: startB, end: endB },
      legendA: t("comparison.legendWeekCurrent", { from: fs(startA), to: fs(endA) }),
      legendB: t("comparison.legendWeekPast", { from: fs(startB), to: fs(endB) }),
    };
  }

  const endA = now;
  const startA = startOfDay(addDays(now, -29));
  const startB = startOfDay(addDays(startA, -30));
  const endB = endOfDay(addDays(startA, -1));

  return {
    a: { start: startA, end: endA },
    b: { start: startB, end: endB },
    legendA: t("comparison.legendRollingA"),
    legendB: t("comparison.legendRollingB"),
  };
}

function parseCustomPeriodPair(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
  dateLocale: string,
): { pair: PeriodPair | null; error: string | null } {
  const pa = parseYMD(aStart);
  const qa = parseYMD(aEnd);
  const pb = parseYMD(bStart);
  const qb = parseYMD(bEnd);
  if (!pa || !qa || !pb || !qb) {
    return { pair: null, error: t("comparison.errDateFormat") };
  }
  const startA = startOfDay(pa);
  const endA = endOfDay(qa);
  const startB = startOfDay(pb);
  const endB = endOfDay(qb);
  if (startA > endA) {
    return { pair: null, error: t("comparison.errPeriodA") };
  }
  if (startB > endB) {
    return { pair: null, error: t("comparison.errPeriodB") };
  }
  const fs = (d: Date) => formatShortDate(d, dateLocale);
  return {
    pair: {
      a: { start: startA, end: endA },
      b: { start: startB, end: endB },
      legendA: t("comparison.legendCustomA", { from: fs(startA), to: fs(endA) }),
      legendB: t("comparison.legendCustomB", { from: fs(startB), to: fs(endB) }),
    },
    error: null,
  };
}

/** Align day 1…N, N = min(days in each period). */
function buildCustomAligned(rows: HealthSampleRow[], pair: PeriodPair): ChartPoint[] {
  const rowsA = filterRowsInRange(rows, pair.a.start, pair.a.end);
  const rowsB = filterRowsInRange(rows, pair.b.start, pair.b.end);
  const lenA = calendarDaysInclusive(pair.a.start, pair.a.end);
  const lenB = calendarDaysInclusive(pair.b.start, pair.b.end);
  const n = Math.min(lenA, lenB);
  const baseA = startOfDay(pair.a.start);
  const baseB = startOfDay(pair.b.start);
  const out: ChartPoint[] = [];
  for (let i = 0; i < n; i++) {
    const dayA = startOfDay(addDays(baseA, i));
    const dayB = startOfDay(addDays(baseB, i));
    const vA = avgForCalendarDay(rowsA, dayA, endOfDay(dayA));
    const vB = avgForCalendarDay(rowsB, dayB, endOfDay(dayB));
    out.push({
      label: `${i + 1}`,
      xSort: i,
      periodA: vA,
      periodB: vB,
    });
  }
  return out;
}

type ChartPoint = {
  label: string;
  xSort: number;
  periodA: number | null;
  periodB: number | null;
};

function buildChartData(
  kind: ComparisonPreset | "custom",
  rows: HealthSampleRow[],
  pair: PeriodPair,
  dateLocale: string,
): ChartPoint[] {
  if (kind === "custom") {
    return buildCustomAligned(rows, pair);
  }

  const preset = kind;
  const rowsA = filterRowsInRange(rows, pair.a.start, pair.a.end);
  const rowsB = filterRowsInRange(rows, pair.b.start, pair.b.end);

  if (preset === "month_dom") {
    const now = new Date();
    const domEnd = now.getDate();
    const mapA = avgByDayOfMonth(rowsA);
    const mapB = avgByDayOfMonth(rowsB);
    const out: ChartPoint[] = [];
    for (let dom = 1; dom <= domEnd; dom++) {
      const a = mapA.get(dom);
      const b = mapB.get(dom);
      out.push({
        label: String(dom),
        xSort: dom,
        periodA: a ? a.avg : null,
        periodB: b ? b.avg : null,
      });
    }
    return out;
  }

  if (preset === "week_wd") {
    const now = new Date();
    const monday = mondayStartLocal(now);
    const msPerDay = 24 * 60 * 60 * 1000;
    const maxIdx = Math.min(
      6,
      Math.max(0, Math.floor((now.getTime() - monday.getTime()) / msPerDay)),
    );
    const mapA = avgByWeekdayIndex(rowsA, pair.a.start, pair.a.end);
    const mapB = avgByWeekdayIndex(rowsB, pair.b.start, pair.b.end);
    const out: ChartPoint[] = [];
    for (let i = 0; i <= maxIdx; i++) {
      const a = mapA.get(i);
      const b = mapB.get(i);
      const day = addDays(monday, i);
      const label = day.toLocaleDateString(dateLocale, { weekday: "short" });
      out.push({
        label,
        xSort: i,
        periodA: a ? a.avg : null,
        periodB: b ? b.avg : null,
      });
    }
    return out;
  }

  /* rolling30 */
  const out: ChartPoint[] = [];
  for (let i = 0; i < 30; i++) {
    const dayA = startOfDay(addDays(pair.a.start, i));
    const dayB = startOfDay(addDays(pair.b.start, i));
    const vA = avgForCalendarDay(rowsA, dayA, endOfDay(dayA));
    const vB = avgForCalendarDay(rowsB, dayB, endOfDay(dayB));
    out.push({
      label: `${i + 1}`,
      xSort: i,
      periodA: vA,
      periodB: vB,
    });
  }
  return out;
}

function formatYTick(
  metric: string,
  v: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (metric === "sleep_asleep_hours") {
    const totalMinutes = Math.max(0, Math.round(v * 60));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m ? t("comparison.sleepTick", { h, m }) : t("comparison.sleepTickH", { h });
  }
  if (metric === "oxygen_saturation") {
    return formatSpO2AxisTick(v);
  }
  if (metric === "ecg_classification") {
    return formatEcgAxisTick(v);
  }
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function formatTooltipValue(
  metric: string,
  v: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (metric === "sleep_asleep_hours") {
    const totalMinutes = Math.max(0, Math.round(v * 60));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return t("comparison.sleepTooltip", { h, m });
  }
  if (metric === "oxygen_saturation") {
    return formatSpO2Tooltip(v);
  }
  if (metric === "ecg_classification") {
    return formatEcgTooltip(v);
  }
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function hasAnyValue(points: ChartPoint[]): boolean {
  return points.some((p) => p.periodA !== null || p.periodB !== null);
}

function chartHasSeries(points: ChartPoint[], key: "periodA" | "periodB"): boolean {
  return points.some((p) => {
    const v = p[key];
    return v !== null && v !== undefined && typeof v === "number" && !Number.isNaN(v);
  });
}

function oneSidedSeriesHint(
  metric: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (metric === "sleep_asleep_hours") {
    return t("comparison.oneSidedSleep");
  }
  return t("comparison.oneSidedDefault");
}

type Props = {
  session: Session;
};

export function MetricComparison({ session }: Props) {
  const { locale, t } = useI18n();
  const dateLocale = useMemo(() => dateLocaleForAppLocale(locale), [locale]);

  const PRESET_OPTIONS = useMemo(
    () =>
      [
        {
          id: "month_dom" as const,
          label: t("comparison.presetMonth"),
          hint: t("comparison.presetMonthHint"),
        },
        {
          id: "week_wd" as const,
          label: t("comparison.presetWeek"),
          hint: t("comparison.presetWeekHint"),
        },
        {
          id: "rolling30" as const,
          label: t("comparison.presetRolling"),
          hint: t("comparison.presetRollingHint"),
        },
      ] as const,
    [t, locale],
  );

  const [metric, setMetric] = useState<string>(
    COMPARISON_METRIC_OPTIONS[0]?.id ?? "heart_rate",
  );
  const [mode, setMode] = useState<ComparisonMode>("preset");
  const [preset, setPreset] = useState<ComparisonPreset>("month_dom");
  const initCustom = useMemo(() => initialCustomYMD(), []);
  const [customAStart, setCustomAStart] = useState(initCustom.aStart);
  const [customAEnd, setCustomAEnd] = useState(initCustom.aEnd);
  const [customBStart, setCustomBStart] = useState(initCustom.bStart);
  const [customBEnd, setCustomBEnd] = useState(initCustom.bEnd);
  const [rows, setRows] = useState<HealthSampleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [truncatedWarning, setTruncatedWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** After the request completes — avoid “no data” flash before the response (long paginated fetch). */
  const [fetchSettled, setFetchSettled] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);
  /** Race guard: after await, skip state updates and loading reset if a newer request started. */
  const loadSeqRef = useRef(0);

  const { periodPair, pairError } = useMemo(() => {
    if (mode === "preset") {
      return { periodPair: getPeriodPair(preset, t, dateLocale), pairError: null as string | null };
    }
    const { pair, error: err } = parseCustomPeriodPair(
      customAStart,
      customAEnd,
      customBStart,
      customBEnd,
      t,
      dateLocale,
    );
    if (err || !pair) {
      return { periodPair: null, pairError: err };
    }
    return { periodPair: pair, pairError: null as string | null };
  }, [mode, preset, customAStart, customAEnd, customBStart, customBEnd, t, dateLocale]);

  const fetchFrom = useMemo(() => {
    if (!periodPair) return "";
    const t = Math.min(periodPair.a.start.getTime(), periodPair.b.start.getTime());
    return new Date(t).toISOString();
  }, [periodPair]);

  const fetchTo = useMemo(() => {
    if (!periodPair) return "";
    const t = Math.max(periodPair.a.end.getTime(), periodPair.b.end.getTime());
    return new Date(t).toISOString();
  }, [periodPair]);

  useEffect(() => {
    const seq = ++loadSeqRef.current;
    const uid = session.user.id;
    if (lastUserIdRef.current !== uid) {
      lastUserIdRef.current = uid;
      setRows([]);
    }

    if (!periodPair || !fetchFrom || !fetchTo) {
      setRows([]);
      setLoading(false);
      setFetchSettled(false);
      return;
    }

    async function load() {
      setLoading(true);
      setFetchSettled(false);
      setError(null);
      setTruncatedWarning(null);
      try {
        const { data, error: qErr, truncatedWarning: warn } = await fetchHealthSamplesInRange(
          session.user.id,
          metric,
          fetchFrom,
          fetchTo,
        );
        if (seq !== loadSeqRef.current) return;
        if (qErr) {
          setError(qErr);
          setRows([]);
          setTruncatedWarning(null);
        } else {
          setRows(data);
          setTruncatedWarning(warn);
        }
      } catch (e) {
        if (seq === loadSeqRef.current) {
          setError(e instanceof Error ? e.message : t("comparison.loadError"));
          setRows([]);
          setTruncatedWarning(null);
        }
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
          setFetchSettled(true);
        }
      }
    }

    load();
  }, [session.user.id, metric, fetchFrom, fetchTo, periodPair]);

  const chartData = useMemo(() => {
    if (!periodPair) return [];
    const kind: ComparisonPreset | "custom" = mode === "custom" ? "custom" : preset;
    return buildChartData(kind, rows, periodPair, dateLocale);
  }, [mode, preset, rows, periodPair, dateLocale]);

  const oneSidedSeries = useMemo(() => {
    if (!chartData.length) return false;
    const a = chartHasSeries(chartData, "periodA");
    const b = chartHasSeries(chartData, "periodB");
    return (a && !b) || (!a && b);
  }, [chartData]);

  const unit = rows.find((r) => r.metric_type === metric)?.unit ?? "";
  const activePreset = PRESET_OPTIONS.find((p) => p.id === preset)!;

  const hintText =
    mode === "custom" ? t("comparison.hintCustom") : activePreset.hint;

  return (
    <div className="dashboard-root">
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.25rem" }}>{t("comparison.title")}</h2>
        <p className="muted" style={{ margin: "0 0 0.35rem" }}>
          {t("comparison.intro")}
        </p>
        <p className="muted comparison-preset-hint" style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
          {hintText}
        </p>

        <div
          className="row comparison-controls"
          style={{ flexWrap: "wrap", gap: "1rem 1.5rem", alignItems: "flex-end" }}
        >
          <div className="period-field">
            <label className="comparison-field-label" htmlFor="comparison-metric">
              {t("comparison.metric")}
            </label>
            <select
              id="comparison-metric"
              className="comparison-select"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {COMPARISON_METRIC_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {t(`metrics.${o.id}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="period-field">
            <span className="comparison-field-label" id="comparison-mode-label">
              {t("comparison.periodSource")}
            </span>
            <div
              className="segmented-control"
              role="group"
              aria-labelledby="comparison-mode-label"
            >
              <button
                type="button"
                className={
                  mode === "preset"
                    ? "segmented-control__btn segmented-control__btn--active"
                    : "segmented-control__btn"
                }
                onClick={() => setMode("preset")}
                aria-pressed={mode === "preset"}
              >
                {t("comparison.presets")}
              </button>
              <button
                type="button"
                className={
                  mode === "custom"
                    ? "segmented-control__btn segmented-control__btn--active"
                    : "segmented-control__btn"
                }
                onClick={() => setMode("custom")}
                aria-pressed={mode === "custom"}
              >
                {t("comparison.customDates")}
              </button>
            </div>
          </div>

          {mode === "preset" ? (
            <div className="period-field" style={{ flex: "1 1 280px", minWidth: 0 }}>
              <span className="comparison-field-label" id="comparison-preset-label">
                {t("comparison.periodComparison")}
              </span>
              <div
                className="segmented-control segmented-control--wrap"
                role="group"
                aria-labelledby="comparison-preset-label"
              >
                {PRESET_OPTIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={
                      preset === p.id
                        ? "segmented-control__btn segmented-control__btn--active"
                        : "segmented-control__btn"
                    }
                    onClick={() => setPreset(p.id)}
                    aria-pressed={preset === p.id}
                    title={p.hint}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "custom" ? (
            <div className="comparison-custom-dates" style={{ flex: "1 1 100%" }}>
              <div className="comparison-date-range">
                <span className="comparison-field-label">{t("comparison.periodA")}</span>
                <div className="comparison-date-range__inputs">
                  <label className="comparison-sr-only" htmlFor="cmp-a-start">
                    {t("comparison.periodAStart")}
                  </label>
                  <input
                    id="cmp-a-start"
                    type="date"
                    className="comparison-date-input"
                    value={customAStart}
                    onChange={(e) => setCustomAStart(e.target.value)}
                  />
                  <span className="comparison-date-sep" aria-hidden>
                    —
                  </span>
                  <label className="comparison-sr-only" htmlFor="cmp-a-end">
                    {t("comparison.periodAEnd")}
                  </label>
                  <input
                    id="cmp-a-end"
                    type="date"
                    className="comparison-date-input"
                    value={customAEnd}
                    onChange={(e) => setCustomAEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="comparison-date-range">
                <span className="comparison-field-label">{t("comparison.periodB")}</span>
                <div className="comparison-date-range__inputs">
                  <label className="comparison-sr-only" htmlFor="cmp-b-start">
                    {t("comparison.periodBStart")}
                  </label>
                  <input
                    id="cmp-b-start"
                    type="date"
                    className="comparison-date-input"
                    value={customBStart}
                    onChange={(e) => setCustomBStart(e.target.value)}
                  />
                  <span className="comparison-date-sep" aria-hidden>
                    —
                  </span>
                  <label className="comparison-sr-only" htmlFor="cmp-b-end">
                    {t("comparison.periodBEnd")}
                  </label>
                  <input
                    id="cmp-b-end"
                    type="date"
                    className="comparison-date-input"
                    value={customBEnd}
                    onChange={(e) => setCustomBEnd(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="card comparison-chart-card">
        <h3 style={{ marginTop: 0, fontSize: "1.15rem" }}>{t(`metrics.${metric}`)}</h3>
        {unit ? (
          <p className="muted" style={{ margin: "0 0 0.75rem" }}>
            {t("comparison.unit")}: {unit}
          </p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {pairError ? <p className="error">{pairError}</p> : null}
        {truncatedWarning ? (
          <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9rem" }}>
            {truncatedWarning}
          </p>
        ) : null}

        {!pairError && !loading && fetchSettled && oneSidedSeries ? (
          <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9rem" }}>
            {oneSidedSeriesHint(metric, t)}
          </p>
        ) : null}

        {!pairError && !loading && fetchSettled && !rows.length ? (
          <p className="muted" style={{ margin: 0 }}>
            {t("comparison.noDataInRange")}
          </p>
        ) : null}

        {!pairError && !loading && fetchSettled && rows.length > 0 && !hasAnyValue(chartData) ? (
          <p className="muted" style={{ margin: 0 }}>
            {t("comparison.noValuesForChart")}
          </p>
        ) : null}

        {!pairError && !loading && fetchSettled && hasAnyValue(chartData) && periodPair ? (
          <div className="chart-wrap chart-wrap--comparison">
            <ResponsiveContainer width="100%" height={380}>
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval={chartData.length > 14 ? "preserveStartEnd" : 0}
                  angle={chartData.length > 14 ? -30 : 0}
                  textAnchor={chartData.length > 14 ? "end" : "middle"}
                  height={chartData.length > 14 ? 56 : 28}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => formatYTick(metric, Number(v), t)}
                  width={metric === "ecg_classification" ? 72 : 56}
                />
                <Tooltip
                  {...chartTooltipStyles}
                  formatter={(value, name) => {
                    const n = typeof value === "number" ? value : Number(value);
                    if (value === undefined || value === null || Number.isNaN(n)) {
                      return ["—", String(name)];
                    }
                    return [formatTooltipValue(metric, n, t), String(name)];
                  }}
                  labelFormatter={(label) => `${t("comparison.chartPoint")}: ${label}`}
                />
                <Legend
                  wrapperStyle={{ fontSize: "0.85rem" }}
                  formatter={(value) => <span style={{ color: "var(--app-text)" }}>{value}</span>}
                />
                <Line
                  type="monotone"
                  dataKey="periodA"
                  name={periodPair.legendA}
                  stroke={SERIES_A}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="periodB"
                  name={periodPair.legendB}
                  stroke={SERIES_B}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        {loading ? (
          <LoadingOverlay message={t("comparison.loading")} variant="absolute" />
        ) : null}
      </div>
    </div>
  );
}
