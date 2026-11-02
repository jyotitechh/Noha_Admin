/* People asking for console access.

   A member who registered in the Noah app and was approved, but is not staff, can ask from the sign-in
   page. Their request lands here. A super administrator picks the role and approves (one click, and
   the person can sign in with their own number from then on) or declines.

   Only a super administrator can give the Super administrator role, as everywhere else. The same rules as
   "Give access" apply on the server: nobody changes their own access, and only approved members qualify. */

import { useState } from 'react';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useQueues } from '@/state/queues';
import { useAuth } from '@/state/auth';
import { useToast } from '@/components/layers';
import { Btn, Empty, Failed, Loading, Note } from '@/components/ui';
import { fdt, since } from '@/lib/format';

interface Request { memberRowId: string; name: string; mobile: string; email: string; note: string; at: Date | null }
interface RoleInfo { id: string; name: string; desc: string }

/** Enough of a number to recognise, not enough to use. */
const mask = (m = '') => String(m).replace(/(\d{2})\d+(\d{2})$/, '$1••••••$2');

export default function Requests() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queues = useQueues();
  const meta = useQuery(() => api.get<{ roles: RoleInfo[] }>('/meta'), []);
  const q = useQuery(() => api.get<{ rows: Request[]; needsCatalyst?: boolean; tableReady?: boolean }>('/staff/requests'), []);
  const [role, setRole] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState('');   /* the request a decline is being confirmed for */
  const [busy, setBusy] = useState('');

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;
  if (!q.data || !meta.data) return <Loading what="the requests" />;

  /* Only a super administrator may hand out the super administrator role. */
  const roles = meta.data.roles.filter((r) => r.id !== 'super' || user?.role === 'super');
  const done = (message: string) => { toast(message); q.reload(); queues.refresh(); };

  async function approve(r: Request) {
    setBusy(r.memberRowId);
    try {
      await api.post(`/staff/requests/${r.memberRowId}/approve`, { role: role[r.memberRowId] });
      done(`${r.name} now has access. They can sign in with their own number.`);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy('');
    }
  }

  async function decline(r: Request) {
    setBusy(r.memberRowId);
    try {
      await api.post(`/staff/requests/${r.memberRowId}/decline`, {});
      setAsking('');
      done(`${r.name}'s request was declined.`);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        Members of the church who are not staff can ask for access from the sign-in page. Choose the role to give
        and approve in one click, or decline. Approved people sign in with the mobile number they registered with.
      </p>

      {q.data.needsCatalyst && (
        <Note tone="warn" icon="alert">Requests are kept in Catalyst, so there are none to show on the sample data.</Note>
      )}
      {q.data.tableReady === false && (
        <Note tone="warn" icon="alert">
          The console&rsquo;s access columns are not in Catalyst yet, so nobody can be given access.
          Run <code className="mono">npm run catalyst:columns -- --apply</code> (docs/CONSOLE-ACCESS.md).
        </Note>
      )}

      {q.data.rows.length === 0 ? (
        <Empty icon="key" title="No one is waiting">A request shows here as soon as a member sends one from the sign-in page.</Empty>
      ) : (
        <ul className="list">
          {q.data.rows.map((r) => (
            <li key={r.memberRowId} style={{ alignItems: 'flex-start' }}>
              <span className="grow">
                <span className="t1">{r.name}</span>
                <span className="t2">
                  <span className="mono">{mask(r.mobile)}</span>
                  {r.at ? ` · asked ${since(r.at)} (${fdt(r.at)})` : ''}
                </span>
                {r.note && <span className="t2">“{r.note}”</span>}
              </span>
              <span className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  className="inp" style={{ minWidth: 190 }} aria-label={`Role for ${r.name}`}
                  value={role[r.memberRowId] ?? ''} disabled={busy === r.memberRowId}
                  onChange={(e) => setRole((s) => ({ ...s, [r.memberRowId]: e.target.value }))}
                >
                  <option value="">Pick a role</option>
                  {roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <Btn variant="ok" icon="check" disabled={!role[r.memberRowId] || busy === r.memberRowId} onClick={() => approve(r)}>Approve</Btn>
                {asking === r.memberRowId ? (
                  <>
                    <Btn sm disabled={busy === r.memberRowId} onClick={() => decline(r)}>Yes, decline</Btn>
                    <Btn sm onClick={() => setAsking('')}>Cancel</Btn>
                  </>
                ) : (
                  <Btn sm onClick={() => setAsking(r.memberRowId)}>Decline</Btn>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
