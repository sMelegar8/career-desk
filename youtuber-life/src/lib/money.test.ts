import { describe, expect, it } from 'vitest';
import { forfettarioTax, summarizeIncome, thresholds } from './money';
import { missingCompliance, needsComplianceAttention } from './compliance';
import { mergeById, normalizeVideos } from './storage';
import { newVideo } from './videos';
import type { Income, Video } from './types';

const inc = (date: string, source: Income['source'], amount: number): Income => ({ id: date + source, date, source, amount, note: '' });

describe('summarizeIncome', () => {
  it('totals by source, filters by year and finds the dominant source', () => {
    const s = summarizeIncome([inc('2026-01-10', 'sponsor', 600), inc('2026-02-01', 'affiliate', 400), inc('2025-12-31', 'shorts', 999)], 2026);
    expect(s.total).toBe(1000);
    expect(s.bySource.sponsor).toBe(600);
    expect(s.topSource).toBe('sponsor');
    expect(s.topShare).toBeCloseTo(0.6);
  });
  it('handles no income', () => {
    expect(summarizeIncome([]).topShare).toBe(0);
  });
});

describe('forfettarioTax', () => {
  it('applies the 78% coefficient and the rate', () => {
    expect(forfettarioTax(10_000, true)).toBe(390);
    expect(forfettarioTax(10_000, false)).toBe(1170);
  });
});

describe('thresholds', () => {
  it('counts shorts views in the last 90 days and all views in the last 30', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const pub = (date: string, views: number, platforms: ('shorts' | 'youtube')[]) => ({
      ...newVideo('x'), stage: 'pubblicato' as const, publishDate: date, views, platforms, subsGained: 10,
    });
    const t = thresholds([pub('2026-10-10', 100, ['shorts']), pub('2026-08-01', 50, ['shorts']), pub('2026-10-15', 7, ['youtube']), pub('2026-01-01', 1000, ['shorts'])], now);
    expect(t.shortsViews90d).toBe(150);
    expect(t.views30d).toBe(107);
    expect(t.subscribers).toBe(40);
  });
});

describe('compliance', () => {
  it('flags published videos with missing items', () => {
    const v = { ...newVideo('x'), stage: 'pubblicato' as const, compliance: { adv: true, food: true } as Video['compliance'] };
    expect(missingCompliance(v)).toHaveLength(4);
    expect(needsComplianceAttention(v)).toBe(true);
    expect(needsComplianceAttention({ ...v, stage: 'idea' })).toBe(false);
  });
});

describe('normalizeVideos', () => {
  it('fills fields missing from data saved by the first version', () => {
    const [v] = normalizeVideos([{ id: '1', title: 'old', notes: '', tags: [], stage: 'idea', createdAt: '' }]);
    expect(v.platforms).toEqual([]);
    expect(v.compliance).toEqual({});
    expect(normalizeVideos('garbage')).toEqual([]);
  });
});

describe('mergeById', () => {
  it('keeps existing items, updates matching ids and appends new ones', () => {
    const merged = mergeById([{ id: 'a', n: 1 }, { id: 'b', n: 2 }], [{ id: 'b', n: 20 }, { id: 'c', n: 3 }]);
    expect(merged).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 20 }, { id: 'c', n: 3 }]);
  });
});
