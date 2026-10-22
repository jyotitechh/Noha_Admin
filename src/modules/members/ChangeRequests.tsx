/* Changes members ask for from the app.

   A member who wants a detail changed after they were approved files a request
   in the Noah app. It lands in Catalyst; the office decides here. Approving
   writes the new value to the member's record, the same place an edit from the
   console writes, so the app shows it. Turning one down needs a reason.

   A request the console cannot place (a field it does not know) can be turned
   down but not approved: guessing which detail a stranger's request means is how
   the wrong thing gets edited. */

import { useState } from 'react';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { Drawer, useToast } from '@/components/layers';
import { Btn, Chip, Empty, Failed, Field, Loading, Note, Seg } from '@/components/ui';
import { fdt, since } from '@/lib/format';

interface Request {
  id: string; memberRowId: string | null; memberName: string; fieldId: string; fieldLabel: string | null;
  known: boolean; contact: boolean; oldValue: string; newValue: string; status: 'pending' | 'approved' | 'rejected';
  note: string; at: Date | null; decidedAt: Date | null; masked?: boolean;
}
type Show = 'pending' | 'approved' | 'rejected';

export default function ChangeRequests() {
  const [show, setShow] = useState<Show>('pending');
  const [turning, setTurning] = useState<Request | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();
  const { can } = useAuth();

  const q = useQuery(() => api.get<{ rows: Request[]; notInProject?: boolean; message?: string }>(`/change-requests?status=${show}`), [show]);

  async function decide(r: Request, approve: boolean, note = '') {
    setBusy(r.id);
    try {
      const out = await api.post<{ applied: string[] }>(`/change-requests/${r.id}/decide`, { approve, note });
      toast(approve
        ? (out.applied.length ? `Applied: ${out.applied.join(', ')}. The member's record is updated.` : 'Approved. The member already had that value.')
        : 'Turned down.');
      setTurning(null);
      setReason('');
      q.reload();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(null);
    }
  }

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading what="the requests" />;
  if (q.data.notInProject) return <Note tone="mute" icon="info">{q.data.message}</Note>;
  const rows = q.data.rows;

  return (
    <div className="stack">
      <div className="row wrap gap8">
        <Seg<Show>
          value={show}
          onChange={setShow}
          options={[{ id: 'pending', label: 'Waiting' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Turned down' }]}
        />
        <span className="sp" style={{ flex: 1 }} />
        <Btn icon="refresh" onClick={q.reload}>Refresh</Btn>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <Empty icon="inbox" title={show === 'pending' ? 'Nothing is waiting' : 'None here'}>
            {show === 'pending' ? 'When a member asks the app to change a detail, it appears here.' : undefined}
          </Empty>
        </div>
      ) : (
        <ul className="list card">
          {rows.map((r) => (
            <li key={r.id} style={{ alignItems: 'flex-start' }}>
              <span className="grow">
                <span className="t1" style={{ display: 'block' }}>
                  {r.memberName} · {r.fieldLabel ?? r.fieldId}
                  {r.contact && <> <Chip tone="mute" icon="lock">Contact detail</Chip></>}
                </span>
                <span className="t2" style={{ display: 'block' }}>
                  {r.masked ? 'Hidden: it is a contact detail' : <><s>{r.oldValue || 'empty'}</s> → <b>{r.newValue || 'empty'}</b></>}
                </span>
                <span className="t2" style={{ display: 'block' }}>
                  Asked {r.at ? `${since(r.at)} · ${fdt(r.at)}` : ''}
                  {r.status !== 'pending' && r.decidedAt ? ` · decided ${fdt(r.decidedAt)}` : ''}
                  {r.note ? ` · “${r.note}”` : ''}
                </span>
                {!r.known && r.status === 'pending' && (
                  <span className="t2" style={{ display: 'block', color: 'var(--warn)' }}>
                    The console does not know which detail “{r.fieldId}” is, so it cannot apply this. It can be turned down.
                  </span>
                )}
              </span>
              {r.status === 'pending' ? (
                <span className="row gap6">
                  <Btn
                    sm
                    variant="pri"
                    disabled={busy === r.id || !r.known || (r.contact && !can('members.pii'))}
                    onClick={() => decide(r, true)}
                  >
                    Approve
                  </Btn>
                  <Btn sm disabled={busy === r.id} onClick={() => { setTurning(r); setReason(''); }}>Turn down</Btn>
                </span>
              ) : (
                <Chip tone={r.status === 'approved' ? 'ok' : 'bad'}>{r.status === 'approved' ? 'Approved' : 'Turned down'}</Chip>
              )}
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={!!turning}
        onClose={() => setTurning(null)}
        title="Turn this request down"
        sub={turning ? `${turning.memberName} · ${turning.fieldLabel ?? turning.fieldId}` : undefined}
        footer={
          <>
            <span className="sp" style={{ flex: 1 }} />
            <Btn onClick={() => setTurning(null)}>Cancel</Btn>
            <Btn variant="danger" disabled={!reason.trim() || busy === turning?.id} onClick={() => turning && decide(turning, false, reason.trim())}>
              Turn it down
            </Btn>
          </>
        }
      >
        <Field label="Why?" hint="Kept with the request, so the next person to look can see why.">
          <textarea className="inp" rows={4} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Drawer>
    </div>
  );
}
