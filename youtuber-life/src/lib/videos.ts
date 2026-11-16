import { STAGES, type Stage, type Video } from './types';

export function newVideo(title: string, now = new Date()): Video {
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    notes: '',
    tags: [],
    stage: 'idea',
    platforms: [],
    compliance: {},
    createdAt: now.toISOString(),
  };
}

export function moveStage(video: Video, direction: 1 | -1): Video {
  const i = STAGES.indexOf(video.stage) + direction;
  if (i < 0 || i >= STAGES.length) return video;
  return { ...video, stage: STAGES[i] };
}

export function byStage(videos: Video[]): Record<Stage, Video[]> {
  const out = Object.fromEntries(STAGES.map((s) => [s, [] as Video[]])) as Record<Stage, Video[]>;
  for (const v of videos) out[v.stage].push(v);
  return out;
}

export interface Stats {
  total: number;
  published: number;
  totalViews: number;
  totalLikes: number;
  avgViews: number;
  publishedByMonth: { month: string; count: number }[];
  top: Video[];
}

export function computeStats(videos: Video[]): Stats {
  const published = videos.filter((v) => v.stage === 'pubblicato');
  const totalViews = published.reduce((s, v) => s + (v.views ?? 0), 0);
  const totalLikes = published.reduce((s, v) => s + (v.likes ?? 0), 0);
  const months = new Map<string, number>();
  for (const v of published) {
    if (!v.publishDate) continue;
    const m = v.publishDate.slice(0, 7);
    months.set(m, (months.get(m) ?? 0) + 1);
  }
  return {
    total: videos.length,
    published: published.length,
    totalViews,
    totalLikes,
    avgViews: published.length ? Math.round(totalViews / published.length) : 0,
    publishedByMonth: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })),
    top: [...published].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5),
  };
}

/** Days (YYYY-MM-DD) of a month grid starting on Monday, padded with nulls. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= days; d++) {
    cells.push(new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10));
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}
