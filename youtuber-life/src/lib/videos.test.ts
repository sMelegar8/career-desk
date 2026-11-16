import { describe, expect, it } from 'vitest';
import { computeStats, monthGrid, moveStage, newVideo } from './videos';

describe('moveStage', () => {
  it('advances and stops at the ends', () => {
    const v = newVideo('Test');
    expect(moveStage(v, 1).stage).toBe('script');
    expect(moveStage(v, -1).stage).toBe('idea');
    expect(moveStage({ ...v, stage: 'pubblicato' }, 1).stage).toBe('pubblicato');
  });
});

describe('computeStats', () => {
  it('counts only published videos', () => {
    const a = { ...newVideo('A'), stage: 'pubblicato' as const, views: 100, likes: 10, publishDate: '2026-10-01' };
    const b = { ...newVideo('B'), stage: 'pubblicato' as const, views: 300, publishDate: '2026-10-15' };
    const c = { ...newVideo('C'), views: 999 };
    const s = computeStats([a, b, c]);
    expect(s.total).toBe(3);
    expect(s.published).toBe(2);
    expect(s.totalViews).toBe(400);
    expect(s.avgViews).toBe(200);
    expect(s.publishedByMonth).toEqual([{ month: '2026-10', count: 2 }]);
    expect(s.top[0].title).toBe('B');
  });
});

describe('monthGrid', () => {
  it('starts on Monday and fills whole weeks', () => {
    const g = monthGrid(2026, 9); // October 2026 starts on Thursday
    expect(g.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(g.length % 7).toBe(0);
    expect(g.filter(Boolean)).toHaveLength(31);
  });
});
