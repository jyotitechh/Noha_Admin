/* Who has been let into the app, and what was decided about them.

   The queue screen is about work still to do. This one is the record: every
   registration the office has decided, newest first, with who decided it,
   when, and what they were told.

   It answers the questions that actually get asked — "did we approve her?",
   "when did he get in?", "who let this through?" — without digging through
   the audit log. */

import { useMemo, useState } from 'react';
import { collection } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { Table, type Column } from '@/components/Table';
import { Drawer } from '@/components/layers';
import { Chip, Empty, Failed, Kpi, Kpis, Kv, Loading, Note, Seg, Who } from '@/components/ui';
import { fd, fdt, since } from '@/lib/format';
import type { Registration } from '@/lib/types';

type Row = Registration & { rawStatus?: string; memberRowId?: string };
type Show = 'approved' | 'returned' | 'all';

export default function Approved() {
  const [show, setShow] = useState<Show>('approved');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Row | null>(null);

  const q = useQuery(() => collection<Row>('REGISTRATIONS', { limit: 500 }), []);
  const all = q.data?.rows ?? [];

  /* Decided means the office has acted on it, either way. */
  const decided = useMemo(
    () => all.filter((r) => r.state === 'approved' || r.state === 'videoReturned'),
    [all],
  );

  const rows = useMemo(() => {
    let r = decided;
    if (show === 'approved') r = r.filter((x) => x.state === 'approved');
    if (show === 'returned') r = r.filter((x) => x.state === 'videoReturned');
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter((x) =>
        [x.fullName, x.mobile, x.city, x.email, x.decidedBy, x.id].some((v) =>
          String(v ?? '').toLowerCase().includes(s)));
    }
    /* Most recently decided first — that is what people are looking for. */
    return r.slice().sort((a, b) => +(b.decidedAt ?? b.at) - +(a.decidedAt ?? a.at));
  }, [decided, show, search]);

  const stats = useMemo(() => {
    const approved = decided.filter((r) => r.state === 'approved');
    const deciders = new Set(approved.map((r) => r.decidedBy).filter(Boolean));
    const week = Date.now() - 7 * 864e5;
    return {
      approved: approved.length,
      returned: decided.filter((r) => r.state === 'videoReturned').length,
      thisWeek: approved.filter((r) => r.decidedAt && +r.decidedAt > week).length,
      deciders: deciders.size,
      latest: approved[0]?.decidedAt ?? null,
    };
  }, [decided]);

  const columns: Column<Row>[] = [
    {
      key: 'fullName', label: 'Member',
      cell: (r) => <Who name={r.fullName} sub={<span className="mono">{r.mobile}</span>} />,
    },
    { key: 'city', label: 'From', cell: (r) => <>{r.city || '—'}<span className="sub">{r.country}</span></> },
    {
      key: 'state', label: 'Decision',
      cell: (r) => (r.state === 'approved'
        ? <Chip tone="ok" icon="user-check">Approved</Chip>
        : <Chip tone="bad" icon="video">Video returned</Chip>),
    },
    {
      key: 'decidedBy', label: 'By',
      cell: (r) => (r.decidedBy ? <span>{r.decidedBy}</span> : <span className="muted">not recorded</span>),
    },
    {
      key: 'decidedAt', label: 'When', num: true,
      cell: (r) => (r.decidedAt
        ? <>{fd(r.decidedAt)}<span className="sub">{since(r.decidedAt)}</span></>
        : <span className="muted">—</span>),
      sortBy: (r) => r.decidedAt ?? new Date(0),
    },
    {
      key: 'wait', label: 'Waited', num: true,
      cell: (r) => (r.at && r.decidedAt
        ? <span className="muted">{Math.max(1, Math.round((+r.decidedAt - +r.at) / 36e5))} h</span>
        : <span className="muted">—</span>),
      sortBy: (r) => (r.at && r.decidedAt ? +r.decidedAt - +r.at : 0),
    },
  ];

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;

  return (
    <div className="stack">
      <Note tone="ok" icon="user-check">
        Everyone here has been decided. <b>Approved</b> means the Noah app
        opens for them; <b>video returned</b> means they were asked to record
        step six again and the app stays shut until they do.
      </Note>

      <Kpis>
        <Kpi label="Approved" value={stats.approved} icon="user-check"
          detail={stats.latest ? <>latest {since(stats.latest)}</> : 'none yet'} />
        <Kpi label="Approved this week" value={stats.thisWeek} icon="trend" />
        <Kpi label="Videos returned" value={stats.returned} icon="video"
          tone={stats.returned ? 'warn' : undefined} detail="asked to record again" />
        <Kpi label="Decided by" value={stats.deciders || '—'} icon="users"
          detail={stats.deciders === 1 ? 'one person' : 'people'} />
      </Kpis>

      {q.loading && !q.data ? (
        <div className="card"><Loading what="the history" /></div>
      ) : (
        <Table
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Name, number, city or who decided"
          onRowClick={setOpen}
          pageSize={25}
          toolbar={
            <Seg
              value={show}
              onChange={setShow}
              options={[
                { id: 'approved', label: 'Approved', count: stats.approved },
                { id: 'returned', label: 'Video returned', count: stats.returned },
                { id: 'all', label: 'Everything decided', count: decided.length },
              ]}
            />
          }
          empty={
            <Empty icon="user-check" title="Nothing decided yet">
              Approvals and returns appear here as the office works the queue.
            </Empty>
          }
          footNote="Most recently decided first"
        />
      )}

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        width="wide"
        title={open?.fullName ?? ''}
        sub={open ? <><span className="mono">{open.id}</span> · {open.mobile}</> : ''}
      >
        {open && (
          <>
            <div className="row wrap gap6 mb12">
              {open.state === 'approved'
                ? <Chip tone="ok" icon="user-check">Approved — the app is open to them</Chip>
                : <Chip tone="bad" icon="video">Video returned — the app stays shut</Chip>}
              {open.rawStatus && <Chip tone="plain">Catalyst status: {open.rawStatus}</Chip>}
            </div>

            <div className="sect-title">What happened</div>
            <ul className="tl">
              <li>
                <i />
                <b>Submitted</b>
                <span className="muted"> · {open.at ? fdt(open.at) : 'not recorded'}</span>
              </li>
              {open.decidedAt && (
                <li>
                  <i />
                  <b>{open.state === 'approved' ? 'Approved' : 'Video returned'}</b>
                  <span className="muted">
                    {' '}· {fdt(open.decidedAt)}
                    {open.decidedBy ? ` by ${open.decidedBy}` : ''}
                    {open.at ? ` · after ${Math.max(1, Math.round((+open.decidedAt - +open.at) / 36e5))} hours` : ''}
                  </span>
                </li>
              )}
            </ul>

            {open.remark && (
              <>
                <div className="sect-title">What the member was told</div>
                <div className="card pad"><p style={{ margin: 0 }}>“{open.remark}”</p></div>
              </>
            )}

            <hr className="div" />
            <div className="sect-title">Their details</div>
            <Kv rows={[
              ['Name', open.fullName],
              ['Mobile', <span key="m" className="mono">{open.mobile}</span>],
              ['Email', open.email || '—'],
              ['Address', [open.line1, open.line2, open.city, open.region, open.pin].filter(Boolean).join(', ') || '—'],
              ['ID proof', open.idType ? `${open.idType} ${open.idNumber}` : '—'],
              ['Declaration', open.agreed ? `accepted in ${open.declarationLang}, signed "${open.signature}"` : 'not accepted'],
              ['Video', open.videoSecs ? `${open.videoSecs} seconds` : 'none'],
              ['Member record', open.memberId ? <span key="x" className="mono">{open.memberId}</span> : '—'],
            ]} />
          </>
        )}
      </Drawer>
    </div>
  );
}
