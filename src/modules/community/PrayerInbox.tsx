/* Prayer requests raised from the pop-up in the Noah app.

   This screen did not exist in the HTML prototype either: the app simulated
   approval with a button on the request itself (session log, item 39).

   Two things matter here and are easy to get wrong, so the screen says them
   out loud:
     - nothing reaches another member's wall until it is approved;
     - the member chose who may see it. "Prayer warriors" is the default and
       is not a formality — the server filters the wall by it.

   The office may correct the wording and change who may see a request, before or after it is approved. The app limits a member to
   300 characters; the office is not held to that (the database holds 10,000). Giving a reason for declining is optional.

   The office can also write a prayer request of its own (New prayer request): from itself or on behalf of a member, in a
   category, for everyone or for prayer warriors only, and either put on the wall at once or left waiting like a member's. */

import { useEffect, useMemo, useState } from 'react';
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

const CATEGORIES = ['Healing', 'Family', 'Guidance', 'Thanksgiving', 'Other'];

interface Person { id: string; name: string; mobile: string }

/* The member a request is written on behalf of: search by name or mobile number. Left empty, it is from the office itself. */
function FromPick({ value, onPick }: { value: Person | null; onPick: (p: Person | null) => void }) {
  const [q, setQ] = useState('');
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTyped(q), 250); return () => clearTimeout(t); }, [q]);
  const found = useQuery(
    () => (open ? api.get<{ rows: Person[] }>(`/prayer-inbox/members?q=${encodeURIComponent(typed)}`) : Promise.resolve({ rows: [] as Person[] })),
    [typed, open],
  );
  if (value && !open) {
    return (
      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}><b>{value.name}</b>{value.mobile && <span className="muted"> · {value.mobile}</span>}</div>
        <Btn sm onClick={() => { setQ(''); setOpen(true); }}>Change</Btn>
        <Btn sm onClick={() => onPick(null)}>From the office instead</Btn>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}><b>From the office</b> <span className="muted">(you)</span></div>
        <Btn sm onClick={() => setOpen(true)}>On behalf of a member</Btn>
      </div>
    );
  }
  return (
    <div>
      <input className="inp" value={q} autoFocus placeholder="Search a member by name or mobile number" onChange={(e) => setQ(e.target.value)} />
      <div className="writer-list">
        {found.loading && <div className="muted" style={{ padding: 10 }}>Searching…</div>}
        {!found.loading && !(found.data?.rows.length) && <div className="muted" style={{ padding: 10 }}>No member found.</div>}
        {(found.data?.rows ?? []).map((w) => (
          <button type="button" key={w.id} onClick={() => { onPick(w); setOpen(false); }}>
            <b>{w.name}</b><span className="muted">{w.mobile}</span>
          </button>
        ))}
        <button type="button" onClick={() => setOpen(false)}><span className="muted">Cancel</span></button>
      </div>
    </div>
  );
}

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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftEveryone, setDraftEveryone] = useState(false);
  const [busy, setBusy] = useState(false);

  /* A prayer request the office writes. */
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('Other');
  const [newEveryone, setNewEveryone] = useState(false);
  const [newPublish, setNewPublish] = useState(true);
  const [newFrom, setNewFrom] = useState<Person | null>(null);
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

  const closeDrawer = () => { setOpen(null); setDeclining(false); setRemark(''); setEditing(false); };

  async function decide(r: PrayerRequest, decision: 'Approved' | 'Declined', why = '') {
    setBusy(true);
    try {
      const out = await api.post<{ memberTold?: boolean }>(`/prayer-inbox/${r.id}/decide`, { decision, remark: why });
      closeDrawer();
      q.reload();
      all.reload();
      queues.refresh();
      toast(
        decision === 'Approved'
          ? r.everyone
            ? 'Approved. It is on the open prayer wall now.'
            : 'Approved. Prayer warriors can see it; it stays off the open wall.'
          : out.memberTold ? (why ? 'Declined. The member is told, with your note.' : 'Declined. The member is told.') : 'Declined.',
        decision === 'Approved' ? 'ok' : 'warn',
      );
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const startAdd = () => { setNewText(''); setNewCategory('Other'); setNewEveryone(false); setNewPublish(true); setNewFrom(null); setAdding(true); };

  async function saveNew() {
    setBusy(true);
    try {
      await api.post('/prayer-inbox', { text: newText, category: newCategory, everyone: newEveryone, publish: newPublish, memberId: newFrom?.id });
      setAdding(false);
      setState(newPublish ? 'Approved' : 'Pending');
      q.reload();
      all.reload();
      queues.refresh();
      toast(
        !newPublish ? 'Added. It is waiting for approval, like a member\'s.'
          : newEveryone ? 'Added. It is on the open prayer wall now.' : 'Added. Prayer warriors can see it.',
        'ok',
      );
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const startEdit = (r: PrayerRequest) => { setDraft(r.text); setDraftEveryone(r.everyone); setEditing(true); setDeclining(false); };

  /* Save the corrected wording and who may see it. Only what changed is sent. */
  async function saveEdit(r: PrayerRequest) {
    const text = draft.trim();
    const body: { text?: string; everyone?: boolean } = {};
    if (text !== r.text) body.text = text;
    if (draftEveryone !== r.everyone) body.everyone = draftEveryone;
    if (!Object.keys(body).length) { setEditing(false); return; }
    setBusy(true);
    try {
      const out = await api.patch<{ request: PrayerRequest }>(`/prayer-inbox/${r.id}`, body);
      setOpen(out.request);
      setEditing(false);
      q.reload();
      all.reload();
      toast(
        body.everyone !== undefined && body.text !== undefined ? 'Saved. The wording and who may see it are changed.'
          : body.everyone !== undefined ? (draftEveryone ? 'Saved. It is for everyone now.' : 'Saved. It is for prayer warriors only now.')
            : 'Saved. The wording is changed.',
        'ok',
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
              <Btn variant="pri" icon="plus" onClick={startAdd}>New prayer request</Btn>
            </>
          }
          empty={<Empty icon="check" title="Nothing waiting">Every request from the app has been decided.</Empty>}
          footNote="From the prayer pop-up in the Noah app"
        />
      )}

      <Drawer
        open={adding}
        onClose={() => setAdding(false)}
        title="New prayer request"
        footer={
          <>
            <span className="sp" style={{ flex: 1 }} />
            <Btn onClick={() => setAdding(false)} disabled={busy}>Cancel</Btn>
            <Btn variant="ok" icon="check" onClick={saveNew} disabled={busy || !newText.trim()}>
              {newPublish ? 'Add and put on the wall' : 'Add and leave waiting'}
            </Btn>
          </>
        }
      >
        <div className="stack" style={{ gap: 14 }}>
          <Field label="The request" hint={`${newText.trim().length.toLocaleString('en-IN')} characters`}>
            <textarea className="ta" rows={8} value={newText} autoFocus placeholder="What should members pray for?" onChange={(e) => setNewText(e.target.value)} />
          </Field>
          <Field label="Category">
            <select className="sel" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Who may see it">
            <select className="sel" value={newEveryone ? 'everyone' : 'warriors'} onChange={(e) => setNewEveryone(e.target.value === 'everyone')}>
              <option value="warriors">Prayer warriors only</option>
              <option value="everyone">Everyone (the open prayer wall)</option>
            </select>
          </Field>
          <Field label="Who it is from" as="div">
            <FromPick value={newFrom} onPick={setNewFrom} />
          </Field>
          <label className="row gap8" style={{ alignItems: 'center' }}>
            <input type="checkbox" checked={newPublish} onChange={(e) => setNewPublish(e.target.checked)} />
            <span>Put it on the prayer wall now <span className="muted small">(otherwise it waits here to be approved)</span></span>
          </label>
        </div>
      </Drawer>

      <Drawer
        open={!!open}
        onClose={closeDrawer}
        title="Prayer request"
        sub={open ? <><span className="mono">{open.id}</span> · {fdt(open.at)}</> : ''}
        footer={
          open && open.state === 'Pending' ? (
            declining ? (
              <>
                <span className="sp" style={{ flex: 1 }} />
                <Btn onClick={() => { setDeclining(false); setRemark(''); }}>Cancel</Btn>
                <Btn variant="danger" disabled={busy} onClick={() => decide(open, 'Declined', remark.trim())}>
                  Decline and tell them
                </Btn>
              </>
            ) : (
              <>
                <span className="muted small">
                  {open.everyone ? 'Approving puts it on the open wall.' : 'Approving sends it to prayer warriors only.'}
                </span>
                <span className="sp" style={{ flex: 1 }} />
                <Btn variant="danger" icon="x" onClick={() => setDeclining(true)} disabled={busy || editing}>Decline</Btn>
                <Btn variant="ok" icon="check" onClick={() => decide(open, 'Approved')} disabled={busy || editing}>Approve</Btn>
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
              {editing ? (
                <div className="stack" style={{ gap: 12 }}>
                  <Field label="The request" hint={`${draft.trim().length.toLocaleString('en-IN')} characters`}>
                    <textarea className="ta" rows={9} value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} />
                  </Field>
                  <Field label="Who may see it">
                    <select className="sel" value={draftEveryone ? 'everyone' : 'warriors'} onChange={(e) => setDraftEveryone(e.target.value === 'everyone')}>
                      <option value="warriors">Prayer warriors only</option>
                      <option value="everyone">Everyone (the open prayer wall)</option>
                    </select>
                  </Field>
                  <div className="row gap8">
                    <span className="sp" style={{ flex: 1 }} />
                    <Btn onClick={() => setEditing(false)} disabled={busy}>Cancel</Btn>
                    <Btn variant="ok" icon="check" onClick={() => saveEdit(open)} disabled={busy || !draft.trim()}>Save changes</Btn>
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{open.text}</p>
                  {open.state !== 'Declined' && (
                    <div className="mt12"><Btn sm icon="edit" onClick={() => startEdit(open)} disabled={busy}>Edit</Btn></div>
                  )}
                </>
              )}
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
                <div className="mt12">
                  <Field label="Why is it being declined?" hint="Optional. The member is told it was declined, and sees this if you write it.">
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
