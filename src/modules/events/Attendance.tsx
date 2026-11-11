/* Attendance for one event (EVENTS-QR-CONTRACT.md, sections 4 and 5): the numbers, who came in last (read again every 5 seconds
   while Live is on), the CSV, the audit trail of every admission and correction, and marking someone present or absent by hand,
   which needs a reason. Reading needs events.view or events.scan; correcting needs events.scan. */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, apiUrl, getToken, type ApiError } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { Modal, useToast } from '@/components/layers';
import { Btn, Chip, Empty, Field, Kpi, Kpis, Loading, Switch } from '@/components/ui';
import { dayLong, time12, type EventRow } from './shared';

interface Counts {
  event?: { id: string; name: string; start?: string; scanningOpen?: boolean };
  registered: number; confirmed: number; checkedIn: number; notYetArrived: number; cancelled: number; attendancePercent: number; capped?: boolean;
  recent: { at: string; manual?: boolean; member: { id: string; name: string } }[];
}
interface Trail { at: string; action: string; result?: string; staff?: { id?: string; name?: string }; deviceRef?: string | null; reason?: string | null; passId?: string; member?: { id?: string; name?: string } }
interface Booking { id: string; memberId: string; member: string; number: string; status: string; usedAt: string }

const ACTION: Record<string, string> = {
  admit_qr: 'Admitted by QR code', admit_reference: 'Admitted by typed reference',
  correct_present: 'Marked present by hand', correct_absent: 'Marked absent by hand',
};
const when = (s: string) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

export default function Attendance() {
  const { can } = useAuth();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const eventId = params.get('event') || '';
  const [counts, setCounts] = useState<Counts | null>(null);
  const [problem, setProblem] = useState('');
  const [live, setLive] = useState(true);
  const [trail, setTrail] = useState<Trail[] | null>(null);
  const [correcting, setCorrecting] = useState(false);

  useEffect(() => {
    const path = can('events.view') ? '/event-admin/events' : '/event-admin/scan/events';
    api.get<{ rows: EventRow[] }>(path).then((r) => {
      const rows = [...r.rows].sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
      setEvents(rows);
      if (!eventId && rows[0]) setParams({ event: rows[0].id }, { replace: true });
    }).catch((e) => setProblem((e as Error).message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const readCounts = () => api.get<Counts>(`/event-admin/events/${eventId}/attendance`).then((c) => { setCounts(c); setProblem(''); }).catch((e) => setProblem((e as Error).message));
  const readTrail = () => api.get<{ trail: Trail[] }>(`/event-admin/events/${eventId}/attendance/audit?limit=100`).then((t) => setTrail(t.trail ?? [])).catch(() => setTrail([]));

  useEffect(() => {
    if (!eventId) return;
    setCounts(null); setTrail(null);
    readCounts(); readTrail();
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!eventId || !live) return;
    const t = setInterval(readCounts, 5000);
    return () => clearInterval(t);
  }, [eventId, live]); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportCsv() {
    try {
      const res = await fetch(apiUrl(`/event-admin/events/${eventId}/attendance/export`), { headers: { authorization: 'Bearer ' + getToken() } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `The file could not be made (${res.status}).`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `attendance-${(events?.find((e) => e.id === eventId)?.name || eventId).replace(/[^\w-]+/g, '-')}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  }

  if (!events) return problem ? <div className="card"><Empty icon="alert" title="Attendance cannot be shown">{problem}</Empty></div> : <div className="card"><Loading what="events" /></div>;

  return (
    <div className="stack">
      <div className="row wrap gap8" style={{ alignItems: 'center' }}>
        <select className="sel" style={{ maxWidth: 440 }} value={eventId} aria-label="Event" onChange={(e) => setParams({ event: e.target.value })}>
          {!events.length && <option value="">No events</option>}
          {events.map((e) => <option key={e.id} value={e.id}>{e.name} · {dayLong(e.date)} · {time12(e.startTime)}</option>)}
        </select>
        <label className="row gap6 small" style={{ alignItems: 'center' }}><Switch checked={live} onChange={setLive} label="Live" /> Live</label>
        <span className="sp" style={{ flex: 1 }} />
        {eventId && <Btn icon="download" onClick={exportCsv}>Export CSV</Btn>}
        {eventId && can('events.scan') && <Btn variant="pri" icon="edit" onClick={() => setCorrecting(true)}>Correct attendance</Btn>}
      </div>

      {problem && <div className="small" style={{ color: 'var(--bad)' }}>{problem}</div>}

      {!eventId ? <div className="card"><Empty icon="cal" title="No event chosen" /></div> : !counts ? <div className="card"><Loading what="attendance" /></div> : (
        <>
          <Kpis>
            <Kpi label="Booked" value={counts.registered} icon="ticket" />
            <Kpi label="Confirmed" value={counts.confirmed} icon="check" detail={counts.cancelled ? `${counts.cancelled} cancelled` : 'none cancelled'} />
            <Kpi label="Checked in" value={counts.checkedIn} icon="users" detail={`${counts.attendancePercent}% of confirmed`} />
            <Kpi label="Not yet arrived" value={counts.notYetArrived} icon="clock" />
          </Kpis>
          <div className="row gap6">
            {counts.event?.scanningOpen === false ? <Chip tone="mute">Scanning is closed for this event</Chip> : <Chip tone="ok">Scanning is open</Chip>}
            {counts.capped && <Chip tone="warn">More than 3000 passes: the numbers cover the first 3000</Chip>}
          </div>

          <div className="g2" style={{ alignItems: 'start' }}>
            <div className="card">
              <div className="card-h"><h3>Last people in</h3></div>
              {counts.recent.length ? (
                <ul className="list">
                  {counts.recent.map((r, i) => (
                    <li key={i}>
                      <span className="grow"><span className="t1">{r.member.name}</span><span className="t2">{when(r.at)}{r.manual ? ' · by hand' : ''}</span></span>
                    </li>
                  ))}
                </ul>
              ) : <Empty icon="users" title="Nobody has been admitted yet" />}
            </div>
            <div className="card">
              <div className="card-h"><h3>Audit trail</h3></div>
              {!trail ? <Loading what="the audit trail" /> : trail.length ? (
                <ul className="list" style={{ maxHeight: 420, overflow: 'auto' }}>
                  {trail.map((t, i) => (
                    <li key={i}>
                      <span className="grow">
                        <span className="t1">{ACTION[t.action] ?? t.action}{t.member?.name ? `: ${t.member.name}` : ''}</span>
                        <span className="t2">{when(t.at)}{t.staff?.name ? ` · by ${t.staff.name}` : ''}{t.deviceRef ? ` · ${t.deviceRef}` : ''}{t.reason ? ` · “${t.reason}”` : ''}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <Empty icon="history" title="Nothing recorded yet" />}
            </div>
          </div>
        </>
      )}

      {correcting && (
        <Correct eventId={eventId} recent={counts?.recent ?? []} onClose={() => setCorrecting(false)}
          onDone={() => { setCorrecting(false); readCounts(); readTrail(); }} />
      )}
    </div>
  );
}

/** Mark one member present or absent by hand, with a reason. */
function Correct({ eventId, recent, onClose, onDone }: { eventId: string; recent: Counts['recent']; onClose: () => void; onDone: () => void }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [find, setFind] = useState('');
  const [pick, setPick] = useState<{ passId?: string; memberId?: string; name: string } | null>(null);
  const [action, setAction] = useState<'present' | 'absent'>('present');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!can('events.view')) { setBookings([]); return; }
    api.get<{ rows: Booking[] }>(`/event-admin/bookings?eventId=${eventId}`).then((r) => setBookings(r.rows.filter((b) => b.status !== 'Cancelled'))).catch(() => setBookings([]));
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The members to choose from: the bookings, else the people let in so far. */
  const options = useMemo(() => {
    const base = bookings && bookings.length
      ? bookings.map((b) => ({ passId: b.id, memberId: b.memberId, name: b.member, line: `${b.number ? `Member ${b.number} · ` : ''}${b.status}` }))
      : recent.map((r) => ({ passId: undefined, memberId: r.member.id, name: r.member.name, line: 'Checked in' }));
    const needle = find.trim().toLowerCase();
    return base.filter((o) => !needle || o.name.toLowerCase().includes(needle)).slice(0, 30);
  }, [bookings, recent, find]);

  async function save() {
    setBusy(true); setErrors({});
    try {
      await api.post(`/event-admin/events/${eventId}/attendance/correct`, { passId: pick?.passId, memberId: pick?.memberId, action, reason });
      toast(`${pick?.name} is marked ${action}.`, 'ok');
      onDone();
    } catch (e) {
      const err = e as ApiError;
      if (err.errors) setErrors(err.errors);
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Correct attendance" width={560}
      footer={<><span className="sp" style={{ flex: 1 }} /><Btn onClick={onClose}>Cancel</Btn><Btn variant="ok" icon="check" disabled={busy || !pick || reason.trim().length < 3} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <div className="stack">
        {pick ? (
          <div className="row gap8" style={{ alignItems: 'center' }}>
            <b className="grow">{pick.name}</b>
            <Btn sm onClick={() => setPick(null)}>Change</Btn>
          </div>
        ) : (
          <>
            <input className="inp" value={find} autoFocus placeholder="Find the member" aria-label="Find the member" onChange={(e) => setFind(e.target.value)} />
            {errors.passId && <div className="small" style={{ color: 'var(--bad)' }}>{errors.passId}</div>}
            <div className="card" style={{ maxHeight: 240, overflow: 'auto' }}>
              {!bookings ? <Loading what="the bookings" /> : (
                <ul className="list">
                  {options.map((o) => (
                    <li key={(o.passId || '') + o.memberId} className="click" onClick={() => setPick(o)}>
                      <span className="grow"><span className="t1">{o.name}</span><span className="t2">{o.line}</span></span>
                    </li>
                  ))}
                  {!options.length && <li className="muted" style={{ padding: 12 }}>Nobody to choose.</li>}
                </ul>
              )}
            </div>
          </>
        )}
        <div className="row gap8">
          <label className="row gap6" style={{ alignItems: 'center' }}><input type="radio" checked={action === 'present'} onChange={() => setAction('present')} /> Present</label>
          <label className="row gap6" style={{ alignItems: 'center' }}><input type="radio" checked={action === 'absent'} onChange={() => setAction('absent')} /> Absent</label>
        </div>
        <Field label="Reason *" hint="Kept in the audit trail. For example: phone battery died." error={errors.reason}>
          <input className={'inp' + (errors.reason ? ' err' : '')} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
