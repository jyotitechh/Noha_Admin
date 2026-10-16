/* Everything waiting for a decision, in one list.

   The point of this screen is that nobody has to remember which area a job
   lives in. It shows only the queues the signed-in role may work, with the
   late ones first. */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueues } from '@/state/queues';
import { Table, type Column } from '@/components/Table';
import { Kpi, Kpis, Icon, Age, Chip, Empty, Btn, Seg } from '@/components/ui';
import { ageH } from '@/lib/format';
import type { Queue } from '@/lib/api';

const isLate = (q: Queue) => !!(q.count && q.sla && q.oldest && ageH(q.oldest) > q.sla);

export default function Queues() {
  const { queues, total, refresh } = useQueues();
  const [show, setShow] = useState<'waiting' | 'late' | 'all'>('waiting');
  const [search, setSearch] = useState('');

  const late = useMemo(() => queues.filter(isLate), [queues]);

  const rows = useMemo(() => {
    let r = queues;
    if (show === 'waiting') r = r.filter((q) => q.count > 0);
    if (show === 'late') r = late;
    if (search.trim()) {
      const n = search.toLowerCase();
      r = r.filter((q) => (q.l + ' ' + q.area + ' ' + q.owner).toLowerCase().includes(n));
    }
    return r.slice().sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || b.count - a.count);
  }, [queues, show, search, late]);

  const areas = useMemo(() => {
    const by = new Map<string, number>();
    for (const q of queues) by.set(q.area, (by.get(q.area) ?? 0) + q.count);
    return Array.from(by.entries()).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  }, [queues]);

  const columns: Column<Queue>[] = [
    {
      key: 'l', label: 'Queue',
      cell: (q) => (
        <Link to={q.to} style={{ display: 'flex', gap: 11, alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
          <span className={'qi ' + (isLate(q) ? 'bad' : q.count ? 'warn' : 'mute')}><Icon name={q.icon} /></span>
          <span className="grow">
            <b style={{ display: 'block', fontWeight: 600 }}>{q.l}</b>
            <span className="sub">{q.area}</span>
          </span>
        </Link>
      ),
    },
    { key: 'owner', label: 'Who works it', cell: (q) => <span className="muted">{q.owner}</span> },
    { key: 'count', label: 'Waiting', num: true, cell: (q) => <b className="tnum">{q.count || '—'}</b> },
    {
      key: 'oldest', label: 'Oldest', num: true,
      cell: (q) => (q.oldest ? <Age at={q.oldest} warn={q.sla} bad={q.sla * 2} /> : <span className="muted">—</span>),
      sortBy: (q) => q.oldest ?? new Date(0),
    },
    {
      key: 'sla', label: 'Target', num: true,
      cell: (q) => (q.sla ? <span className="muted">{q.sla} h</span> : <span className="muted">—</span>),
    },
    {
      key: 'act', label: '', sortable: false,
      cell: (q) => <Link to={q.to} className="btn sm">Open</Link>,
    },
  ];

  return (
    <div className="stack">
      <Kpis>
        <Kpi label="Waiting in total" value={total} icon="inbox" />
        <Kpi label="Past their target" value={late.length} icon="alert" tone={late.length ? 'bad' : undefined}
          detail={late.length ? 'these first' : 'nothing is late'} />
        <Kpi label="Queues you work" value={queues.length} icon="layers"
          detail="by what your role allows" />
        <Kpi label="Busiest area" value={areas[0]?.[0] ?? '—'} icon="trend"
          detail={areas[0] ? `${areas[0][1]} waiting` : undefined} />
      </Kpis>

      <Table
        rows={rows}
        columns={columns}
        rowKey={(q) => q.id}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Queue, area or owner"
        pageSize={0}
        toolbar={
          <>
            <Seg
              value={show}
              onChange={setShow}
              options={[
                { id: 'waiting', label: 'Waiting', count: queues.filter((q) => q.count > 0).length },
                { id: 'late', label: 'Late', count: late.length },
                { id: 'all', label: 'Every queue', count: queues.length },
              ]}
            />
            <span className="sp" style={{ flex: 1 }} />
            <Btn icon="refresh" sm onClick={refresh}>Refresh</Btn>
          </>
        }
        empty={
          <Empty icon="check" title={show === 'late' ? 'Nothing is late' : 'Nothing is waiting'}>
            {show === 'late'
              ? 'Every queue is inside its target.'
              : 'Everything in your areas has been decided.'}
          </Empty>
        }
        footNote={
          <>
            A queue is late once its oldest item passes the target.
            {' '}<Chip tone="bad">Late</Chip> <Chip tone="warn">Waiting</Chip>
          </>
        }
      />
    </div>
  );
}
