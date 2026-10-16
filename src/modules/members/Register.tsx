/* The member register: everyone on the roll.

   Contact details sit behind their own permission and are fetched only when
   asked for, because every reveal is written to the audit log. The register
   itself shows a masked number so the column is still useful. */

import { useMemo, useState } from 'react';
import { api, collection } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { useToast, Drawer } from '@/components/layers';
import { Table, type Column } from '@/components/Table';
import { Btn, Chip, Icon, Kpi, Kpis, Kv, Note, Status, Who, Failed, Loading, Empty } from '@/components/ui';
import { fd, num, since } from '@/lib/format';
import type { Member } from '@/lib/types';

/** Enough of a number to recognise, not enough to use. */
const mask = (m: string) => m.replace(/(\+\d{2}\s\d{2})\d{3}\s?\d{2}/, '$1••• ••');

export default function Register() {
  const [search, setSearch] = useState('');
  const [loc, setLoc] = useState('');
  const [status, setStatus] = useState('Active');
  const [open, setOpen] = useState<Member | null>(null);
  const [contact, setContact] = useState<{ mobile: string; email: string; address: string } | null>(null);

  const { can, user } = useAuth();
  const { toast } = useToast();

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

  /* Revealing contact details is itself an action, and it is logged. */
  async function reveal(m: Member) {
    try {
      const c = await api.get<{ mobile: string; email: string; address: string }>(`/members/${m.id}/contact`);
      setContact(c);
      toast('Contact details revealed. This is in the audit log.', 'warn');
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  }

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
          onRowClick={(m) => { setOpen(m); setContact(null); }}
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
        onClose={() => { setOpen(null); setContact(null); }}
        width="wide"
        title={open?.name ?? ''}
        sub={open ? <><span className="mono">{open.id}</span> · {open.loc} · member since {fd(open.joined)}</> : ''}
      >
        {open && (
          <div className="dw-cols">
            <div>
              <div className="sect-title">Who they are</div>
              <Kv rows={[
                ['Name', open.name],
                ['Age', `${open.age}`],
                ['Gender', open.g === 'M' ? 'Male' : 'Female'],
                ['Status', <Status key="s">{open.status}</Status>],
                ['Language', open.lang],
                ['Partner', open.partner ? 'Yes' : 'No'],
              ]} />

              <div className="sect-title">Where they belong</div>
              <Kv rows={[
                ['Congregation', open.loc],
                ['Cell', open.cell ?? <span className="muted">Not in a cell</span>],
                ['Address', open.address],
              ]} />
            </div>

            <div>
              <div className="sect-title">Contact details</div>
              {contact ? (
                <>
                  <Kv rows={[
                    ['Mobile', <span key="m" className="mono">{contact.mobile}</span>],
                    ['Email', contact.email],
                  ]} />
                  <Note tone="warn" icon="history">
                    This reveal is in the audit log against your name.
                  </Note>
                </>
              ) : (
                <>
                  <Kv rows={[
                    ['Mobile', <span key="m" className="mono muted">{mask(open.mobile)}</span>],
                    ['Email', <span key="e" className="muted">hidden</span>],
                  ]} />
                  {can('members.pii') ? (
                    <Btn icon="eye" onClick={() => reveal(open)}>Reveal contact details</Btn>
                  ) : (
                    <Note tone="mute" icon="lock">
                      Your role ({user?.roleName}) cannot reveal contact details.
                    </Note>
                  )}
                </>
              )}

              <div className="sect-title">In the app</div>
              <Kv rows={[
                ['Last opened the app', open.lastActive ? since(open.lastActive) : <span className="muted">Never</span>],
                ['Profile photo', <Status key="p">{open.photo}</Status>],
                ['Zoho CRM', <Status key="c">{open.crm}</Status>],
                ...(open.fromRegistration
                  ? [['Registered through', <span key="r" className="applink"><Icon name="mobile" />the Noah app · {open.fromRegistration}</span>] as [string, React.ReactNode]]
                  : []),
              ]} />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
