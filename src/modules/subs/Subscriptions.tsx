/* Who is subscribed to Jodie, on what, and until when. */

import { ListScreen } from '@/components/ListScreen';
import { Chip, Kpi, Kpis, Kv, Note, Status, Who } from '@/components/ui';
import { fd, inr, inrS, num, until } from '@/lib/format';

interface Sub {
  id: string; pid: string; name: string; plan: string; amt: number;
  status: string; mandate: string; mstatus: string; ref: string;
  started: Date; next: Date | null; ends: Date | null; fails: number;
  grace: Date | null; notices: number; addon: string;
}

export default function Subscriptions() {
  return (
    <ListScreen<Sub>
      name="SUBS"
      what="subscriptions"
      sort={{ key: 'started', dir: 'desc' }}
      searchPlaceholder="Member, profile number or payment reference"
      searchIn={(s) => `${s.name} ${s.pid} ${s.id} ${s.ref} ${s.plan}`}
      intro={
        <Note tone="mute" icon="repeat">
          Jodie membership is ₹300, paid once. Premium plans renew. Access is
          granted by the server after the gateway confirms the payment, never
          by the app.
        </Note>
      }
      kpis={(rows) => {
        const active = rows.filter((s) => s.status === 'Active');
        const trouble = rows.filter((s) => s.status === 'Grace' || s.status === 'Past due');
        const monthly = active.reduce((n, s) => n + s.amt, 0);
        return (
          <Kpis>
            <Kpi label="Active" value={num(active.length)} icon="check" detail="paying members" />
            <Kpi label="Current value" value={inrS(monthly)} icon="rupee" detail="across active subscriptions" />
            <Kpi label="In grace or past due" value={trouble.length} icon="alert"
              tone={trouble.length ? 'warn' : undefined} detail="the dunning queue" />
            <Kpi label="Expired" value={rows.filter((s) => s.status === 'Expired').length} icon="clock" />
          </Kpis>
        );
      }}
      filters={(rows, set) => (
        <>
          <select className="sel" aria-label="Filter by status" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.status === v : () => true);
          }}>
            <option value="">Every status</option>
            {Array.from(new Set(rows.map((r) => r.status))).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="sel" aria-label="Filter by payment method" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.mandate === v : () => true);
          }}>
            <option value="">Every method</option>
            {Array.from(new Set(rows.map((r) => r.mandate))).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </>
      )}
      columns={[
        { key: 'name', label: 'Member', cell: (s) => <Who name={s.name} sub={<span className="mono">{s.pid}</span>} size="sm" /> },
        { key: 'plan', label: 'Plan', cell: (s) => <>{s.plan}<span className="sub">{s.addon || '—'}</span></> },
        { key: 'amt', label: 'Amount', num: true, cell: (s) => <b className="tnum">{inr(s.amt)}</b> },
        { key: 'mandate', label: 'Paid by', cell: (s) => <Chip tone="plain">{s.mandate}</Chip> },
        {
          key: 'next', label: 'Renews', num: true,
          cell: (s) => (s.next ? <>{fd(s.next)}<span className="sub">{until(s.next)}</span></> : <span className="muted">—</span>),
          sortBy: (s) => s.next ?? new Date(0),
        },
        {
          key: 'status', label: 'Status',
          cell: (s) => (
            <span className="acts-inline">
              <Status>{s.status}</Status>
              {s.fails > 0 && <Chip tone="bad">{s.fails} failed</Chip>}
            </span>
          ),
        },
      ]}
      drawerTitle={(s) => s.name}
      drawerSub={(s) => <><span className="mono">{s.id}</span> · {s.plan}</>}
      detail={(s) => (
        <>
          <div className="row wrap gap6 mb12">
            <Status>{s.status}</Status>
            <Chip tone="plain">{s.mandate}</Chip>
            <Status>{s.mstatus}</Status>
            {s.addon && <Chip tone="brand">{s.addon}</Chip>}
          </div>

          <Kv rows={[
            ['Plan', s.plan],
            ['Amount', <b key="a">{inr(s.amt)}</b>],
            ['Started', fd(s.started)],
            ['Renews', s.next ? <>{fd(s.next)} <span className="muted">· {until(s.next)}</span></> : 'Does not renew'],
            ['Ends', s.ends ? fd(s.ends) : <span className="muted">—</span>],
            ['Paid by', `${s.mandate} (${s.mstatus})`],
            ['Gateway reference', <span key="r" className="mono">{s.ref}</span>],
            ['Failed charges', s.fails ? `${s.fails}` : 'None'],
            ['Notices sent', `${s.notices}`],
          ]} />

          {(s.status === 'Grace' || s.status === 'Past due') && (
            <Note tone="warn" icon="alert">
              This is in the dunning queue. {s.grace && <>Grace ends {fd(s.grace)}.</>}{' '}
              {s.notices > 0 && <>{s.notices} {s.notices === 1 ? 'notice has' : 'notices have'} been sent.</>}
            </Note>
          )}
        </>
      )}
    />
  );
}
