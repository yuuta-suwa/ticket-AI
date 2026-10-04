import { useCallback, useEffect, useRef, useState } from 'react';
import { cacheStore } from './storage';
import { errors } from './log';

export interface Resource<T> { data: T | null; loading: boolean; refreshing: boolean; error: string | null; fromCache: boolean; updatedAt: number | null; refresh: () => Promise<void> }

/** Stale-while-revalidate: show cached data immediately (fast cold start / offline), then refresh from the network. */
export function useResource<T>(key: string, fetcher: () => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const alive = useRef(true);
  const fetchRef = useRef(fetcher); fetchRef.current = fetcher;

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      const v = await fetchRef.current();
      if (!alive.current) return;
      setData(v); setError(null); setFromCache(false); setUpdatedAt(Date.now());
      void cacheStore.set(key, v);
    } catch (e) {
      errors.captureError(e, { resource: key });
      if (alive.current) setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally { if (alive.current) { setLoading(false); setRefreshing(false); } }
  }, [key]);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    (async () => {
      const c = await cacheStore.get<T>(key);
      if (c && !cancelled) { setData(c.value); setFromCache(true); setUpdatedAt(c.at); setLoading(false); }
      await load(false);
    })();
    return () => { cancelled = true; alive.current = false; };
  }, [key, ...deps]);

  return { data, loading, refreshing, error, fromCache, updatedAt, refresh: () => load(true) };
}
