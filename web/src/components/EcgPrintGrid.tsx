import type { JSX } from "react";

/** ECG paper standard: 25 mm/s → one small square = 0.04 s; 10 mm/mV → one small = 0.1 mV. Major lines every 5 minors. */

const X_MINOR_STD = 0.04;
const X_MAJOR_STD = 0.2;
const Y_MINOR_STD = 0.1;
const Y_MAJOR_STD = 0.5;

const MAX_LINES = 220;

type AxisScale = {
  scale: (v: number) => number;
};

function getDomainFromScale(scale: (v: number) => number): [number, number] | null {
  const s = scale as unknown as { domain?: () => number[] };
  if (typeof s.domain !== "function") return null;
  const dom = s.domain();
  if (Array.isArray(dom) && dom.length >= 2) {
    const a = Number(dom[0]);
    const b = Number(dom[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return [Math.min(a, b), Math.max(a, b)];
    }
  }
  return null;
}

function pickStep(minor: number, major: number, span: number): { minor: number; major: number } {
  if (span <= 0 || !Number.isFinite(span)) return { minor, major };
  const est = span / minor;
  if (est <= MAX_LINES) return { minor, major };
  let m = minor;
  let g = major;
  let factor = 2;
  while (span / m > MAX_LINES && factor < 10000) {
    m = minor * factor;
    g = major * factor;
    factor *= 2;
  }
  return { minor: m, major: g };
}

/**
 * Rendered inside `<LineChart>` as `<Customized component={EcgPrintGrid} />`.
 * Receives `xAxisMap`, `yAxisMap`, `offset` from Recharts internal props.
 */
export function EcgPrintGrid(props: Record<string, unknown>): JSX.Element | null {
  const xAxisMap = props.xAxisMap as Record<string, AxisScale> | undefined;
  const yAxisMap = props.yAxisMap as Record<string, AxisScale> | undefined;
  const offset = props.offset as { left: number; top: number; width: number; height: number } | undefined;

  if (!xAxisMap || !yAxisMap || !offset) return null;

  const xAxis = xAxisMap[Object.keys(xAxisMap)[0] ?? "0"];
  const yAxis = yAxisMap[Object.keys(yAxisMap)[0] ?? "0"];
  if (!xAxis?.scale || !yAxis?.scale) return null;

  const { left, top, width, height } = offset;
  if (width <= 0 || height <= 0) return null;

  const xScale = xAxis.scale;
  const yScale = yAxis.scale;

  const xDom = getDomainFromScale(xScale);
  const yDom = getDomainFromScale(yScale);
  if (!xDom || !yDom) return null;

  const [x0, x1] = xDom;
  const [y0, y1] = yDom;
  const xSpan = x1 - x0;
  const ySpan = y1 - y0;

  const { minor: xStep, major: xMajor } = pickStep(X_MINOR_STD, X_MAJOR_STD, xSpan);
  const { minor: yStep, major: yMajor } = pickStep(Y_MINOR_STD, Y_MAJOR_STD, ySpan);

  const vLines: JSX.Element[] = [];
  const startX = Math.floor(x0 / xStep) * xStep;
  let i = 0;
  for (let t = startX; t <= x1 + 1e-9; t += xStep) {
    const px = xScale(t);
    if (!Number.isFinite(px)) continue;
    const major = Math.abs((t / xMajor) - Math.round(t / xMajor)) < 1e-6;
    vLines.push(
      <line
        key={`vx-${i++}`}
        x1={px}
        y1={top}
        x2={px}
        y2={top + height}
        stroke={major ? "var(--ecg-grid-major)" : "var(--ecg-grid-minor)"}
        strokeWidth={major ? 1.1 : 0.6}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }

  const hLines: JSX.Element[] = [];
  const startY = Math.floor(y0 / yStep) * yStep;
  let j = 0;
  for (let v = startY; v <= y1 + 1e-9; v += yStep) {
    const py = yScale(v);
    if (!Number.isFinite(py)) continue;
    const major = Math.abs((v / yMajor) - Math.round(v / yMajor)) < 1e-6;
    hLines.push(
      <line
        key={`hy-${j++}`}
        x1={left}
        y1={py}
        x2={left + width}
        y2={py}
        stroke={major ? "var(--ecg-grid-major)" : "var(--ecg-grid-minor)"}
        strokeWidth={major ? 1.1 : 0.6}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }

  return (
    <g className="ecg-print-grid" aria-hidden>
      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        fill="var(--ecg-paper-fill)"
        className="ecg-print-grid__paper"
      />
      <g className="ecg-print-grid__lines">{vLines}{hLines}</g>
    </g>
  );
}
