/** Chart filter range (from this date through “now”). */
export type ChartPeriod = "day" | "week" | "month" | "halfYear";

export const CHART_PERIODS: ChartPeriod[] = ["day", "week", "month", "halfYear"];

export function startDateForPeriod(period: ChartPeriod): Date {
  const now = new Date();
  switch (period) {
    case "day": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "halfYear":
      return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    default:
      return new Date(0);
  }
}
