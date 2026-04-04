import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LoadingOverlay } from "./LoadingOverlay";
import { CHART_PERIODS, type ChartPeriod, startDateForPeriod } from "../lib/chartPeriod";
import { fetchAllHealthSamplesInDateRange } from "../lib/fetchHealthSamplesRange";
import { formatMetricAxisTick, formatSpO2Tooltip } from "../lib/formatMetricValue";
import { useI18n } from "../lib/i18n/context";
import { dateLocaleForAppLocale } from "../lib/locale";
import { getDashboardVisibleMetrics, SLEEP_METRIC_OPTIONS, VITAL_METRIC_OPTIONS } from "../lib/metricsConfig";
import type { HealthSampleRow } from "../lib/supabase";

const VITAL_CARD_IDS = new Set(VITAL_METRIC_OPTIONS.map((o) => o.id));
const SLEEP_CARD_IDS = new Set(SLEEP_METRIC_OPTIONS.map((o) => o.id));
const VITAL_ORDER = VITAL_METRIC_OPTIONS.map((o) => o.id);

type SleepPhaseId = "total" | "core" | "deep" | "rem" | "awake" | "unspecified";

const SLEEP_PHASE_OPTIONS: { id: SleepPhaseId; dbKey: string }[] = [
  { id: "total", dbKey: "sleep_asleep_hours" },
  { id: "core", dbKey: "sleep_phase_core_hours" },
  { id: "deep", dbKey: "sleep_phase_deep_hours" },
  { id: "rem", dbKey: "sleep_phase_rem_hours" },
  { id: "awake", dbKey: "sleep_phase_awake_hours" },
  { id: "unspecified", dbKey: "sleep_phase_unspecified_hours" },
];

/** Aligned with stone + teal palette (main UI). */
const METRIC_COLORS: Record<string, string> = {
  heart_rate: "#0e7490",
  respiratory_rate: "#0d9488",
  body_temperature: "#ea580c",
  oxygen_saturation: "#7c3aed",
  sleep_asleep_hours: "#0e7490",
  sleep_phase_core_hours: "#06b6d4",
  sleep_phase_deep_hours: "#1d4ed8",
  sleep_phase_rem_hours: "#8b5cf6",
  sleep_phase_awake_hours: "#f59e0b",
  sleep_phase_unspecified_hours: "#78716c",
};

function sortMetricKeys(keys: string[], order: string[]): string[] {
  const orderMap = new Map(order.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999));
}

/** Chart tooltip styles — date/value contrast on light and dark backgrounds. */
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

function formatChartPointLabel(iso: string, dateLocale: string): string {
  return new Date(iso).toLocaleString(dateLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatAxisTick(iso: string, period: ChartPeriod, dateLocale: string): string {
  const d = new Date(iso);
  if (period === "day") {
    return d.toLocaleTimeString(dateLocale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  if (period === "week") {
    return d.toLocaleDateString(dateLocale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }
  return d.toLocaleDateString(dateLocale, { day: "numeric", month: "short" });
}

type MetricChartCardProps = {
  metricKey: string;
  rows: HealthSampleRow[];
  period: ChartPeriod;
};

function MetricChartCard({ metricKey, rows, period }: MetricChartCardProps) {
  const { t, locale } = useI18n();
  const dateLocale = dateLocaleForAppLocale(locale);
  const title = t(`metrics.${metricKey}`) || metricKey;

  const chartData = useMemo(
    () =>
      rows
        .filter((r) => r.metric_type === metricKey)
        .map((r) => ({
          t: r.recorded_at,
          label: formatChartPointLabel(r.recorded_at, dateLocale),
          v: r.value,
        })),
    [rows, metricKey, dateLocale],
  );

  const unit = rows.find((r) => r.metric_type === metricKey)?.unit ?? "";
  const stroke = METRIC_COLORS[metricKey] ?? "#0d9488";

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, fontSize: "1.15rem" }}>{title}</h3>
      {unit ? (
        <p className="muted" style={{ margin: "0 0 0.75rem" }}>
          {t("dashboard.unit")}: {unit}
        </p>
      ) : null}
      {chartData.length > 0 ? (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                tickFormatter={(v) => formatAxisTick(String(v), period, dateLocale)}
                minTickGap={24}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v) => formatMetricAxisTick(metricKey, Number(v))}
                width={56}
              />
              <Tooltip
                {...chartTooltipStyles}
                formatter={(value: number) => {
                  const n = Number(value);
                  if (metricKey === "oxygen_saturation") {
                    return [formatSpO2Tooltip(n), title];
                  }
                  return [Number.isInteger(n) ? String(n) : n.toFixed(2), title];
                }}
                labelFormatter={(_, p) => {
                  const payload = p?.[0]?.payload as { label?: string } | undefined;
                  return payload?.label ?? "";
                }}
              />
              <Line type="monotone" dataKey="v" stroke={stroke} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          {t("dashboard.noDataPeriod")}
        </p>
      )}
    </div>
  );
}

type SleepMetricCardProps = {
  rows: HealthSampleRow[];
  period: ChartPeriod;
};

function SleepMetricCard({ rows, period }: SleepMetricCardProps) {
  const { t, locale } = useI18n();
  const dateLocale = dateLocaleForAppLocale(locale);
  const [phase, setPhase] = useState<SleepPhaseId>("total");

  const active = SLEEP_PHASE_OPTIONS.find((o) => o.id === phase)!;
  const dbKey = active.dbKey;

  function formatSleepDurationHours(hours: number): string {
    const totalMinutes = Math.max(0, Math.round(hours * 60));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return t("dashboard.hoursMinutes", { hours: h, minutes: m });
  }

  function formatSleepYTick(v: number): string {
    const totalMinutes = Math.max(0, Math.round(v * 60));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m ? t("comparison.sleepTick", { h, m }) : t("comparison.sleepTickH", { h });
  }

  const phaseLabel = (id: SleepPhaseId) => t(`sleepPhase.${id}`);

  const chartData = useMemo(
    () =>
      rows
        .filter((r) => r.metric_type === dbKey)
        .map((r) => ({
          t: r.recorded_at,
          label: formatChartPointLabel(r.recorded_at, dateLocale),
          v: r.value,
        })),
    [rows, dbKey, dateLocale],
  );

  const stroke = METRIC_COLORS[dbKey] ?? "#0e7490";
  const seriesTitle =
    phase === "total" ? t("dashboard.sleepTotal") : `${t("dashboard.sleepDuration")}: ${phaseLabel(phase)}`;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, fontSize: "1.15rem" }}>{t("dashboard.sleepTitle")}</h3>
      <p className="muted" style={{ margin: "0 0 0.5rem" }}>
        {t("dashboard.sleepHint")}
      </p>
      <div className="period-field" style={{ marginBottom: "0.75rem" }}>
        <div
          className="segmented-control segmented-control--wrap"
          role="group"
          aria-label={t("dashboard.sleepPhase")}
        >
          {SLEEP_PHASE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={
                phase === o.id
                  ? "segmented-control__btn segmented-control__btn--active"
                  : "segmented-control__btn"
              }
              onClick={() => setPhase(o.id)}
              aria-pressed={phase === o.id}
            >
              {phaseLabel(o.id)}
            </button>
          ))}
        </div>
      </div>
      {chartData.length > 0 ? (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                tickFormatter={(v) => formatAxisTick(String(v), period, dateLocale)}
                minTickGap={24}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v) => formatSleepYTick(Number(v))}
                width={88}
              />
              <Tooltip
                {...chartTooltipStyles}
                formatter={(value: number) => [formatSleepDurationHours(value), seriesTitle]}
                labelFormatter={(_, p) => {
                  const payload = p?.[0]?.payload as { label?: string } | undefined;
                  return payload?.label ?? "";
                }}
              />
              <Line type="monotone" dataKey="v" stroke={stroke} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          {t("dashboard.sleepNoData")}
        </p>
      )}
    </div>
  );
}

type Props = {
  session: Session;
  /** `data` — vitals + sleep block; `sleep` — sleep block only. */
  variant?: "data" | "sleep";
};

export function Dashboard({ session, variant = "data" }: Props) {
  const { t } = useI18n();
  const [rows, setRows] = useState<HealthSampleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [truncatedWarning, setTruncatedWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Do not show “no rows” until the current fetch completes. */
  const [fetchSettled, setFetchSettled] = useState(false);
  const [period, setPeriod] = useState<ChartPeriod>("week");
  const [toolbarElevated, setToolbarElevated] = useState(false);
  const stickySentinelRef = useRef<HTMLDivElement>(null);
  const lastUserIdRef = useRef<string | null>(null);
  /** Overlay only on first load for the user — not when changing period. */
  const showInitialLoadingOverlayRef = useRef(true);

  useEffect(() => {
    const el = stickySentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setToolbarElevated(!entry.isIntersecting);
      },
      { root: null, threshold: 0, rootMargin: "0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const uid = session.user.id;
    if (lastUserIdRef.current !== uid) {
      lastUserIdRef.current = uid;
      setRows([]);
      showInitialLoadingOverlayRef.current = true;
    }

    const from = startDateForPeriod(period).toISOString();
    const to = new Date().toISOString();

    async function load() {
      if (showInitialLoadingOverlayRef.current) {
        setLoading(true);
      }
      setFetchSettled(false);
      setError(null);
      setTruncatedWarning(null);
      try {
        const { data, error: qErr, truncatedWarning: warn } = await fetchAllHealthSamplesInDateRange(
          session.user.id,
          from,
          to,
        );

        if (cancelled) return;

        if (qErr) {
          setError(qErr);
          setRows([]);
          setTruncatedWarning(null);
        } else {
          setRows(data);
          setTruncatedWarning(warn);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setFetchSettled(true);
          showInitialLoadingOverlayRef.current = false;
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [session.user.id, period]);

  const rawVitals = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (VITAL_CARD_IDS.has(r.metric_type)) {
        set.add(r.metric_type);
      }
    }
    return sortMetricKeys(Array.from(set), VITAL_ORDER);
  }, [rows]);

  const rawSleepPresent = useMemo(
    () => rows.some((r) => SLEEP_CARD_IDS.has(r.metric_type)),
    [rows],
  );

  const filteredVitals = useMemo(() => {
    if (variant === "sleep") return [];
    const pref = getDashboardVisibleMetrics(session.user);
    if (pref === null) return rawVitals;
    return rawVitals.filter((k) => pref.includes(k));
  }, [rawVitals, variant, session.user]);

  const sleepAllowedInPref = useMemo(() => {
    const pref = getDashboardVisibleMetrics(session.user);
    if (pref === null) return true;
    return SLEEP_METRIC_OPTIONS.some((o) => pref.includes(o.id));
  }, [session.user]);

  const showSleepCard = sleepAllowedInPref && (variant === "data" || variant === "sleep");

  const hasToolbarContent = rows.length > 0;

  const hasAnyRelevantData =
    variant === "sleep"
      ? rawSleepPresent
      : rawVitals.length > 0 || rawSleepPresent;

  const allHidden =
    !loading &&
    fetchSettled &&
    hasAnyRelevantData &&
    filteredVitals.length === 0 &&
    !showSleepCard;

  return (
    <div className="dashboard-root">
      <div ref={stickySentinelRef} className="dashboard-sticky-sentinel" aria-hidden />
      <div
        className={`card dashboard-sticky-toolbar${toolbarElevated ? " dashboard-sticky-toolbar--elevated" : ""}`}
        aria-label={variant === "sleep" ? t("sleep.toolbar") : t("dashboard.toolbar")}
      >
        {error ? <p className="error">{error}</p> : null}
        {truncatedWarning ? (
          <p className="muted" style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
            {truncatedWarning}
          </p>
        ) : null}
        {!loading && fetchSettled && !rows.length ? (
          <p className="muted">{variant === "sleep" ? t("sleep.noRows") : t("dashboard.noRows")}</p>
        ) : null}

        {allHidden ? (
          <p className="muted" style={{ margin: 0 }}>
            {t("dashboard.allHidden")}
          </p>
        ) : null}

        {hasToolbarContent ? (
          <div className="row dashboard-period-row" style={{ marginBottom: 0, flexWrap: "wrap", gap: "0.75rem 1.25rem" }}>
            <div className="period-field">
              <div className="segmented-control" role="group" aria-label={t("dashboard.period")}>
                {CHART_PERIODS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={
                      period === p
                        ? "segmented-control__btn segmented-control__btn--active"
                        : "segmented-control__btn"
                    }
                    onClick={() => setPeriod(p)}
                    aria-pressed={period === p}
                  >
                    {t(`period.${p}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {filteredVitals.map((m) => (
        <MetricChartCard key={m} metricKey={m} rows={rows} period={period} />
      ))}
      {showSleepCard ? <SleepMetricCard rows={rows} period={period} /> : null}

      {loading ? (
        <LoadingOverlay
          message={variant === "sleep" ? t("sleep.loadingData") : t("dashboard.loadingData")}
          variant="absolute"
        />
      ) : null}
    </div>
  );
}
