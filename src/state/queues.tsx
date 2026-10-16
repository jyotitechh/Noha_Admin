/* The work queues, held once for the whole console.

   The sidebar badges, the bell and the queues screen all read from here, so
   approving something in one place drops the count everywhere at once. Call
   `refresh()` after any write that could change a queue. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Queue } from '@/lib/api';
import { useAuth } from './auth';

interface QueuesValue {
  queues: Queue[];
  byId: Record<string, Queue>;
  total: number;
  refresh: () => void;
}

const Ctx = createContext<QueuesValue>({ queues: [], byId: {}, total: 0, refresh: () => {} });

export function QueuesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [queues, setQueues] = useState<Queue[]>([]);

  const refresh = useCallback(() => {
    if (!user) { setQueues([]); return; }
    api.get<Queue[]>('/queues').then(setQueues).catch(() => setQueues([]));
  }, [user]);

  /* Reload when the signed-in role changes: a different role sees a
     different set of queues. */
  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo<QueuesValue>(() => {
    const byId: Record<string, Queue> = {};
    for (const q of queues) byId[q.id] = q;
    return { queues, byId, total: queues.reduce((n, q) => n + q.count, 0), refresh };
  }, [queues, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useQueues = () => useContext(Ctx);
