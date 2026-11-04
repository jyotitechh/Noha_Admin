/* Changes members ask for from the app (Me > My information), and new profile photos.

   A member who wants a detail changed after they were approved files a request
   in the Noah app. It lands in Catalyst; the office decides here. Turning one
   down needs a reason.

   The decision goes through the Noah API when its key is set: it writes the value
   in the right format and sends the member a push, and a reason for turning it
   down is shown to the member. Without it (or with an API that lacks the calls)
   the console writes the record itself and nobody is told; the screen says which.
   A new photograph is shown beside the current one so it can be looked at first.

   A request the console cannot place (a field it does not know) can be turned
   down but not approved: guessing which detail a stranger's request means is how
   the wrong thing gets edited. The mobile number the member signs in with is
   known but never applied from here (server/change-fields.js says why). */

import { useEffect, useRef, useState } from 'react';
import { api, apiUrl, getToken } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { Drawer, useToast } from '@/components/layers';
import { Btn, Chip, Empty, Failed, Field, Loading, Note, Seg } from '@/components/ui';
import { fdt, since } from '@/lib/format';

interface Request {
  id: string; memberRowId: string | null; memberName: string; fieldId: string; fieldLabel: string | null;
  known: boolean; contact: boolean; photo?: boolean; blocked: string | null; saves: { label: string; value: string }[] | null; problem: string | null;
  oldValue: string; newValue: string; status: 'pending' | 'approved' | 'rejected';
  note: string; at: Date | null; decidedAt: Date | null; masked?: boolean;
}
type Show = 'pending' | 'approved' | 'rejected';

/** One of the two photographs on a photo request, fetched through our own server (audited), never from a public address. */
function RequestPhoto({ id, which, label }: { id: string; which: 'old' | 'new'; label: string }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const url = useRef('');
  useEffect(() => {
    let live = true;
    fetch(apiUrl(`/change-requests/${id}/photo/${which}`), { headers: { authorization: 'Bearer ' + getToken() } })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Could not load it (${res.status}).`);
        return res.blob();
      })
      .then((b) => { if (live) { url.current = URL.createObjectURL(b); setSrc(url.current); } })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; if (url.current) URL.revokeObjectURL(url.current); };
  }, [id, which]);
  return (
    <figure style={{ margin: 0 }}>
      {src ? <img src={src} alt={label} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)', display: 'block' }} />
        : <div className="muted xs" style={{ width: 120, minHeight: 60 }}>{error || 'Loading…'}</div>}
      <figcaption className="xs muted mt4">{label}</figcaption>
    </figure>
  );
}

export default function ChangeRequests() {
  const [show, setShow] = useState<Show>('pending');
  const [turning, setTurning] = useState<Request | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();
  const { can } = useAuth();

  const q = useQuery(() => api.get<{ rows: Request[]; notInProject?: boolean; message?: string; via?: 'api' | 'table'; listedFrom?: 'api' | 'table'; apiProblem?: string }>(`/change-requests?status=${show}`), [show]);

  async function decide(r: Request, approve: boolean, note = '') {
    setBusy(r.id);
    try {
      const out = await api.post<{ applied: string[]; via?: 'api' | 'table'; notified?: { pushed?: number } | null }>(`/change-requests/${r.id}/decide`, { approve, note });
      /* Say whether the member was told: through the API they are, by the table they are not. */
      const told = out.via === 'api'
        ? (out.notified?.pushed ? ' The member was notified.' : ' No phone could be reached to notify the member.')
        : ' The member was not notified.';
      toast((approve
        ? (out.applied.length ? `Applied: ${out.applied.join(', ')}. The member's record is updated.` : 'Approved. The member already had that value.')
        : 'Turned down.') + told, out.via === 'api' && !out.notified?.pushed ? 'warn' : undefined);
      setTurning(null);
      setReason('');
      q.reload();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(null);
    }
  }

  /* A failure shows inside the screen, under the tabs, so another tab can be tried: it used to replace everything. */
  if (!q.data && !q.error) return <Loading what="the requests" />;
  if (q.data?.notInProject) return <Note tone="mute" icon="info">{q.data.message}</Note>;
  const rows = q.error ? [] : (q.data?.rows ?? []);

  return (
    <div className="stack">
      {!q.data ? null : q.data.via === 'api' ? (
        <Note tone="ok" icon="bell">
          Decided through the Noah API: the new value is written in the format the app expects, and <b>the member is sent a notification</b>.
          The reason for turning a request down is shown to them.
        </Note>
      ) : (
        <Note tone="warn" icon="alert">
          The Noah API is not being used for these (its key is not set, or it does not have the calls yet), so deciding here updates the member's
          record but <b>the member is not sent a notification</b>. Set <span className="mono">NOAH_ADMIN_API_KEY</span> on the API to fix that.
        </Note>
      )}
      {q.data?.apiProblem && !q.error && (
        <Note tone="mute" icon="info">
          The Noah API could not list these just now (it answered “{q.data.apiProblem}”), so they are shown from the table instead. Only this list
          is affected.
        </Note>
      )}
      <div className="row wrap gap8">
        <Seg<Show>
          value={show}
          onChange={setShow}
          options={[{ id: 'pending', label: 'Waiting' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Turned down' }]}
        />
        <span className="sp" style={{ flex: 1 }} />
        <Btn icon="refresh" onClick={q.reload}>Refresh</Btn>
      </div>

      {q.error ? (
        <Failed error={q.error} onRetry={q.reload} />
      ) : rows.length === 0 ? (
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
                {r.photo ? (
                  <span className="row gap8 mt8" style={{ alignItems: 'flex-start' }}>
                    {r.oldValue && <RequestPhoto id={r.id} which="old" label="Now" />}
                    <RequestPhoto id={r.id} which="new" label="Asked for" />
                  </span>
                ) : (
                  <span className="t2" style={{ display: 'block' }}>
                    {r.masked ? 'Hidden: it is a contact detail' : <><s>{r.oldValue || 'empty'}</s> → <b>{r.newValue || 'empty'}</b></>}
                  </span>
                )}
                <span className="t2" style={{ display: 'block' }}>
                  Asked {r.at ? `${since(r.at)} · ${fdt(r.at)}` : ''}
                  {r.status !== 'pending' && r.decidedAt ? ` · decided ${fdt(r.decidedAt)}` : ''}
                  {r.note ? ` · “${r.note}”` : ''}
                </span>
                {r.status === 'pending' && r.saves && (
                  <span className="t2" style={{ display: 'block' }}>
                    Will be saved as: {r.saves.map((p, i) => <span key={p.label}>{i > 0 && ' · '}{p.label} <b>{p.value || 'empty'}</b></span>)}
                  </span>
                )}
                {!r.known && !r.blocked && r.status === 'pending' && (
                  <span className="t2" style={{ display: 'block', color: 'var(--warn)' }}>
                    The console does not know which detail “{r.fieldId}” is, so it cannot apply this. It can be turned down.
                  </span>
                )}
                {r.blocked && r.status === 'pending' && (
                  <span className="t2" style={{ display: 'block', color: 'var(--warn)' }}>{r.blocked}</span>
                )}
                {r.problem && r.status === 'pending' && (
                  <span className="t2" style={{ display: 'block', color: 'var(--warn)' }}>
                    This cannot be applied as it stands: {r.problem}
                  </span>
                )}
              </span>
              {r.status === 'pending' ? (
                <span className="row gap6">
                  <Btn
                    sm
                    variant="pri"
                    disabled={busy === r.id || !r.known || !!r.problem || (r.contact && !can('members.pii'))}
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
        <Field label="Why?" hint={q.data?.via === 'api' ? 'The member is shown this reason, and it is kept with the request.' : 'Kept with the request, so the next person to look can see why. The member is not told.'}>
          <textarea className="inp" rows={4} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Drawer>
    </div>
  );
}
