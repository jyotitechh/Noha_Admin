/* The shape shared by every "look at it, then approve or reject" screen:
   moderation, flagged content, praise reports and video checks.

   Each of those differs only in what a row looks like and what the two
   buttons are called, so they pass that in and get the list, the search, the
   bulk bar, the detail drawer and the reasons-for-rejection box for free.

   Decisions go to POST /api/decide/:collection/:id, which checks the
   permission, writes the change and records it in the audit log. */

import { useMemo, useState, type ReactNode } from 'react';
import { api, collection } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useQueues } from '@/state/queues';
import { useToast, Drawer } from '@/components/layers';
import { Table, type Column } from '@/components/Table';
import { Btn, Chip, Field, Kpi, Kpis, Note, Age, Failed, Loading, Empty } from '@/components/ui';
import { fdt, since } from '@/lib/format';

export interface DecisionRow {
  id: string;
  at: Date;
  state?: string;
  status?: string;
  remark?: string;
  decidedBy?: string;
  [k: string]: unknown;
}

interface Props<T extends DecisionRow> {
  /** Seed collection to read, e.g. 'MODQ'. */
  name: string;
  /** Which field carries the decision: most use `state`, a few use `status`. */
  field?: 'state' | 'status';
  /** The value a row waiting for a decision holds. */
  waiting: string;
  /** Other values the filter offers. */
  states: string[];
  columns: Column<T>[];
  /** Hours after which an item is late, for the age colour. */
  sla: number;
  searchPlaceholder: string;
  approveLabel: string;
  rejectLabel: string;
  /** Shown above the list. */
  intro?: ReactNode;
  /** The detail panel inside the drawer. */
  detail: (row: T) => ReactNode;
  drawerTitle: (row: T) => ReactNode;
  /** Suggested wording for a rejection. */
  reasons?: string[];
  /** A rejection must say why. */
  reasonRequired?: boolean;
  /** Extra tiles beside the standard two. */
  extraKpis?: (rows: T[]) => ReactNode;
  emptyTitle?: string;
}

export function DecisionQueue<T extends DecisionRow>({
  name, field = 'state', waiting, states, columns, sla, searchPlaceholder,
  approveLabel, rejectLabel, intro, detail, drawerTitle, reasons = [],
  reasonRequired = true, extraKpis, emptyTitle = 'Nothing waiting',
}: Props<T>) {
  const [filter, setFilter] = useState(waiting);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<T | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const queues = useQueues();

  const q = useQuery(
    () => collection<T>(name, { [field]: filter || undefined, q: search || undefined, limit: 300, sort: 'at', dir: 'asc' }),
    [filter, search],
  );
  const all = useQuery(() => collection<T>(name, { limit: 500 }), []);

  const rows = all.data?.rows ?? [];
  const pending = useMemo(() => rows.filter((r) => r[field] === waiting), [rows, field, waiting]);
  const oldest = useMemo(() => pending.map((r) => r.at).sort((a, b) => +a - +b)[0] ?? null, [pending]);

  function after(message: string, tone: 'ok' | 'warn' = 'ok') {
    setOpen(null);
    setRejecting(false);
    setRemark('');
    setSelected(new Set());
    q.reload();
    all.reload();
    queues.refresh();
    toast(message, tone);
  }

  async function decide(row: T, approve: boolean, why = '') {
    setBusy(true);
    try {
      await api.post(`/decide/${name}/${row.id}`, { approve, remark: why });
      after(approve ? `${approveLabel}.` : `${rejectLabel}.`, approve ? 'ok' : 'warn');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function decideMany(ids: string[], approve: boolean) {
    setBusy(true);
    try {
      await api.post(`/decide/${name}`, { ids, approve });
      after(`${ids.length} decided.`);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;

  /* No such table in the connected Catalyst project. */
  if (q.data?.notInProject) {
    return (
      <div className="card">
        <Empty icon="db" title="Not in the connected project">
          {q.data.message}
          <br />
          Nothing is shown rather than sample data, so that what you see is
          only what is really there.
        </Empty>
      </div>
    );
  }

  return (
    <div className="stack">
      {intro}

      <Kpis>
        <Kpi label="Waiting" value={pending.length} icon="inbox" tone={pending.length > 8 ? 'warn' : undefined}
          detail={oldest ? <>oldest <Age at={oldest} warn={sla} bad={sla * 2} /></> : 'nothing waiting'} />
        <Kpi label="Target" value={`${sla} h`} icon="clock" detail="how long an item should wait" />
        {extraKpis?.(rows)}
      </Kpis>

      {q.loading && !q.data ? (
        <div className="card"><Loading what="the queue" /></div>
      ) : (
        <Table
          rows={q.data?.rows ?? []}
          columns={[
            ...columns,
            {
              key: 'at', label: 'Waiting', num: true,
              cell: (r: T) => (r[field] === waiting ? <Age at={r.at} warn={sla} bad={sla * 2} /> : <span className="muted">{since(r.at)}</span>),
              sortBy: (r: T) => r.at,
            },
          ]}
          rowKey={(r) => r.id}
          search={search}
          onSearch={setSearch}
          searchPlaceholder={searchPlaceholder}
          onRowClick={setOpen}
          pageSize={20}
          selectable={filter === waiting}
          selected={selected}
          onSelect={setSelected}
          bulkActions={(ids) => (
            <>
              <Btn variant="ok" sm icon="check" disabled={busy} onClick={() => decideMany(ids, true)}>
                Approve {ids.length}
              </Btn>
              <Btn variant="danger" sm icon="x" disabled={busy} onClick={() => decideMany(ids, false)}>
                Reject {ids.length}
              </Btn>
            </>
          )}
          toolbar={
            <>
              <select className="sel" value={filter} onChange={(e) => { setFilter(e.target.value); setSelected(new Set()); }} aria-label="Filter by status">
                <option value={waiting}>Waiting ({pending.length})</option>
                {states.filter((s) => s !== waiting).map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="">Everything</option>
              </select>
              <span className="sp" style={{ flex: 1 }} />
              <span className="small muted">Oldest first</span>
            </>
          }
          empty={<Empty icon="check" title={emptyTitle}>Everything here has been decided.</Empty>}
        />
      )}

      <Drawer
        open={!!open}
        onClose={() => { setOpen(null); setRejecting(false); setRemark(''); }}
        width="wide"
        title={open ? drawerTitle(open) : ''}
        sub={open ? <><span className="mono">{open.id}</span> · {fdt(open.at)}</> : ''}
        footer={
          open && open[field] === waiting ? (
            rejecting ? (
              <>
                <span className="sp" style={{ flex: 1 }} />
                <Btn onClick={() => { setRejecting(false); setRemark(''); }}>Cancel</Btn>
                <Btn variant="danger" disabled={busy || (reasonRequired && !remark.trim())} onClick={() => decide(open, false, remark.trim())}>
                  {rejectLabel}
                </Btn>
              </>
            ) : (
              <>
                <span className="sp" style={{ flex: 1 }} />
                <Btn variant="danger" icon="x" disabled={busy} onClick={() => (reasons.length || reasonRequired ? setRejecting(true) : decide(open, false))}>
                  {rejectLabel}
                </Btn>
                <Btn variant="ok" icon="check" disabled={busy} onClick={() => decide(open, true)}>
                  {approveLabel}
                </Btn>
              </>
            )
          ) : open ? (
            <span className="muted small">
              {String(open[field])}{open.decidedBy ? ` by ${open.decidedBy}` : ''}.
              {open.remark ? ` “${open.remark}”` : ''}
            </span>
          ) : null
        }
      >
        {open && (
          <>
            {detail(open)}

            {rejecting && (
              <div className="mt20">
                <Note tone="warn" icon="alert">
                  The member reads this. Say what was wrong, plainly.
                </Note>
                <div className="mt12">
                  <Field label="Why?" hint={reasonRequired ? 'Required.' : 'Optional.'}>
                    <textarea className="ta" rows={3} value={remark} autoFocus onChange={(e) => setRemark(e.target.value)} />
                  </Field>
                </div>
                {reasons.length > 0 && (
                  <div className="row wrap gap6 mt12">
                    {reasons.map((t) => (
                      <button key={t} className="btn sm" onClick={() => setRemark(t)}>{t.length > 36 ? t.slice(0, 34) + '…' : t}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {open[field] !== waiting && open.remark && (
              <div className="mt16">
                <Chip tone="mute">Note to the member</Chip>
                <p className="mt8">“{open.remark}”</p>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
