/* Prayer requests raised from the pop-up in the Noah app.

   This screen did not exist in the HTML prototype either: the app simulated
   approval with a button on the request itself (session log, item 39).

   Two things matter here and are easy to get wrong, so the screen says them
   out loud:
     - nothing reaches another member's wall until it is approved;
     - the member chose who may see it. "Prayer warriors" is the default and
       is not a formality — the server filters the wall by it. */

import { useMemo, useState } from 'react';
import { api, collection } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useQueues } from '@/state/queues';
import { useToast, Drawer } from '@/components/layers';
import { Table, type Column } from '@/components/Table';
import { Btn, Chip, Field, Kpi, Kpis, Note, Age, Failed, Loading, Empty, Who } from '@/components/ui';
import { fdt, since } from '@/lib/format';
import type { PrayerRequest } from '@/lib/types';

const CATEGORY_ICON: Record<string, string> = {
  Healing: 'heart', Family: 'users', Guidance: 'star', Thanksgiving: 'sparkles', Other: 'flame',
};

/** Who the member asked to see it. */
function Audience({ everyone }: { everyone: boolean }) {
  return everyone
    ? <Chip tone="info" icon="globe">Everyone</Chip>
    : <Chip tone="brand" icon="shield">Prayer warriors</Chip>;
}

export default function PrayerInbox() {
  const [state, setState] = useState<'Pending' | 'Approved' | 'Declined' | ''>('Pending');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<PrayerRequest | null>(null);
  const [remark, setRemark] = useState('');
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const queues = useQueues();

  const q = useQuery(
    () => collection<PrayerRequest>('PRAYER_INBOX', { state: state || undefined, q: search || undefined, limit: 300, sort: 'at', dir: 'asc' }),
    [state, search],
  );
  const all = useQuery(() => collection<PrayerRequest>('PRAYER_INBOX', { limit: 500 }), []);

  const tally = useMemo(() => {
    const rows = all.data?.rows ?? [];
    const pending = rows.filter((r) => r.state === 'Pending');
    return {
      pending: pending.length,
      warriors: pending.filter((r) => !r.everyone).length,
      approved: rows.filter((r) => r.state === 'Approved').length,
      oldest: pending.map((r) => r.at).sort((a, b) => +a - +b)[0] ?? null,
    };
  }, [all.data]);

  async function decide(r: PrayerRequest, decision: 'Approved' | 'Declined', why = '') {
    setBusy(true);
    try {
      await api.post(`/prayer-inbox/${r.id}/decide`, { decision, remark: why });
      setOpen(null);
      setDeclining(false);
      setRemark('');
      q.reload();
      all.reload();
      queues.refresh();
      toast(
        decision === 'Approved'
          ? r.everyone
            ? 'Approved. It is on the open prayer wall now.'
            : 'Approved. Prayer warriors can see it; it stays off the open wall.'
          : 'Declined. The member sees your note.',
        decision === 'Approved' ? 'ok' : 'warn',
      );
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function approveMany(ids: string[]) {
    setBusy(true);
    try {
      for (const id of ids) {
        await api.post(`/prayer-inbox/${id}/decide`, { decision: 'Approved' });
      }
      setSelected(new Set());
      q.reload();
      all.reload();
      queues.refresh();
      toast(`${ids.length} requests approved, each to the audience the member chose.`);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<PrayerRequest>[] = [
    {
      key: 'category', label: 'Category', width: 150,
      cell: (r) => <Chip icon={CATEGORY_ICON[r.category] ?? 'flame'}>{r.category}</Chip>,
    },
    {
      key: 'text', label: 'The request',
      cell: (r) => (
        <>
          <span style={{ display: 'block', maxWidth: '58ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.text}
          </span>
          <span className="sub">
            {r.anonymous ? 'Anonymous' : r.memberName || 'A member'}
          </span>
        </>
      ),
    },
    { key: 'everyone', label: 'Who may see it', cell: (r) => <Audience everyone={r.everyone} />, sortBy: (r) => String(r.everyone) },
    {
      key: 'at', label: 'Waiting', num: true,
      cell: (r) => (r.state === 'Pending' ? <Age at={r.at} warn={12} bad={24} /> : <span className="muted">{since(r.at)}</span>),
      sortBy: (r) => r.at,
    },
    {
      key: 'state', label: 'Status',
      cell: (r) => <Chip tone={r.state === 'Approved' ? 'ok' : r.state === 'Declined' ? 'bad' : 'warn'}>{r.state}</Chip>,
    },
  ];

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;

  return (
    <div className="stack">
      <Note tone="brand" icon="shield">
        <b>Nothing here is visible to anyone else yet.</b> A request appears on a
        wall only once it is approved, and only to the audience the member
        asked for. <b>Prayer warriors</b> is the default, and the server keeps
        those requests off the open wall — approving does not widen it.
      </Note>

      <Kpis>
        <Kpi label="Waiting" value={tally.pending} icon="flame" tone={tally.pending > 4 ? 'warn' : undefined}
          detail={tally.oldest ? <>oldest <Age at={tally.oldest} warn={12} bad={24} /></> : 'nothing waiting'} />
        <Kpi label="For prayer warriors" value={tally.warriors} icon="shield"
          detail="of those waiting" />
        <Kpi label="Approved" value={tally.approved} icon="check" detail="now on a wall" />
        <Kpi label="Target" value="12 h" icon="clock" detail="people are waiting to be prayed for" />
      </Kpis>

      {q.loading && !q.data ? (
        <div className="card"><Loading what="prayer requests" /></div>
      ) : (
        <Table
          rows={q.data?.rows ?? []}
          columns={columns}
          rowKey={(r) => r.id}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Words in the request, or a category"
          onRowClick={setOpen}
          pageSize={20}
          selectable={state === 'Pending'}
          selected={selected}
          onSelect={setSelected}
          bulkActions={(ids) => (
            <Btn variant="ok" sm icon="check" disabled={busy} onClick={() => approveMany(ids)}>
              Approve {ids.length}
            </Btn>
          )}
          toolbar={
            <>
              <select className="sel" value={state} onChange={(e) => { setState(e.target.value as typeof state); setSelected(new Set()); }} aria-label="Filter by status">
                <option value="Pending">Waiting ({tally.pending})</option>
                <option value="Approved">Approved</option>
                <option value="Declined">Declined</option>
                <option value="">Everything</option>
              </select>
              <span className="sp" style={{ flex: 1 }} />
              <span className="small muted">Oldest first</span>
            </>
          }
          empty={<Empty icon="check" title="Nothing waiting">Every request from the app has been decided.</Empty>}
          footNote="From the prayer pop-up in the Noah app"
        />
      )}

      <Drawer
        open={!!open}
        onClose={() => { setOpen(null); setDeclining(false); setRemark(''); }}
        title="Prayer request"
        sub={open ? <><span className="mono">{open.id}</span> · {fdt(open.at)}</> : ''}
        footer={
          open && open.state === 'Pending' ? (
            declining ? (
              <>
                <span className="sp" style={{ flex: 1 }} />
                <Btn onClick={() => { setDeclining(false); setRemark(''); }}>Cancel</Btn>
                <Btn variant="danger" disabled={!remark.trim() || busy} onClick={() => decide(open, 'Declined', remark.trim())}>
                  Decline and tell them
                </Btn>
              </>
            ) : (
              <>
                <span className="muted small">
                  {open.everyone ? 'Approving puts it on the open wall.' : 'Approving sends it to prayer warriors only.'}
                </span>
                <span className="sp" style={{ flex: 1 }} />
                <Btn variant="danger" icon="x" onClick={() => setDeclining(true)} disabled={busy}>Decline</Btn>
                <Btn variant="ok" icon="check" onClick={() => decide(open, 'Approved')} disabled={busy}>Approve</Btn>
              </>
            )
          ) : open ? (
            <span className="muted small">
              {open.state} by {open.decidedBy}.{open.remark && <> “{open.remark}”</>}
            </span>
          ) : null
        }
      >
        {open && (
          <>
            <div className="row wrap gap6 mb12">
              <Chip icon={CATEGORY_ICON[open.category] ?? 'flame'}>{open.category}</Chip>
              <Audience everyone={open.everyone} />
              {open.anonymous && <Chip tone="mute" icon="eye-off">Anonymous</Chip>}
              {/* The app sets this when the request was written straight from
                  a Daily Manna reading, which is useful context. */}
              {open.mannaId && <Chip tone="plain" icon="book-open">From {open.mannaId}</Chip>}
            </div>

            <div className="card pad">
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65 }}>{open.text}</p>
            </div>

            <div className="mt16">
              <div className="sect-title">Who raised it</div>
              {open.anonymous ? (
                <Note tone="mute" icon="eye-off">
                  The member asked to stay anonymous. Their name is not shown on
                  the wall. The office can still see who it was, for pastoral
                  follow-up: <b>{open.memberName || 'a member'}</b>, <span className="mono">{open.mobile}</span>.
                </Note>
              ) : (
                <Who name={open.memberName || 'A member'} sub={<span className="mono">{open.mobile}</span>} />
              )}
            </div>

            {declining && (
              <div className="mt20">
                <Note tone="warn" icon="alert">
                  The member reads this. Say what was wrong, so they can send it again.
                </Note>
                <div className="mt12">
                  <Field label="Why is it being declined?" hint="Required.">
                    <textarea
                      className="ta" rows={3} value={remark} autoFocus
                      placeholder="It gives a phone number. Please send it again without personal contact details."
                      onChange={(e) => setRemark(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="row wrap gap6 mt12">
                  {[
                    'It gives a phone number. Please send it again without personal contact details.',
                    'It names someone else without their permission.',
                    'This is better taken to your pastor directly. The office will call you.',
                  ].map((t) => (
                    <button key={t} className="btn sm" onClick={() => setRemark(t)}>{t.slice(0, 34)}…</button>
                  ))}
                </div>
              </div>
            )}

            {open.state === 'Approved' && (
              <div className="mt16">
                <Note tone="ok" icon="check">
                  On the {open.everyone ? 'open prayer wall' : 'prayer warriors’ wall'}.
                  {open.prayedBy > 0 && <> <b>{open.prayedBy}</b> members have prayed for it.</>}
                </Note>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
