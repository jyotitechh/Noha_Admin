/* Services and events, and whether they are open for booking in the app.

   Publishing an event is what makes it appear in the app's Events tab and in
   the "Book by date" calendar, so the status column is the one that matters. */

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useToast } from '@/components/layers';
import { ListScreen } from '@/components/ListScreen';
import { Btn, Chip, Kpi, Kpis, Kv, Note, Status, Bar, Icon } from '@/components/ui';
import { fdt, fwd, num, pct, until } from '@/lib/format';

interface EventRow {
  id: string; name: string; type: string; group: string;
  start: Date; end: Date; hall: string; loc: string; langs: string[];
  status: string; cap: number; issued: number; attended: number;
  sessions: number; family: boolean;
}

export default function Events() {
  const { can } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState('');
  const [bump, setBump] = useState(0);

  async function setStatus(e: EventRow, to: string) {
    setBusy(e.id);
    try {
      await api.post(`/events/${e.id}/publish`, { to });
      setBump((n) => n + 1);
      toast(to === 'Published'
        ? `“${e.name}” is open for booking in the app.`
        : `“${e.name}” is no longer ${to === 'Draft' ? 'visible' : 'open'} in the app.`);
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy('');
    }
  }

  return (
    <ListScreen<EventRow>
      key={bump}
      name="EVENTS"
      what="events"
      sort={{ key: 'start', dir: 'asc' }}
      searchPlaceholder="Event name, place or type"
      searchIn={(e) => `${e.name} ${e.loc} ${e.type} ${e.group}`}
      intro={
        <Note tone="mute" icon="mobile">
          An event appears in the app’s Events tab, and in its “Book by date”
          calendar, only while its status is <b>Published</b>.
        </Note>
      }
      kpis={(rows) => {
        const open = rows.filter((e) => e.status === 'Published');
        const issued = rows.reduce((n, e) => n + e.issued, 0);
        const nearlyFull = open.filter((e) => e.cap && e.issued / e.cap > 0.9).length;
        return (
          <Kpis>
            <Kpi label="Open for booking" value={open.length} icon="cal" detail="visible in the app" />
            <Kpi label="Passes issued" value={num(issued)} icon="ticket" />
            <Kpi label="Nearly full" value={nearlyFull} icon="alert" tone={nearlyFull ? 'warn' : undefined}
              detail="over 90 per cent booked" />
            <Kpi label="Events in all" value={rows.length} icon="layers" />
          </Kpis>
        );
      }}
      filters={(rows, set) => (
        <select
          className="sel"
          aria-label="Filter by status"
          onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.status === v : () => true);
          }}
        >
          <option value="">Every status</option>
          {Array.from(new Set(rows.map((r) => r.status))).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      columns={[
        {
          key: 'name', label: 'Event',
          cell: (e) => (
            <>
              <b style={{ fontWeight: 600 }}>{e.name}</b>
              <span className="sub">{e.type} · {e.loc}{e.family ? ' · family passes' : ''}</span>
            </>
          ),
        },
        {
          key: 'start', label: 'When', width: 180,
          cell: (e) => <>{fwd(e.start)}<span className="sub">{until(e.start)}</span></>,
        },
        {
          key: 'issued', label: 'Booked', num: true, width: 150,
          cell: (e) => (
            e.cap
              ? (
                <>
                  <span className="tnum">{num(e.issued)} of {num(e.cap)}</span>
                  <Bar value={e.issued} max={e.cap} tone={e.issued / e.cap > 0.9 ? 'warn' : undefined} />
                </>
              )
              : <span className="muted">no limit</span>
          ),
          sortBy: (e) => (e.cap ? e.issued / e.cap : 0),
        },
        { key: 'status', label: 'Status', cell: (e) => <Status>{e.status}</Status> },
      ]}
      drawerWidth="wide"
      drawerTitle={(e) => e.name}
      drawerSub={(e) => <><span className="mono">{e.id}</span> · {fdt(e.start)}</>}
      detail={(e) => (
        <>
          <div className="row wrap gap6 mb12">
            <Status>{e.status}</Status>
            <Chip icon="pin">{e.loc}</Chip>
            <Chip icon="layers">{e.type}</Chip>
            {e.family && <Chip tone="brand" icon="users">Family passes</Chip>}
            {e.langs?.map((l) => <Chip key={l} tone="plain">{l}</Chip>)}
          </div>

          <Kv rows={[
            ['Starts', fdt(e.start)],
            ['Ends', fdt(e.end)],
            ['Hall', e.hall],
            ['Sessions', `${e.sessions}`],
            ['Capacity', e.cap ? num(e.cap) : 'No limit'],
            ['Passes issued', <>{num(e.issued)}{e.cap ? <span className="muted"> · {pct(e.issued, e.cap)}% booked</span> : null}</>],
            ['Attended', e.attended ? num(e.attended) : <span className="muted">not yet</span>],
          ]} />

          {can('events.manage') && (
            <>
              <hr className="div" />
              <div className="sect-title">In the app</div>
              {e.status === 'Published' ? (
                <>
                  <Note tone="ok" icon="mobile">
                    Members can see this and book seats right now.
                  </Note>
                  <div className="mt12">
                    <Btn icon="eye-off" disabled={busy === e.id} onClick={() => setStatus(e, 'Draft')}>
                      Take it out of the app
                    </Btn>
                  </div>
                </>
              ) : (
                <>
                  <Note tone="mute" icon="eye-off">
                    Not visible in the app. Publishing opens it for booking
                    straight away.
                  </Note>
                  <div className="mt12">
                    <Btn variant="ok" icon="upload" disabled={busy === e.id} onClick={() => setStatus(e, 'Published')}>
                      Publish and open booking
                    </Btn>
                  </div>
                </>
              )}
            </>
          )}

          <hr className="div" />
          <p className="small muted">
            <Icon name="info" /> Seat maps, checklists and event expenses are in
            the tabs beside this one.
          </p>
        </>
      )}
      footNote="Soonest first"
    />
  );
}
