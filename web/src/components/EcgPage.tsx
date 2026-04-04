import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Brush,
  CartesianGrid,
  Customized,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EcgPrintGrid } from "./EcgPrintGrid";
import { fetchAllHealthSamplesForMetric } from "../lib/fetchHealthSamplesRange";
import { formatEcgTooltip, formatMetricAxisTick } from "../lib/formatMetricValue";
import { useI18n } from "../lib/i18n/context";
import { dateLocaleForAppLocale } from "../lib/locale";
import { ECG_METRIC_ID } from "../lib/metricsConfig";
import type { EcgWaveformRow, HealthSampleRow } from "../lib/supabase";
import { supabase } from "../lib/supabase";
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

const ECG_STROKE = "#be123c";

function formatRecorded(iso: string, dateLocale: string): string {
  return new Date(iso).toLocaleString(dateLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Time axis for the classification-over-time chart. */
function formatEcgXAxisTick(iso: string, dateLocale: string): string {
  const d = new Date(iso);
  return d.toLocaleString(dateLocale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type Props = {
  session: Session;
};

function EcgWaveformCard({ row }: { row: EcgWaveformRow }) {
  const { locale, t } = useI18n();
  const dateLocale = useMemo(() => dateLocaleForAppLocale(locale), [locale]);
  const samples = row.voltages_mv ?? [];
  const hz = row.sampling_frequency_hz && row.sampling_frequency_hz > 0 ? row.sampling_frequency_hz : 512;
  const chartPoints = useMemo(() => {
    if (!samples.length) return [];
    return samples.map((v, i) => ({
      t: i / hz,
      v,
    }));
  }, [samples, hz]);

  const lastIdx = Math.max(0, chartPoints.length - 1);

  /** `null` — full trace; otherwise Brush window indices. */
  const [brushRange, setBrushRange] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    setBrushRange(null);
  }, [row.id, chartPoints.length]);

  const durationSec = samples.length / hz;
  const code = row.classification_code ?? 0;

  const brushStart = brushRange?.start ?? 0;
  const brushEnd = brushRange?.end ?? lastIdx;

  const { xDomain, yDomain } = useMemo(() => {
    if (!chartPoints.length) {
      return { xDomain: [0, 1] as [number, number], yDomain: [0, 1] as [number, number] };
    }
    const s = Math.min(brushStart, brushEnd);
    const e = Math.max(brushStart, brushEnd);
    const slice = chartPoints.slice(s, e + 1);
    if (!slice.length) {
      return { xDomain: [0, 1] as [number, number], yDomain: [0, 1] as [number, number] };
    }
    let tMin = slice[0].t;
    let tMax = slice[slice.length - 1].t;
    if (tMax - tMin < 1e-6) {
      const pad = 0.002;
      tMin -= pad;
      tMax += pad;
    }
    const vs = slice.map((p) => p.v);
    let yMin = Math.min(...vs);
    let yMax = Math.max(...vs);
    const ySpan = yMax - yMin || 1;
    const yPad = Math.max(ySpan * 0.08, 0.02);
    return {
      xDomain: [tMin, tMax] as [number, number],
      yDomain: [yMin - yPad, yMax + yPad] as [number, number],
    };
  }, [chartPoints, brushStart, brushEnd]);

  function handleBrushChange(e: { startIndex?: number; endIndex?: number }) {
    const si = e.startIndex ?? 0;
    const ei = e.endIndex ?? lastIdx;
    const a = Math.max(0, Math.min(si, lastIdx));
    const b = Math.max(0, Math.min(ei, lastIdx));
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (lo === 0 && hi === lastIdx) {
      setBrushRange(null);
    } else {
      setBrushRange({ start: lo, end: hi });
    }
  }

  function resetZoom() {
    setBrushRange(null);
  }

  const isZoomed = brushRange !== null;

  if (!samples.length) {
    return (
      <div className="card" style={{ marginBottom: "1rem" }}>
        <p className="muted" style={{ margin: 0 }}>
          {formatRecorded(row.recorded_at, dateLocale)} — {t("ecg.emptySamples")}
        </p>
      </div>
    );
  }

  const hzPart =
    row.sampling_frequency_hz != null
      ? `${row.sampling_frequency_hz.toFixed(0)} ${t("ecg.hz")}`
      : t("ecg.hzUnknown");

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 style={{ marginTop: 0, fontSize: "1.1rem" }}>{formatRecorded(row.recorded_at, dateLocale)}</h3>
      <p className="muted" style={{ margin: "0 0 0.75rem" }}>
        {t("ecg.classification")}: {formatEcgTooltip(code)} · {samples.length} {t("ecg.samples")} · ~
        {durationSec.toFixed(2)} {t("ecg.sec")} · {hzPart}
      </p>
      <div
        className="row"
        style={{
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "0.5rem",
          justifyContent: "space-between",
        }}
      >
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem", flex: "1 1 12rem" }}>
          {t("ecg.brushHint")}
        </p>
        <button
          type="button"
          className="ecg-zoom-reset"
          onClick={resetZoom}
          disabled={!isZoomed}
          title={isZoomed ? t("ecg.showFullTitle") : t("ecg.alreadyFullTitle")}
        >
          {t("ecg.showFull")}
        </button>
      </div>
      <div className="chart-wrap chart-wrap--ecg-waveform">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartPoints} margin={{ top: 8, right: 10, left: 4, bottom: 2 }}>
            <Customized component={EcgPrintGrid} />
            <XAxis
              dataKey="t"
              type="number"
              domain={xDomain}
              allowDataOverflow
              tickFormatter={(x) => `${Number(x).toFixed(3)} ${t("ecg.sec")}`}
              minTickGap={16}
              fontSize={11}
            />
            <YAxis
              domain={yDomain}
              allowDataOverflow
              tickFormatter={(v) => `${Number(v).toFixed(2)} ${t("ecg.mv")}`}
              width={56}
              fontSize={11}
            />
            <Tooltip
              {...chartTooltipStyles}
              formatter={(value: number) => [
                `${Number(value).toFixed(3)} ${t("ecg.mv")}`,
                t("ecg.voltage"),
              ]}
              labelFormatter={(label) =>
                `${t("ecg.timeAxis")}: ${Number(label).toFixed(4)} ${t("ecg.sec")}`
              }
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke={ECG_STROKE}
              dot={false}
              strokeWidth={1.25}
              isAnimationActive={false}
            />
            <Brush
              dataKey="t"
              height={44}
              stroke="var(--color-teal-500, #14b8a6)"
              fill="rgba(45, 212, 191, 0.12)"
              travellerWidth={9}
              startIndex={brushStart}
              endIndex={brushEnd}
              onChange={handleBrushChange}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function EcgPage({ session }: Props) {
  const { locale, t } = useI18n();
  const dateLocale = useMemo(() => dateLocaleForAppLocale(locale), [locale]);

  const [waveforms, setWaveforms] = useState<EcgWaveformRow[]>([]);
  const [classRows, setClassRows] = useState<HealthSampleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [classTruncated, setClassTruncated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchSettled, setFetchSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const uid = session.user.id;

    async function load() {
      setLoading(true);
      setFetchSettled(false);
      setError(null);
      setClassTruncated(null);
      try {
        const [{ data: wfData, error: wfErr }, classResult] = await Promise.all([
          supabase
            .from("ecg_waveforms")
            .select("*")
            .eq("user_id", uid)
            .order("recorded_at", { ascending: true }),
          fetchAllHealthSamplesForMetric(uid, ECG_METRIC_ID),
        ]);

        if (cancelled) return;

        if (wfErr) {
          setError(wfErr.message);
          setWaveforms([]);
        } else {
          setWaveforms((wfData as EcgWaveformRow[]) ?? []);
        }

        if (classResult.error) {
          if (!wfErr) setError(classResult.error);
        } else {
          setClassRows(classResult.data);
          setClassTruncated(classResult.truncatedWarning);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setFetchSettled(true);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [session.user.id]);

  const classChartData = useMemo(
    () =>
      classRows.map((r) => ({
        t: r.recorded_at,
        label: formatRecorded(r.recorded_at, dateLocale),
        v: r.value,
      })),
    [classRows, dateLocale],
  );

  return (
    <div className="dashboard-root">
      <div className="card" aria-label={t("ecg.summary")}>
        {error ? <p className="error">{error}</p> : null}
        {classTruncated ? <p className="muted">{classTruncated}</p> : null}
        {!loading && fetchSettled && !waveforms.length && !classRows.length && !error ? (
          <p className="muted">{t("ecg.empty")}</p>
        ) : null}
        {!loading && fetchSettled && waveforms.length > 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t("ecg.waveformsCount", { count: waveforms.length })}
          </p>
        ) : null}
      </div>

      {waveforms.length > 0 ? (
        <section aria-label={t("ecg.rhythmsSection")}>
          <h2 style={{ fontSize: "1.15rem", margin: "0 0 0.75rem" }}>{t("ecg.rhythmsTitle")}</h2>
          <p className="muted" style={{ marginTop: 0, marginBottom: "1rem" }}>
            {t("ecg.rhythmsIntro")}
          </p>
          {waveforms.map((w) => (
            <EcgWaveformCard key={w.id} row={w} />
          ))}
        </section>
      ) : null}

      {!loading && fetchSettled && !waveforms.length && classChartData.length > 0 ? (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>{t("ecg.classificationOverTime")}</h2>
          <p className="muted" style={{ margin: "0 0 0.75rem" }}>{t("ecg.classificationHint")}</p>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={classChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(v) => formatEcgXAxisTick(String(v), dateLocale)}
                  minTickGap={28}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => formatMetricAxisTick(ECG_METRIC_ID, Number(v))}
                  width={72}
                />
                <Tooltip
                  {...chartTooltipStyles}
                  formatter={(value: number) => {
                    const n = Number(value);
                    return [formatEcgTooltip(n), t("ecg.title")];
                  }}
                  labelFormatter={(_, p) => {
                    const payload = p?.[0]?.payload as { label?: string } | undefined;
                    return payload?.label ?? "";
                  }}
                />
                <Line type="monotone" dataKey="v" stroke={ECG_STROKE} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {loading ? (
        <LoadingOverlay message={t("ecg.loading")} variant="absolute" />
      ) : null}
    </div>
  );
}
