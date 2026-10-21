/* The member register: everyone on the roll.

   Contact details sit behind their own permission and are fetched only when
   asked for, because every reveal is written to the audit log. The register
   itself shows a masked number so the column is still useful. */

import { useMemo, useState } from 'react';
import { collection } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { Drawer } from '@/components/layers';
import { PersonDetail } from '@/components/PersonDetail';
import { Table, type Column } from '@/components/Table';
import { Chip, Kpi, Kpis, Note, Status, Who, Failed, Loading, Empty } from '@/components/ui';
import { fd, num } from '@/lib/format';
import type { Member } from '@/lib/types';

/** Enough of a number to recognise, not enough to use. */
const mask = (m: string) => m.replace(/(\+\d{2}\s\d{2})\d{3}\s?\d{2}/, '$1••• ••');

export default function Register() {
  const [search, setSearch] = useState('');
  const [loc, setLoc] = useState('');
  const [status, setStatus] = useState('Active');
  const [open, setOpen] = useState<Member | null>(null);

  const { can } = useAuth();

  const q = useQuery(
    () => collection<Member>('MEMBERS', { q: search || undefined, loc: loc || undefined, status: status || undefined, limit: 500 }),
    [search, loc, status],
  );
  const all = useQuery(() => collection<Member>('MEMBERS', { limit: 500 }), []);

  const stats = useMemo(() => {
    const rows = all.data?.rows ?? [];
    return {
      total: rows.length,
      active: rows.filter((m) => m.status === 'Active').length,
      partners: rows.filter((m) => m.partner).length,
      fromApp: rows.filter((m) => m.fromRegistration).length,
      locations: Array.from(new Set(rows.map((m) => m.loc))).sort(),
    };
  }, [all.data]);


  const columns: Column<Member>[] = [
    { key: 'name', label: 'Member', cell: (m) => <Who name={m.name} sub={<span className="mono">{m.id}</span>} /> },
    { key: 'loc', label: 'Congregation', cell: (m) => <>{m.loc}<span className="sub">{m.cell ?? 'No cell'}</span></> },
    { key: 'age', label: 'Age', num: true, cell: (m) => <>{m.age}<span className="sub">{m.g === 'M' ? 'Male' : 'Female'}</span></> },
    { key: 'mobile', label: 'Mobile', cell: (m) => <span className="mono muted">{mask(m.mobile)}</span>, sortable: false },
    { key: 'joined', label: 'Member since', num: true, cell: (m) => <span className="muted">{fd(m.joined)}</span> },
    {
      key: 'status', label: 'Status',
      cell: (m) => (
        <span className="acts-inline">
          <Status>{m.status}</Status>
          {m.partner && <Chip tone="brand">Partner</Chip>}
          {m.fromRegistration && <Chip tone="info" icon="mobile">From the app</Chip>}
        </span>
      ),
    },
  ];

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;

  return (
    <div className="stack">
      <Kpis>
        <Kpi label="Active members" value={num(stats.active)} icon="users" detail={`${stats.total} on the roll in all`} />
        <Kpi label="Partners" value={num(stats.partners)} icon="heart" detail="covenant partnership" />
        <Kpi label="Joined through the app" value={num(stats.fromApp)} icon="mobile" detail="approved in this console" />
        <Kpi label="Congregations" value={stats.locations.length} icon="pin" />
      </Kpis>

      {!can('members.pii') && (
        <Note tone="mute" icon="lock">
          Mobile numbers and email addresses are masked for your role. A
          membership officer can reveal them, and every reveal is recorded.
        </Note>
      )}

      {q.loading && !q.data ? (
        <div className="card"><Loading what="the register" /></div>
      ) : (
        <Table
          rows={q.data?.rows ?? []}
          columns={columns}
          rowKey={(m) => m.id}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Name, member number, mobile or email"
          onRowClick={setOpen}
          pageSize={25}
          toolbar={
            <>
              <select className="sel" value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Filter by congregation">
                <option value="">Every congregation</option>
                {stats.locations.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <select className="sel" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                <option value="Active">Active</option>
                <option value="">Every status</option>
                <option value="Archived">Archived</option>
                <option value="Deceased">Deceased</option>
              </select>
            </>
          }
          empty={<Empty icon="users" title="No members match">Try a wider filter.</Empty>}
        />
      )}

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        width="wide"
        title={open?.name ?? ''}
        sub={open ? <><span className="mono">{open.id}</span> · {open.loc} · member since {fd(open.joined)}</> : ''}
      >
        {/* Everything about them, in one place: see components/PersonDetail. */}
        {open && <PersonDetail memberRowId={(open as Member & { rowId?: string }).rowId ?? open.id} />}
      </Drawer>
    </div>
  );
}
