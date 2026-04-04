/**
 * SpO₂ from HealthKit may arrive as a fraction 0…1 (0.95 = 95 %) even when the DB unit is «%».
 * Do not use toFixed(1) directly on 0.95 — in JS it often rounds to "1.0".
 */
export function spO2ToPercentDisplay(v: number): number {
  if (v > 0 && v <= 1.5) {
    return Math.round(v * 10000) / 100;
  }
  return v;
}

export function formatSpO2AxisTick(v: number): string {
  const p = spO2ToPercentDisplay(v);
  const rounded = Math.round(p * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatSpO2Tooltip(v: number): string {
  const p = spO2ToPercentDisplay(v);
  const s = Number.isInteger(p) || Math.abs(p - Math.round(p)) < 1e-6 ? String(Math.round(p)) : p.toFixed(1);
  return `${s} %`;
}

/** Codes aligned with iOS (`HKElectrocardiogram.Classification` → Int). */
const ECG_CLASS_LABELS: Record<number, string> = {
  0: "Синусовий ритм",
  1: "Фібриляція передсердь",
  2: "Невизначено (інше)",
  3: "Невизначено (сигнал)",
  4: "Невизначено (високий пульс)",
  5: "Невизначено (низький пульс)",
  98: "Без класифікації",
  99: "Невідомо",
};

/** Short labels for the Y axis (narrow layout). */
const ECG_AXIS_SHORT: Record<number, string> = {
  0: "Синус",
  1: "ФП",
  2: "Інше",
  3: "Сигнал",
  4: "Вис. п.",
  5: "Низ. п.",
  98: "—",
  99: "?",
};

export function formatEcgAxisTick(v: number): string {
  const k = Math.round(v);
  return ECG_AXIS_SHORT[k] ?? (Number.isInteger(v) ? String(v) : v.toFixed(1));
}

export function formatEcgTooltip(v: number): string {
  const k = Math.round(v);
  return ECG_CLASS_LABELS[k] ?? (Number.isFinite(v) ? String(v) : "—");
}

/** Dashboard Y axis: SpO₂ as percent; other metrics unchanged. */
export function formatMetricAxisTick(metric: string, v: number): string {
  if (metric === "oxygen_saturation") return formatSpO2AxisTick(v);
  if (metric === "ecg_classification") return formatEcgAxisTick(v);
  if (Number.isInteger(v)) return String(v);
  return Number.isFinite(v) ? v.toFixed(1) : String(v);
}
