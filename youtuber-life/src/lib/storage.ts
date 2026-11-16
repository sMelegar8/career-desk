import { useEffect, useState } from 'react';
import type { Income, Video } from './types';

function useStored<T>(key: string, parse: (raw: unknown) => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return parse(raw ? JSON.parse(raw) : undefined);
    } catch {
      return parse(undefined);
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable (private mode): keep working in memory
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** Fills fields added after the first release so old saved data keeps working. */
export function normalizeVideos(raw: unknown): Video[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => ({ platforms: [], compliance: {}, tags: [], notes: '', ...v }));
}

export function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const byId = new Map(incoming.map((x) => [x.id, x]));
  return [...current.map((x) => byId.get(x.id) ?? x), ...incoming.filter((x) => !current.some((c) => c.id === x.id))];
}

export const useVideos = () => useStored('youtuber-life:videos', normalizeVideos);
export const useIncomes = () => useStored<Income[]>('youtuber-life:incomes', (raw) => (Array.isArray(raw) ? raw : []));
