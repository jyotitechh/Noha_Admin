/* Where the ministry stands this morning, and what is waiting for you.

   The cards a role sees follow its permissions: a content editor is not shown
   giving totals. The server decides which cards to send, so this screen does
   not have to know the permission rules twice. */

import { Link } from 'react-router-dom';
import { useQuery } from '@/lib/useQuery';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useQueues } from '@/state/queues';
import { Card, Kpi, Kpis, Icon, Failed, Loading, Age, Who, Empty, Note } from '@/components/ui';
import { inrS, num, since, flong, pct } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';

interface DashCard { id: string; label: string; value: number; icon: string; to: string; sub?: string; money?: boolean; tone?: 'warn' | 'bad' }
interface Dash {
  asOf: Date;
  cards: DashCard[];
  givingByMonth: { month: string; total: number; count: number }[];
  membersByLocation: { loc: string; n: number }[];
  registrationMix: { state: string; n: number }[];
  recentAudit: AuditEntry[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const { queues, total } = useQueues();
  const q = useQuery(() => api.get<Dash>('/dashboard'), []);

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;
  if (!q.data) return <div className="card"><Loading what="the dashboard" /></div>;

  const d = q.data;
  const mine = queues.filter((x) => x.count > 0).sort((a, b) => {
    /* Late first, then by how many are waiting. */
    const late = (x: typeof a) => (x.sla && x.oldest && (Date.now() - +x.oldest) / 36e5 > x.sla ? 1 : 0);
    return late(b) - late(a) || b.count - a.count;
  });
  const peak = Math.max(1, ...d.givingByMonth.map((m) => m.total));
  const mostMembers = Math.max(1, ...d.membersByLocation.map((m) => m.n));

  return (
    <div className="stack">
      <Note tone="mute" icon="info">
        Good morning, {user?.name.split(' ')[0]}. It is {flong(d.asOf)}.
        {total > 0
          ? <> You have <b>{total}</b> {total === 1 ? 'item' : 'items'} waiting across {mine.length} {mine.length === 1 ? 'queue' : 'queues'}.</>
          : <> Nothing is waiting for you.</>}
      </Note>

      <Kpis>
        {d.cards.map((c) => (
          <Kpi
            key={c.id}
            label={c.label}
            value={c.money ? inrS(c.value) : num(c.value)}
            icon={c.icon}
            to={c.to}
            detail={c.sub}
            tone={c.tone}
          />
        ))}
      </Kpis>

      <div className="g-main">
        {/* ---------- what is waiting ---------- */}
        <Card
          title="Waiting for a decision"
          sub={total ? `${total} items, the late ones first` : 'Nothing is waiting'}
          actions={<Link to="/queues" className="btn sm">All queues</Link>}
          flush
        >
          {mine.length ? (
            <ul className="list">
              {mine.slice(0, 8).map((x) => {
                const late = x.sla && x.oldest && (Date.now() - +x.oldest) / 36e5 > x.sla;
                return (
                  <li key={x.id} className="click">
                    <Link to={x.to} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textDecoration: 'none', color: 'inherit' }}>
                      <span className={'qi ' + (late ? 'bad' : 'warn')}><Icon name={x.icon} /></span>
                      <span className="grow">
                        <span className="t1" style={{ display: 'block' }}>{x.l}</span>
                        <span className="t2">
                          {x.area} · {x.owner}
                          {x.sla ? <> · should be done within {x.sla} h</> : null}
                        </span>
                      </span>
                      <span className="right">
                        <b className="tnum" style={{ display: 'block', fontSize: 16 }}>{x.count}</b>
                        <Age at={x.oldest} warn={x.sla} bad={x.sla * 2} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon="check" title="Everything is decided">
              Nothing in your areas is waiting.
            </Empty>
          )}
        </Card>

        <div className="stack">
          {/* ---------- registrations from the app ---------- */}
          {d.registrationMix.some((r) => r.n > 0) && (
            <Card title="Registrations from the app" sub="Since the app went out">
              <div className="stackbar" role="img" aria-label={d.registrationMix.map((r) => `${r.state} ${r.n}`).join(', ')}>
                {d.registrationMix.map((r, i) => (
                  <i key={r.state} style={{
                    width: pct(r.n, d.registrationMix.reduce((n, x) => n + x.n, 0)) + '%',
                    background: ['#D98A00', '#1E9E86', '#BE2F27'][i],
                  }} />
                ))}
              </div>
              <div className="legend mt8">
                {d.registrationMix.map((r, i) => (
                  <span key={r.state}>
                    <i style={{ background: ['#D98A00', '#1E9E86', '#BE2F27'][i] }} />
                    {{ pending: 'Waiting', approved: 'Approved', videoReturned: 'Video returned' }[r.state]} <b>{r.n}</b>
                  </span>
                ))}
              </div>
              <div className="mt16">
                <Link to="/members/registrations" className="btn pri sm">Open the queue</Link>
              </div>
            </Card>
          )}

          {/* ---------- members by congregation ---------- */}
          <Card title="Members by congregation" sub="Active members only" flush>
            <ul className="list">
              {d.membersByLocation.slice(0, 6).map((m) => (
                <li key={m.loc}>
                  <span className="grow">
                    <span className="t1">{m.loc}</span>
                  </span>
                  <div className="bar" style={{ width: 90 }}>
                    <i style={{ width: (m.n / mostMembers) * 100 + '%' }} />
                  </div>
                  <b className="tnum" style={{ minWidth: 34, textAlign: 'right' }}>{m.n}</b>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="g2">
        {/* ---------- giving ---------- */}
        {d.givingByMonth.some((m) => m.total > 0) && (
          <Card title="Giving, last six months" sub="Receipted gifts only">
            <div className="vbars">
              {d.givingByMonth.map((m) => (
                <div key={m.month}>
                  <div className="val">{inrS(m.total)}</div>
                  <div className="fill" style={{ height: Math.max(3, (m.total / peak) * 96) }} title={`${m.month}: ${inrS(m.total)} from ${m.count} receipts`} />
                  <div className="lab">{m.month}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ---------- audit ---------- */}
        <Card
          title="Latest changes"
          sub="Everything done in this console is recorded"
          actions={<Link to="/audit" className="btn sm">Audit log</Link>}
          flush
        >
          <ul className="list">
            {d.recentAudit.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Who name={a.actor} sub={<>{a.action} · <span className="mono">{a.rec}</span></>} size="sm" />
                <span className="muted small nowrap">{since(a.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
