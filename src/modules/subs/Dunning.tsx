/* Subscriptions whose payment did not go through.

   Grace means they still have access while the charge is retried. Past due
   means the grace period has run out. The order of this list is the order to
   work it: the ones about to lose access first. */

import { ListScreen } from '@/components/ListScreen';
import { Chip, Kpi, Kpis, Kv, Note, Status, Who } from '@/components/ui';
import { fd, inr, inrS, until } from '@/lib/format';

interface Sub {
  id: string; pid: string; name: string; plan: string; amt: number;
  status: string; mandate: string; mstatus: string; ref: string;
  started: Date; next: Date | null; fails: number; grace: Date | null; notices: number;
}

export default function Dunning() {
  return (
    <ListScreen<Sub>
      name="SUBS"
      what="the dunning queue"
      filter={(s) => s.status === 'Grace' || s.status === 'Past due'}
      sort={{ key: 'next', dir: 'asc' }}
      searchPlaceholder="Member or payment reference"
      searchIn={(s) => `${s.name} ${s.pid} ${s.ref} ${s.plan} ${s.mandate}`}
      emptyIcon="check"
      emptyTitle="Nothing to chase"
      intro={
        <Note tone="warn" icon="repeat">
          <b>Grace</b> means they still have access while the charge is retried.
          <b> Past due</b> means the grace period has run out. A failed mandate
          usually needs the member to re-authorise it in the app, not another
          retry.
        </Note>
      }
      kpis={(rows) => {
        const grace = rows.filter((s) => s.status === 'Grace');
        const pastDue = rows.filter((s) => s.status === 'Past due');
        const atRisk = rows.reduce((n, s) => n + s.amt, 0);
        const brokenMandate = rows.filter((s) => s.mstatus !== 'Active').length;
        return (
          <Kpis>
            <Kpi label="In grace" value={grace.length} icon="clock" detail="still have access" />
            <Kpi label="Past due" value={pastDue.length} icon="alert" tone={pastDue.length ? 'bad' : undefined}
              detail="access has stopped" />
            <Kpi label="At risk" value={inrS(atRisk)} icon="rupee" detail="if none of these recover" />
            <Kpi label="Mandate broken" value={brokenMandate} icon="ban"
              tone={brokenMandate ? 'warn' : undefined} detail="retrying will not help" />
          </Kpis>
        );
      }}
      columns={[
        { key: 'name', label: 'Member', cell: (s) => <Who name={s.name} sub={<span className="mono">{s.pid}</span>} size="sm" /> },
        { key: 'plan', label: 'Plan' },
        { key: 'amt', label: 'Amount', num: true, cell: (s) => <b className="tnum">{inr(s.amt)}</b> },
        {
          key: 'mandate', label: 'Paid by',
          cell: (s) => (
            <>
              {s.mandate}
              <span className="sub" style={s.mstatus !== 'Active' ? { color: 'var(--bad)' } : undefined}>{s.mstatus}</span>
            </>
          ),
        },
        { key: 'fails', label: 'Failed', num: true, cell: (s) => <b className="tnum" style={{ color: 'var(--bad)' }}>{s.fails}</b> },
        {
          key: 'grace', label: 'Grace ends', num: true,
          cell: (s) => (s.grace ? <>{fd(s.grace)}<span className="sub">{until(s.grace)}</span></> : <span className="muted">ended</span>),
          sortBy: (s) => s.grace ?? new Date(0),
        },
        { key: 'status', label: 'Status', cell: (s) => <Status>{s.status}</Status> },
      ]}
      drawerTitle={(s) => s.name}
      drawerSub={(s) => <><span className="mono">{s.id}</span> · {s.plan}</>}
      detail={(s) => (
        <>
          <div className="row wrap gap6 mb12">
            <Status>{s.status}</Status>
            <Chip tone={s.mstatus === 'Active' ? 'plain' : 'bad'}>{s.mandate} · {s.mstatus}</Chip>
            <Chip tone="bad">{s.fails} failed {s.fails === 1 ? 'charge' : 'charges'}</Chip>
          </div>

          {s.mstatus !== 'Active' ? (
            <Note tone="bad" icon="ban">
              <b>The mandate itself has failed.</b> Retrying the charge will not
              work. The member has to re-authorise payment in the app — a call
              from the Jodie desk is the usual next step.
            </Note>
          ) : (
            <Note tone="warn" icon="repeat">
              The mandate is still good, so the charge can be retried. It is
              usually a balance problem rather than a cancelled mandate.
            </Note>
          )}

          <div className="mt16">
            <Kv rows={[
              ['Plan', s.plan],
              ['Amount', <b key="a">{inr(s.amt)}</b>],
              ['Started', fd(s.started)],
              ['Was due', s.next ? fd(s.next) : '—'],
              ['Grace ends', s.grace ? <>{fd(s.grace)} <span className="muted">· {until(s.grace)}</span></> : 'Already ended'],
              ['Failed charges', `${s.fails}`],
              ['Notices sent', `${s.notices}`],
              ['Gateway reference', <span key="r" className="mono">{s.ref}</span>],
            ]} />
          </div>

          <Note tone="mute" icon="info">
            Retrying a charge, extending the grace period and cancelling are in
            the Mandates tab, which is not built yet.
          </Note>
        </>
      )}
      footNote="Closest to losing access first"
    />
  );
}
