/* Every pass a member has booked in the app.

   This is what the app's "My passes" carousel shows them: the seat, the gate
   and the booking code they hold up at the door. */

import { ListScreen } from '@/components/ListScreen';
import { Chip, Kpi, Kpis, Kv, Note, Status, Who } from '@/components/ui';
import { fdt, num } from '@/lib/format';

interface Pass {
  id: string; code: string; member: string; name: string; event: string;
  type: string; count: number; seat: string; status: string; at: Date;
}

export default function Passes() {
  return (
    <ListScreen<Pass>
      name="PASSES"
      what="passes"
      sort={{ key: 'at', dir: 'desc' }}
      searchPlaceholder="Member, booking code or event"
      searchIn={(p) => `${p.name} ${p.code} ${p.event} ${p.seat} ${p.member}`}
      intro={
        <Note tone="mute" icon="ticket">
          A member sees these in the app’s <b>My passes</b> carousel, newest
          first. The booking code is what gets scanned at the gate.
        </Note>
      }
      kpis={(rows) => {
        const seats = rows.reduce((n, p) => n + (p.count || 1), 0);
        const family = rows.filter((p) => p.type === 'Family').length;
        return (
          <Kpis>
            <Kpi label="Passes issued" value={num(rows.length)} icon="ticket" />
            <Kpi label="Seats held" value={num(seats)} icon="seat" detail="across every pass" />
            <Kpi label="Family passes" value={num(family)} icon="users" detail="cover more than one seat" />
            <Kpi label="Events booked" value={new Set(rows.map((p) => p.event)).size} icon="cal" />
          </Kpis>
        );
      }}
      filters={(rows, set) => (
        <select
          className="sel"
          aria-label="Filter by event"
          onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.event === v : () => true);
          }}
        >
          <option value="">Every event</option>
          {Array.from(new Set(rows.map((r) => r.event))).sort().map((ev) => <option key={ev} value={ev}>{ev}</option>)}
        </select>
      )}
      columns={[
        { key: 'name', label: 'Member', cell: (p) => <Who name={p.name} sub={<span className="mono">{p.member}</span>} size="sm" /> },
        { key: 'event', label: 'Event', cell: (p) => <span className="mono">{p.event}</span> },
        {
          key: 'seat', label: 'Seat', width: 140,
          cell: (p) => (
            <>
              <b className="mono">{p.seat}</b>
              {p.count > 1 && <span className="sub">{p.count} seats</span>}
            </>
          ),
        },
        { key: 'type', label: 'Type', cell: (p) => <Chip tone={p.type === 'Family' ? 'brand' : 'plain'}>{p.type}</Chip> },
        { key: 'code', label: 'Booking code', cell: (p) => <span className="mono">{p.code}</span> },
        { key: 'status', label: 'Status', cell: (p) => <Status>{p.status}</Status> },
      ]}
      drawerTitle={(p) => `Pass ${p.code}`}
      drawerSub={(p) => <>{p.name} · booked {fdt(p.at)}</>}
      detail={(p) => (
        <>
          <div className="row wrap gap6 mb12">
            <Status>{p.status}</Status>
            <Chip tone={p.type === 'Family' ? 'brand' : 'plain'}>{p.type}</Chip>
          </div>

          <Kv rows={[
            ['Booking code', <b key="c" className="mono" style={{ fontSize: 16 }}>{p.code}</b>],
            ['Event', <span key="e" className="mono">{p.event}</span>],
            ['Seat', <b key="s" className="mono">{p.seat}</b>],
            ['Seats held', `${p.count}`],
            ['Booked on', fdt(p.at)],
          ]} />

          <hr className="div" />
          <div className="sect-title">Member</div>
          <Who name={p.name} sub={<span className="mono">{p.member}</span>} />
        </>
      )}
      footNote="Newest first, as the app shows them"
    />
  );
}
