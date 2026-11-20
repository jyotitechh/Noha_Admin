/* The member register: everyone on the roll.

   Contact details sit behind their own permission and are fetched only when
   asked for, because every reveal is written to the audit log. The register
   itself shows a masked number so the column is still useful.

   One Filter button narrows it by city, state, country, mother tongue, an event
   they came to, and a group (one person may be in several). Each filter takes
   several values (Pune or Mumbai); different filters must all match. Export CSV downloads
   everything about the members it is showing; that needs members.export and
   members.pii, and the server logs each export (server/routes/register.js). */

import { useMemo, useState } from 'react';
import { api, apiUrl, collection, getToken, qs } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { Drawer, Modal, useToast } from '@/components/layers';
import { PersonDetail } from '@/components/PersonDetail';
import { MultiPick } from '@/components/MultiPick';
import { Table, type Column } from '@/components/Table';
import { Btn, Chip, Field, Icon, Kpi, Kpis, Status, Who, Failed, Loading, Empty } from '@/components/ui';
import { fd, num } from '@/lib/format';
import type { Member } from '@/lib/types';

/** Enough of a number to recognise, not enough to use. */
const mask = (m: string) => m.replace(/(\+\d{2}\s\d{2})\d{3}\s?\d{2}/, '$1••• ••');

interface Option { value: string; label: string; count: number; date?: string }
type FilterKey = 'city' | 'state' | 'country' | 'tongue' | 'event' | 'group';
type Filters = Partial<Record<FilterKey, string[]>>;
type Options = Record<FilterKey, Option[]>;

const FILTERS: { key: FilterKey; label: string; any: string; none: string }[] = [
  { key: 'city', label: 'City', any: 'Any city', none: 'No cities recorded yet' },
  { key: 'state', label: 'State', any: 'Any state', none: 'No states recorded yet' },
  { key: 'country', label: 'Country', any: 'Any country', none: 'No countries recorded yet' },
  { key: 'tongue', label: 'Mother tongue', any: 'Any mother tongue', none: 'No mother tongues recorded yet' },
  { key: 'event', label: 'Attended an event', any: 'Any event', none: 'No attendance recorded yet' },
  { key: 'group', label: 'Group', any: 'Any group', none: 'No groups yet' },
];

const shortDay = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
/* What a choice says beside its name: how many members have it, and for an event its date and how many came. */
const detailOf = (k: FilterKey, o: Option) =>
  k === 'event' ? `${o.date ? shortDay(o.date) + ' · ' : ''}${o.count} came` : String(o.count);

export default function Register() {
  const { can } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Active');
  const [filters, setFilters] = useState<Filters>({});
  const [draft, setDraft] = useState<Filters>({});
  const [picking, setPicking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState<Member | null>(null);

  const query = { q: search || undefined, status: status || undefined, ...filters };
  const q = useQuery(
    () => collection<Member>('MEMBERS', { ...query, limit: 500 }),
    [search, status, JSON.stringify(filters)],
  );
  const all = useQuery(() => collection<Member>('MEMBERS', { limit: 500 }), []);
  const opts = useQuery(() => api.get<Options>('/member-register/filters'), []);

  const stats = useMemo(() => {
    const rows = all.data?.rows ?? [];
    return {
      total: rows.length,
      active: rows.filter((m) => m.status === 'Active').length,
      partners: rows.filter((m) => m.partner).length,
      fromApp: rows.filter((m) => m.fromRegistration).length,
      locations: Array.from(new Set(rows.map((m) => m.loc).filter(Boolean))).length,
    };
  }, [all.data]);

  const active = FILTERS.filter((f) => filters[f.key]?.length);
  const labelOf = (k: FilterKey, v: string) => opts.data?.[k]?.find((o) => o.value === v)?.label ?? v;

  function openPicker() { setDraft(filters); setPicking(true); }
  function apply() {
    setFilters(Object.fromEntries(Object.entries(draft).filter(([, v]) => v?.length)) as Filters);
    setPicking(false);
  }
  /* Take one value off a filter; the filter goes when its last value does. */
  const drop = (k: FilterKey, v: string) => setFilters((f) => {
    const n = { ...f, [k]: (f[k] ?? []).filter((x) => x !== v) };
    if (!n[k]!.length) delete n[k];
    return n;
  });
  const chosenCount = active.reduce((n, f) => n + (filters[f.key]?.length ?? 0), 0);
  const total = q.data?.total ?? 0;

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await fetch(apiUrl('/member-register/export' + qs(query)), { headers: { authorization: 'Bearer ' + getToken() } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `The file could not be made (${res.status}).`);
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'members.csv';
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setExporting(false);
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
        <Kpi label="Congregations" value={stats.locations} icon="pin" />
      </Kpis>

      <div className="row wrap gap6" style={{ alignItems: 'center' }}>
        <span className="small" aria-live="polite">
          {q.loading && !q.data ? 'Counting…' : <><b>{num(total)}</b> {total === 1 ? 'member matches' : 'members match'}</>}
        </span>
        {active.flatMap((f) => (filters[f.key] ?? []).map((v) => (
          <button key={f.key + v} type="button" className="chip brand" style={{ cursor: 'pointer' }}
            onClick={() => drop(f.key, v)} aria-label={`Remove ${labelOf(f.key, v)} from the ${f.label.toLowerCase()} filter`}>
            {f.label}: {labelOf(f.key, v)}
            <Icon name="x" />
          </button>
        )))}
        {active.length > 0 && <button type="button" className="btn sm ghost" onClick={() => setFilters({})}>Clear all</button>}
      </div>

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
              <Btn icon="filter" variant={active.length ? 'pri' : undefined} onClick={openPicker}>
                Filter{chosenCount ? ` · ${chosenCount}` : ''}
              </Btn>
              <select className="sel" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                <option value="Active">Active</option>
                <option value="">Every status</option>
                <option value="Archived">Archived</option>
                <option value="Deceased">Deceased</option>
              </select>
              {can('members.export') && can('members.pii') && (
                <Btn icon="download" onClick={exportCsv} disabled={exporting || !(q.data?.rows.length)}>
                  {exporting ? 'Preparing…' : 'Export CSV'}
                </Btn>
              )}
            </>
          }
          empty={<Empty icon="users" title="No members match">Try a wider filter.</Empty>}
        />
      )}

      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        title="Filter members"
        width={620}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setDraft({})}>Clear all</Btn>
            <span className="grow" />
            <Btn onClick={() => setPicking(false)}>Cancel</Btn>
            <Btn variant="pri" icon="check" onClick={apply}>Show members</Btn>
          </>
        }
      >
        {opts.error ? (
          <Empty icon="alert" title="The filters could not be loaded">{opts.error.message}</Empty>
        ) : !opts.data ? (
          <Loading what="the filters" />
        ) : (
          <div className="g2">
            {FILTERS.map((f) => {
              const list = opts.data![f.key] ?? [];
              return (
                /* A div, not a label: the list holds buttons and tick boxes of its own (see Field in components/ui). */
                <Field key={f.key} label={f.label} as="div">
                  <MultiPick label={f.label} any={f.any} none={f.none} value={draft[f.key] ?? []}
                    options={list.map((o) => ({ value: o.value, label: o.label, detail: detailOf(f.key, o) }))}
                    onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
                </Field>
              );
            })}
          </div>
        )}
      </Modal>

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        width="wide"
        title={open?.name ?? ''}
        sub={open ? <><span className="mono">{open.id}</span> · {open.loc} · member since {fd(open.joined)}</> : ''}
      >
        {/* Everything about them, in one place: see components/PersonDetail. */}
        {open && <PersonDetail memberRowId={(open as Member & { rowId?: string }).rowId ?? open.id} onChanged={() => { q.reload(); all.reload(); opts.reload(); }} onGone={() => setOpen(null)} />}
      </Drawer>
    </div>
  );
}
