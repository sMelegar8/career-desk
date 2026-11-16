import { INCOME_SOURCES, type Income, type IncomeSource, type Video } from './types';

export const FORFETTARIO_COEFFICIENT = 0.78;
export const FORFETTARIO_LIMIT = 85_000;

export interface IncomeSummary {
  total: number;
  bySource: Record<IncomeSource, number>;
  /** share (0–1) of the largest source */
  topShare: number;
  topSource?: IncomeSource;
}

export function summarizeIncome(incomes: Income[], year?: number): IncomeSummary {
  const bySource = Object.fromEntries(INCOME_SOURCES.map((s) => [s, 0])) as Record<IncomeSource, number>;
  for (const i of incomes) {
    if (year !== undefined && Number(i.date.slice(0, 4)) !== year) continue;
    bySource[i.source] += i.amount;
  }
  const total = Object.values(bySource).reduce((a, b) => a + b, 0);
  let topSource: IncomeSource | undefined;
  for (const s of INCOME_SOURCES) if (bySource[s] > 0 && (!topSource || bySource[s] > bySource[topSource])) topSource = s;
  return { total, bySource, topShare: total && topSource ? bySource[topSource] / total : 0, topSource };
}

/** Substitute tax only (excludes INPS contributions). */
export function forfettarioTax(revenue: number, startup: boolean): number {
  return Math.round(revenue * FORFETTARIO_COEFFICIENT * (startup ? 0.05 : 0.15) * 100) / 100;
}

export interface Thresholds {
  subscribers: number;
  shortsViews90d: number;
  views30d: number;
}

function daysAgo(date: string, now: Date): number {
  return (now.getTime() - new Date(date + 'T00:00:00Z').getTime()) / 86_400_000;
}

/**
 * Approximation from the tracked videos: views are attributed to the publish date,
 * so the real rolling windows in YouTube Studio remain the source of truth.
 */
export function thresholds(videos: Video[], now = new Date()): Thresholds {
  let subscribers = 0;
  let shortsViews90d = 0;
  let views30d = 0;
  for (const v of videos) {
    if (v.stage !== 'pubblicato') continue;
    subscribers += v.subsGained ?? 0;
    if (!v.publishDate) continue;
    const age = daysAgo(v.publishDate, now);
    if (age < 0) continue;
    if (age <= 90 && v.platforms.includes('shorts')) shortsViews90d += v.views ?? 0;
    if (age <= 30) views30d += v.views ?? 0;
  }
  return { subscribers, shortsViews90d, views30d };
}

export const YPP = {
  tier1: { subscribers: 500, shortsViews: 3_000_000 },
  tier2: { subscribers: 1_000, shortsViews: 10_000_000 },
};
export const AGCOM_MONTHLY_VIEWS = 1_000_000;
