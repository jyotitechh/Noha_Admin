/* Attendance (EVENTS-QR-CONTRACT.md, sections 4 and 5).

   First every event, newest first, with how many booked and how many came. Click an event's name to see everyone booked for it:
   present (when they came in and who let them in), not yet arrived, or cancelled. Door staff let people in from the Noah app; the
   console has no scanner. With events.scan, someone can be marked present or absent by hand, with a reason.

   Below the list: "Latest arrivals" (the last 15 people let in, from the Noah API, read again every 5 seconds while Live is on) and
   the "History" (the audit trail: every admission and every change by hand, who did it, when, on which device, and why).
   Reading needs events.view or events.scan; correcting needs events.scan. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, apiUrl, getToken, type ApiError } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { Modal, useToast } from '@/components/layers';
import { Table, type Column } from '@/components/Table';
import { Btn, Chip, Empty, Field, Kpi, Kpis, Loading, Seg, Switch, Who } from '@/components/ui';
import { dayLong, time12, type EventRow } from './shared';

interface EventSummary extends EventRow { booked: number; present: number; cancelled: number; notArrived: number }
interface Counts {
  event?: { id: string; name: string; start?: string; scanningOpen?: boolean };
  registered: number; confirmed: number; checkedIn: number; notYetArrived: number; cancelled: number; attendancePercent: number; capped?: boolean;
  recent: { at: string; manual?: boolean; member: { id: string; name: string } }[];
}
interface Trail { at: string; action: string; result?: string; staff?: { id?: string; name?: string }; deviceRef?: string | null; reason?: string | null; passId?: string; member?: { id?: string; name?: string } }
interface Person { passId: string; memberId: string; name: string; number: string; status: 'Present' | 'Not yet arrived' | 'Cancelled'; arrivedAt: string; letInBy: string }
type Filter = 'all' | 'Present' | 'Not yet arrived' | 'Cancelled';

/* The Noah API names each entry; older entries carry the number it keeps them under (9101 to 9104). */
const ACTION: Record<string, string> = {
  admit_qr: 'Let in by QR code', admit_reference: 'Let in by typed reference',
  correct_present: 'Marked present by hand', correct_absent: 'Marked absent by hand',
  9101: 'Let in by QR code', 9102: 'Let in by typed reference', 9103: 'Marked present by hand', 9104: 'Marked absent by hand',
};

/* The passes table keeps times in UTC without saying so ("2026-11-15 12:30:00"); the Noah API sends ISO times. */
const asDate = (s: string) => new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s) ? s.replace(' ', 'T') + 'Z' : s);
const when = (s: string) => (s ? asDate(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '');
const STATUS_TONE = { Present: 'ok', 'Not yet arrived': 'warn', Cancelled: 'mute' } as const;

export default function Attendance() {
  const [params, setParams] = useSearchParams();
  const eventId = params.get('event') || '';
  return eventId
    ? <EventAttendance eventId={eventId} onBack={() => setParams({})} />
    : <EventList onOpen={(id) => setParams({ event: id })} />;
}

/** Every event with its numbers. Click a name to see the people. */
function EventList({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<EventSummary[] | null>(null);
  const [problem, setProblem] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get<{ rows: EventSummary[] }>('/event-admin/attendance/events')
      .then((r) => setRows(r.rows)).catch((e) => setProblem((e as Error).message));
  }, []);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (rows ?? []).filter((e) => !s || [e.name, e.locationName].some((v) => String(v ?? '').toLowerCase().includes(s)));
  }, [rows, search]);

  if (problem) return <div className="card"><Empty icon="alert" title="Attendance cannot be shown">{problem}</Empty></div>;
  if (!rows) return <div className="card"><Loading what="events" /></div>;

  const columns: Column<EventSummary>[] = [
    {
      key: 'name', label: 'Event',
      cell: (e) => (
        <span className="stack" style={{ gap: 2 }}>
          <a className="t1" style={{ fontWeight: 600, cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); onOpen(e.id); }}>{e.name}</a>
          {e.locationName && <span className="t2 small muted">{e.locationName}</span>}
        </span>
      ),
      sortBy: (e) => e.name,
    },
    { key: 'when', label: 'When', cell: (e) => <span>{dayLong(e.date)}{e.startTime ? ` · ${time12(e.startTime)}` : ''}</span>, sortBy: (e) => e.date + e.startTime },
    { key: 'booked', label: 'Booked', cell: (e) => e.booked, sortBy: (e) => e.booked },
    { key: 'present', label: 'Present', cell: (e) => (e.present ? <Chip tone="ok">{e.present}</Chip> : <span className="muted">0</span>), sortBy: (e) => e.present },
    { key: 'notArrived', label: 'Not yet arrived', cell: (e) => e.notArrived, sortBy: (e) => e.notArrived },
  ];

  return (
    <Table
      rows={shown}
      columns={columns}
      rowKey={(e) => e.id}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Event name or place"
      onRowClick={(e) => onOpen(e.id)}
      pageSize={25}
      empty={<Empty icon="cal" title="No events">Events you create appear here, with who came to each.</Empty>}
    />
  );
}

/** One event: the numbers, everyone booked and whether they came, latest arrivals and the history. */
function EventAttendance({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [countsProblem, setCountsProblem] = useState('');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [peopleProblem, setPeopleProblem] = useState('');
  const [trail, setTrail] = useState<Trail[] | null>(null);
  const [live, setLive] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [correct, setCorrect] = useState<{ person: Person; action: 'present' | 'absent' } | null>(null);
  const lastSeen = useRef('');

  const readPeople = () => api.get<{ rows: Person[] }>(`/event-admin/events/${eventId}/people`)
    .then((r) => { setPeople(r.rows); setPeopleProblem(''); }).catch((e) => setPeopleProblem((e as Error).message));
  const readTrail = () => api.get<{ trail: Trail[] }>(`/event-admin/events/${eventId}/attendance/audit?limit=100`)
    .then((t) => setTrail(t.trail ?? [])).catch(() => setTrail([]));
  /* The Noah API's numbers. When they move (someone came in, or cancelled), the list and the history are read again. */
  const countsFailed = useRef(false);
  const readCounts = () => api.get<Counts>(`/event-admin/events/${eventId}/attendance`).then((c) => {
    setCounts(c); setCountsProblem(''); countsFailed.current = false;
    const key = `${c.registered}/${c.checkedIn}/${c.cancelled}`;
    if (lastSeen.current && key !== lastSeen.current) { readPeople(); readTrail(); }
    lastSeen.current = key;
  }).catch((e) => { setCountsProblem((e as Error).message); countsFailed.current = true; });

  useEffect(() => {
    lastSeen.current = '';
    setCounts(null); setPeople(null); setTrail(null);
    api.get<{ rows: EventSummary[] }>('/event-admin/attendance/events')
      .then((r) => setEvent(r.rows.find((e) => e.id === eventId) ?? null)).catch(() => {});
    readCounts(); readPeople(); readTrail();
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!live) return;
    let tick = 0;
    const t = setInterval(() => {
      tick += 1;
      readCounts();
      /* Without the Noah API's numbers nothing says the list changed: read it again every 20 seconds instead. */
      if (countsFailed.current && tick % 4 === 0) readPeople();
    }, 5000);
    return () => clearInterval(t);
  }, [eventId, live]); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportCsv() {
    try {
      const res = await fetch(apiUrl(`/event-admin/events/${eventId}/attendance/export`), { headers: { authorization: 'Bearer ' + getToken() } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `The file could not be made (${res.status}).`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `attendance-${(event?.name || eventId).replace(/[^\w-]+/g, '-')}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  }

  const tally = useMemo(() => {
    const p = people ?? [];
    return {
      Present: p.filter((x) => x.status === 'Present').length,
      'Not yet arrived': p.filter((x) => x.status === 'Not yet arrived').length,
      Cancelled: p.filter((x) => x.status === 'Cancelled').length,
    };
  }, [people]);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (people ?? [])
      .filter((p) => filter === 'all' || p.status === filter)
      .filter((p) => !s || [p.name, p.number, p.letInBy].some((v) => String(v ?? '').toLowerCase().includes(s)));
  }, [people, filter, search]);

  /* The numbers are counted from the list below, so the two always agree. (The Noah API's own numbers, which it may cap at
     3000 passes, are only used to notice that something changed and to show the latest arrivals.) */
  const booked = tally.Present + tally['Not yet arrived'];
  const present = tally.Present;
  const pct = booked ? Math.round((present / booked) * 100) : 0;

  const columns: Column<Person>[] = [
    { key: 'name', label: 'Member', cell: (p) => <Who name={p.name} sub={p.number ? `Member ${p.number}` : undefined} />, sortBy: (p) => p.name },
    { key: 'status', label: 'Status', cell: (p) => <Chip tone={STATUS_TONE[p.status]} dot>{p.status}</Chip>, sortBy: (p) => p.status },
    { key: 'arrivedAt', label: 'Came in at', cell: (p) => (p.arrivedAt ? when(p.arrivedAt) : <span className="muted">—</span>), sortBy: (p) => p.arrivedAt },
    { key: 'letInBy', label: 'Let in by', cell: (p) => p.letInBy || <span className="muted">—</span>, sortBy: (p) => p.letInBy },
    ...(can('events.scan') ? [{
      key: 'act', label: '',
      cell: (p: Person) => p.status === 'Cancelled' ? null : (
        <Btn sm onClick={(ev) => { ev.stopPropagation(); setCorrect({ person: p, action: p.status === 'Present' ? 'absent' : 'present' }); }}>
          {p.status === 'Present' ? 'Mark absent' : 'Mark present'}
        </Btn>
      ),
    }] : []),
  ];

  return (
    <div className="stack">
      <div className="row wrap gap8" style={{ alignItems: 'center' }}>
        <Btn icon="chev-l" onClick={onBack}>All events</Btn>
        <span className="grow">
          <b style={{ fontSize: 17 }}>{event?.name ?? counts?.event?.name ?? 'Event'}</b>
          {event && <span className="muted small"> · {dayLong(event.date)}{event.startTime ? ` · ${time12(event.startTime)}` : ''}{event.locationName ? ` · ${event.locationName}` : ''}</span>}
        </span>
        <label className="row gap6 small" style={{ alignItems: 'center' }}><Switch checked={live} onChange={setLive} label="Live" /> Live</label>
        <Btn icon="download" onClick={exportCsv}>Export CSV</Btn>
      </div>

      <Kpis>
        <Kpi label="Booked" value={people ? booked : '…'} icon="ticket" detail={tally.Cancelled ? `${tally.Cancelled} cancelled` : 'none cancelled'} />
        <Kpi label="Present" value={people ? present : '…'} icon="users" tone="ok" detail={`${pct}% of booked`} />
        <Kpi label="Not yet arrived" value={people ? tally['Not yet arrived'] : '…'} icon="clock" />
      </Kpis>
      <div className="row wrap gap6">
        {counts?.event?.scanningOpen === false ? <Chip tone="mute">Door scanning is closed for this event</Chip> : counts ? <Chip tone="ok">Door scanning is open (in the Noah app)</Chip> : null}
        {countsProblem && <Chip tone="warn">Latest arrivals unavailable: {countsProblem}</Chip>}
      </div>

      {peopleProblem ? <div className="card"><Empty icon="alert" title="The list cannot be shown">{peopleProblem}</Empty></div>
        : !people ? <div className="card"><Loading what="who booked" /></div> : (
          <Table
            rows={shown}
            columns={columns}
            rowKey={(p) => p.passId}
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Name, member number or staff"
            pageSize={50}
            toolbar={
              <Seg value={filter} onChange={setFilter} options={[
                { id: 'all', label: 'Everyone', count: people.length },
                { id: 'Present', label: 'Present', count: tally.Present },
                { id: 'Not yet arrived', label: 'Not yet arrived', count: tally['Not yet arrived'] },
                { id: 'Cancelled', label: 'Cancelled', count: tally.Cancelled },
              ]} />
            }
            empty={<Empty icon="users" title={people.length ? 'Nobody matches' : 'Nobody has booked this event yet'} />}
          />
        )}

      <div className="g2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-h"><h3>Latest arrivals</h3></div>
          <p className="small muted" style={{ marginTop: 0 }}>The last 15 people let in, newest first. It updates every 5 seconds while Live is on.</p>
          {!counts ? (countsProblem ? <Empty icon="alert" title="Not available just now" /> : <Loading what="arrivals" />) : counts.recent.length ? (
            <ul className="list">
              {counts.recent.map((r, i) => (
                <li key={i}>
                  <span className="grow"><span className="t1">{r.member.name}</span><span className="t2">{when(r.at)}{r.manual ? ' · marked by hand' : ''}</span></span>
                </li>
              ))}
            </ul>
          ) : <Empty icon="users" title="Nobody has been let in yet" />}
        </div>
        <div className="card">
          <div className="card-h"><h3>History (audit trail)</h3></div>
          <p className="small muted" style={{ marginTop: 0 }}>Every admission at the door and every change made by hand: who did it, when, on which device, and the reason. Nothing here can be edited.</p>
          {!trail ? <Loading what="the history" /> : trail.length ? (
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

      {correct && (
        <Correct eventId={eventId} person={correct.person} initial={correct.action} onClose={() => setCorrect(null)}
          onDone={() => { setCorrect(null); readCounts(); readPeople(); readTrail(); }} />
      )}
    </div>
  );
}

/** Mark one member present or absent by hand, with a reason (kept in the history). */
function Correct({ eventId, person, initial, onClose, onDone }: {
  eventId: string; person: Person; initial: 'present' | 'absent'; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [action, setAction] = useState<'present' | 'absent'>(initial);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setErrors({});
    try {
      await api.post(`/event-admin/events/${eventId}/attendance/correct`, { passId: person.passId, memberId: person.memberId, action, reason });
      toast(`${person.name} is marked ${action}.`, 'ok');
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
    <Modal open onClose={onClose} title={`Correct attendance: ${person.name}`} width={520}
      footer={<><span className="sp" style={{ flex: 1 }} /><Btn onClick={onClose}>Cancel</Btn><Btn variant="ok" icon="check" disabled={busy || reason.trim().length < 3} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <div className="stack">
        <div className="row gap8">
          <label className="row gap6" style={{ alignItems: 'center' }}><input type="radio" checked={action === 'present'} onChange={() => setAction('present')} /> Present</label>
          <label className="row gap6" style={{ alignItems: 'center' }}><input type="radio" checked={action === 'absent'} onChange={() => setAction('absent')} /> Absent</label>
        </div>
        <Field label="Reason *" hint="Kept in the history. For example: phone battery died." error={errors.reason}>
          <input className={'inp' + (errors.reason ? ' err' : '')} value={reason} autoFocus maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
