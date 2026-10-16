/* A small fetch-on-mount hook.

   The console reads far more than it writes, and every screen wants the same
   three things: the data, whether it is still coming, and what went wrong.
   That is all this does — no cache, no retries. If the console grows a need
   for those, swap this for TanStack Query; the call sites would not change
   much, because they already destructure { data, loading, error, reload }. */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: (Error & { needs?: string[]; youAre?: string }) | null;
  reload: () => void;
  /** Change the held data without going back to the server, after a write. */
  set: (next: T) => void;
}

export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []): QueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<QueryResult<T>['error']>(null);
  const [tick, setTick] = useState(0);

  /* Keep the latest fetcher without making it a dependency: callers almost
     always pass a fresh closure, which would otherwise loop. */
  const ref = useRef(fetcher);
  ref.current = fetcher;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    ref.current()
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e as Error); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, reload, set: setData };
}
