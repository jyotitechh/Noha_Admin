/* Bookings: the passes members have taken in the app, read from Catalyst's `passes` table. One row per booking: cancelled by the
   member, attended (scanned at the door), or booked. Read only: members book and cancel in the app. */

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Chip, Empty, Kpi, Kpis, Loading } from '@/components/ui';
import { dayLong, type EventRow } from './shared';

interface Booking {
  id: string; eventId: string; event: string; memberId: string; member: string; number: string;
  seat: string; status: 'Booked' | 'Attended' | 'Cancelled'; bookedAt: string; usedAt: string;
}

const when = (s: string) => (s ? new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : '+05:30')).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

export default function Bookings() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState('');
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [problem, setProblem] = useState('');
  const [find, setFind] = useState('');

  useEffect(() => {
    api.get<{ rows: EventRow[] }>('/event-admin/events').then((r) => setEvents([...r.rows].sort((a, b) => b.date.localeCompare(a.date)))).catch(() => {});
  }, []);

  useEffect(() => {
    setRows(null);
    api.get<{ rows: Booking[] }>(`/event-admin/bookings${eventId ? `?eventId=${eventId}` : ''}`)
      .then((r) => { setRows(r.rows); setProblem(''); })
      .catch((e) => setProblem((e as Error).message));
  }, [eventId]);

  const shown = useMemo(() => {
    const n = find.trim().toLowerCase();
    return (rows ?? []).filter((b) => !n || `${b.member} ${b.number} ${b.event}`.toLowerCase().includes(n));
  }, [rows, find]);
  const count = (s: Booking['status']) => (rows ?? []).filter((b) => b.status === s).length;

  return (
    <div className="stack">
      <div className="row wrap gap8">
        <select className="sel" style={{ maxWidth: 420 }} value={eventId} aria-label="Event" onChange={(e) => setEventId(e.target.value)}>
          <option value="">All events</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name} · {dayLong(e.date)}</option>)}
        </select>
        <input className="inp" style={{ maxWidth: 280 }} value={find} placeholder="Member, number or event" aria-label="Find a booking" onChange={(e) => setFind(e.target.value)} />
      </div>

      {problem ? <div className="card"><Empty icon="alert" title="Bookings cannot be shown">{problem}</Empty></div> : !rows ? <div className="card"><Loading what="bookings" /></div> : (
        <>
          <Kpis>
            <Kpi label="Booked" value={count('Booked') + count('Attended')} icon="ticket" />
            <Kpi label="Attended" value={count('Attended')} icon="users" />
            <Kpi label="Cancelled" value={count('Cancelled')} icon="x" />
          </Kpis>
          {!shown.length ? (
            <div className="card"><Empty icon="ticket" title="No bookings yet">Passes members book in the app appear here.</Empty></div>
          ) : (
            <div className="card">
              <ul className="list">
                {shown.map((b) => (
                  <li key={b.id}>
                    <span className="grow">
                      <span className="t1">{b.member}{b.number ? <span className="muted"> · {b.number}</span> : null}</span>
                      <span className="t2">{b.event || 'Event'}{b.seat ? ` · seat ${b.seat}` : ''} · booked {when(b.bookedAt)}{b.usedAt ? ` · in at ${when(b.usedAt)}` : ''}</span>
                    </span>
                    <Chip tone={b.status === 'Attended' ? 'ok' : b.status === 'Cancelled' ? 'mute' : 'info'}>{b.status}</Chip>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
