/* Children under 18 that parents added in the Noah app (FOR-CONSOLE-CHILDREN.md).

   A parent adds a child (photo, name, date of birth, Aadhaar if they have it) and the child is in the family at once. At 15
   the Noah API tells both parents, once, to press Make member; the console asks it to every few hours, and Send notices
   now asks at once. The parents then give the child's own number and Aadhaar, the office approves that under Family
   requests, the child signs in and sends the consent and video, and the office approves that under App registrations.
   Opening a child shows the child's own record (ChildDetail); a parent's record, or the child's member record once they have
   one, opens from there. */

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { Drawer, useToast } from '@/components/layers';
import { PersonDetail } from '@/components/PersonDetail';
import { Table, type Column } from '@/components/Table';
import { Btn, Chip, Empty, Failed, Kpi, Kpis, Loading, Who } from '@/components/ui';
import { fd } from '@/lib/format';
import { AuthImage } from '@/components/AuthImage';
import { ChildDetail, CHILD_STATE as STATE } from './ChildDetail';

interface Child {
  kidId: string; name: string; gender: string | null; dob: string | null; age: number | null; kidPhoto?: boolean; aadhaar?: boolean;
  parents: { rowId: string; name: string; mobile: string }[];
  state: string; memberRowId: string | null; fifteen: boolean; noticeAt: Date | null; noticesRead: boolean;
}


const day = (d: string | null) => (d ? fd(new Date(d + 'T00:00:00')) : '');

export default function Children() {
  const { can } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [only15, setOnly15] = useState(false);
  const [sending, setSending] = useState(false);
  const [child, setChild] = useState<Child | null>(null);
  const [open, setOpen] = useState<{ rowId: string; name: string } | null>(null);
  const q = useQuery(() => api.get<{ rows: Child[] }>('/children'), []);

  const all = q.data?.rows ?? [];
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all
      .filter((c) => !only15 || c.fifteen)
      .filter((c) => !s || [c.name, ...c.parents.map((p) => p.name)].some((v) => v.toLowerCase().includes(s)));
  }, [all, search, only15]);
  const tally = {
    all: all.length,
    members: all.filter((c) => c.state === 'member').length,
    fifteen: all.filter((c) => c.fifteen && c.state !== 'member').length,
    told: all.filter((c) => c.fifteen && c.noticeAt).length,
  };

  async function sendNow() {
    setSending(true);
    try {
      const r = await api.post<{ checked: number; sent: number }>('/children/age-notices');
      toast(r.sent
        ? `${r.sent} ${r.sent === 1 ? 'family was' : 'families were'} told just now.`
        : r.checked ? 'Every family that is due has already been told.' : 'No child is 15 or more with an approved registration yet.');
      q.reload();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setSending(false);
    }
  }

  const columns: Column<Child>[] = [
    {
      key: 'name', label: 'Child',
      cell: (c) => (
        <div className="row gap8" style={{ alignItems: 'center' }}>
          {c.kidPhoto && <AuthImage path={`/children/${c.kidId}/photo`} alt={c.name} width={36} height={36} fit="cover" />}
          <Who name={c.name} sub={[c.gender, c.dob ? `born ${day(c.dob)}` : '', c.aadhaar ? 'Aadhaar given' : ''].filter(Boolean).join(' · ')} />
        </div>
      ),
    },
    { key: 'age', label: 'Age', num: true, cell: (c) => (c.age != null ? `${c.age}` : '—') },
    {
      key: 'parents', label: 'Parents', sortable: false,
      cell: (c) => (c.parents.length
        ? <>{c.parents.map((p) => p.name).join(', ')}<span className="sub mono">{c.parents[0].mobile}</span></>
        : <span className="muted">Not linked</span>),
    },
    {
      key: 'state', label: 'Membership',
      cell: (c) => { const s = STATE[c.state] ?? { tone: 'mute' as const, label: c.state }; return <Chip tone={s.tone}>{s.label}</Chip>; },
    },
    {
      key: 'noticeAt', label: 'Notice at 15', sortBy: (c) => (c.noticeAt ? +c.noticeAt : 0),
      cell: (c) => (!c.fifteen ? <span className="muted">Under 15</span>
        : c.noticeAt ? <Chip tone="ok" icon="check">Told {fd(c.noticeAt)}</Chip>
          : c.state !== 'none' && c.state !== 'young' ? <span className="muted">Not needed</span>
            : c.noticesRead ? <Chip tone="warn">Not told yet</Chip> : <span className="muted">Unknown</span>),
    },
  ];

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;

  return (
    <div className="stack">
      <Kpis>
        <Kpi label="Children" value={tally.all} icon="heart" detail="added by their parents" />
        <Kpi label="Members" value={tally.members} icon="user-check" detail="made members, consent approved" />
        <Kpi label="Aged 15 or more" value={tally.fifteen} icon="user" detail="not members yet" />
        <Kpi label="Families told" value={tally.told} icon="bell" detail="to press Make member" />
      </Kpis>

      {q.loading && !q.data ? (
        <div className="card"><Loading what="the children" /></div>
      ) : (
        <Table
          rows={rows}
          columns={columns}
          rowKey={(c) => c.kidId}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Child's or parent's name"
          onRowClick={(c) => { setOpen(null); setChild(c); }}
          pageSize={25}
          toolbar={
            <>
              <select className="sel" value={only15 ? '15' : ''} onChange={(e) => setOnly15(e.target.value === '15')} aria-label="Filter by age">
                <option value="">Every child</option>
                <option value="15">Aged 15 or more</option>
              </select>
              <span className="sp" style={{ flex: 1 }} />
              {can('members.edit') && (
                <Btn icon="bell" disabled={sending} onClick={sendNow}>{sending ? 'Sending…' : 'Send notices now'}</Btn>
              )}
            </>
          }
          empty={<Empty icon="heart" title="No children yet">Children appear here once a parent adds them in the app.</Empty>}
        />
      )}

      <Drawer open={!!child} onClose={() => { setChild(null); setOpen(null); }} width="wide"
        title={open ? open.name : child?.name ?? ''}
        sub={open && child ? <button className="btn sm" onClick={() => setOpen(null)}>Back to {child.name.split(' ')[0]}</button> : undefined}>
        {open
          ? <PersonDetail memberRowId={open.rowId} onChanged={q.reload} onGone={() => setOpen(null)} />
          : child && <ChildDetail kidId={child.kidId} onOpenMember={setOpen} />}
      </Drawer>
    </div>
  );
}
