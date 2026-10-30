/* Authoring screen for every kind of content: Daily Manna, prayers,
   confessions, the dream dictionary, Noahgram, Noah Tube, the Bible school and
   its courses.

   It draws itself from the definitions the server sends (GET /api/content/types),
   so there is one screen and one place to add a field. A tab can hold several
   related kinds (a devotional and its categories) behind a switcher.

   Two things it will not do:

     - Pretend a save worked. Most content tables in Catalyst are empty shells
       until their columns are added, and Noah Tube's tables do not exist. The
       server says so, and this shows it, rather than keeping a "draft" somewhere
       members cannot see it.
     - Offer a role what it cannot do. Writing needs content.edit; making
       something live, taking it down and deleting need content.publish. The
       server checks the same. */

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { useToast, Drawer, Confirm } from '@/components/layers';
import { Table, type Column } from '@/components/Table';
import { Btn, Chip, Empty, Failed, Field, Kpi, Kpis, Loading, Note, Seg, Switch } from '@/components/ui';
import { fd } from '@/lib/format';
import { RichText } from './RichText';

interface FieldDef {
  key: string; label: string; kind: 'text' | 'textarea' | 'date' | 'select' | 'toggle' | 'number' | 'url' | 'color' | 'ref' | 'richtext' | 'member' | 'verses';
  default?: string | boolean;
  /** Shown only while another field holds one of these values. */
  showIf?: { key: string; in: string[] };
  /** A pointer offered only among the rows whose `column` equals what another field holds. */
  refParent?: { field: string; column: string };
  required?: boolean; hint?: string; rows?: number; ref?: string; options?: { v: string; l: string }[];
  /** Fields sharing a group are folded into one collapsible section. */
  group?: string;
}

interface TypeDef {
  id: string; section: string; label: string; singular: string; table: string; title: string;
  dateKey: string | null; publish: string | null; intro: string; fields: FieldDef[];
  /** Fields shown as extra columns in the list. */
  columns?: string[];
}

interface Row { id: string; live: boolean; [k: string]: unknown }

interface List {
  rows: Row[]; total: number; source: 'catalyst' | 'sample';
  notReady: { code?: string; why: string; hint?: string } | null;
}

type Values = Record<string, string | boolean>;

const asDate = (v: unknown) => (typeof v === 'string' && v ? new Date(v + 'T00:00:00') : null);

/* ---------- verses: the passages a step has the member read ---------- */

interface Verse { i: number; sc: number; sv: number; ec: number; ev: number }

/* Stored as "index,Book,startChapter,startVerse,endChapter,endVerse", entries joined by ";". */
const readVerses = (text: string, books: string[]): Verse[] =>
  text.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [i, , sc, sv, ec, ev] = p.split(',');
    return { i: Number(i), sc: Number(sc), sv: Number(sv), ec: Number(ec), ev: Number(ev) };
  }).filter((v) => books[v.i]);
const writeVerses = (list: Verse[], books: string[]) =>
  list.map((v) => [v.i, books[v.i], v.sc, v.sv, v.ec, v.ev].join(',')).join(';');
const verseLabel = (v: Verse, books: string[]) =>
  `${books[v.i]} ${v.sc}:${v.sv} – ${v.ec === v.sc ? '' : v.ec + ':'}${v.ev}`;

function VersesEditor({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const defs = useQuery(() => api.get<{ books: string[] }>('/content/types'), []);
  const books = defs.data?.books ?? [];
  const list = readVerses(value, books);
  const [draft, setDraft] = useState({ i: '0', sc: '1', sv: '1', ec: '1', ev: '1' });
  const [problem, setProblem] = useState('');

  const add = () => {
    const v: Verse = { i: Number(draft.i), sc: Number(draft.sc), sv: Number(draft.sv), ec: Number(draft.ec), ev: Number(draft.ev) };
    if ([v.sc, v.sv, v.ec, v.ev].some((n) => !Number.isInteger(n) || n < 1)) return setProblem('Chapters and verses are whole numbers, 1 or more.');
    if (v.ec < v.sc || (v.ec === v.sc && v.ev < v.sv)) return setProblem('The passage must end after it starts.');
    setProblem('');
    onChange(writeVerses([...list, v], books));
  };
  const num = (k: 'sc' | 'sv' | 'ec' | 'ev', label: string) => (
    <label className="xs muted" style={{ flex: 1 }}>{label}
      <input className="inp" type="number" min={1} value={draft[k]} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />
    </label>
  );

  return (
    <div className="embeds">
      {list.length === 0 && <p className="xs muted" style={{ margin: 0 }}>No verses yet.</p>}
      <div className="stack" style={{ gap: 6 }}>
        {list.map((v, n) => (
          <div key={n} className="row" style={{ alignItems: 'center', gap: 8 }}>
            <b style={{ flex: 1 }}>{verseLabel(v, books)}</b>
            <Btn sm aria-label={'Remove ' + verseLabel(v, books)} onClick={() => onChange(writeVerses(list.filter((_, j) => j !== n), books))}>Remove</Btn>
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="xs muted" style={{ flex: '2 1 180px' }}>Book
          <select className="sel" value={draft.i} onChange={(e) => setDraft((d) => ({ ...d, i: e.target.value }))}>
            {books.map((b, i) => <option key={b} value={i}>{b}</option>)}
          </select>
        </label>
        {num('sc', 'Start chapter')}{num('sv', 'Start verse')}{num('ec', 'End chapter')}{num('ev', 'End verse')}
        <Btn sm icon="plus" onClick={add}>Add verse</Btn>
      </div>
      {(problem || error) && <p className="xs" style={{ color: 'var(--bad)', margin: '6px 0 0' }}>{problem || error}</p>}
    </div>
  );
}

/* ---------- one field of the form ---------- */

function RefSelect({ field, value, onChange, parent }: { field: FieldDef; value: string; onChange: (v: string) => void; parent?: string }) {
  /* Loaded when the form opens, one request per picker. */
  const q = useQuery(() => api.get<List>(`/content/${field.ref}`), [field.ref]);
  const defs = useQuery(() => api.get<{ types: TypeDef[] }>('/content/types'), []);
  const target = defs.data?.types.find((t) => t.id === field.ref);
  const scoped = field.refParent
    ? (q.data?.rows ?? []).filter((r) => !!parent && String(r[field.refParent!.column]) === parent)
    : (q.data?.rows ?? []);
  return (
    <select className="sel" value={value} disabled={!!field.refParent && !parent && !value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{q.loading ? 'Loading…' : field.refParent && !parent ? 'Pick the study first' : '— none —'}</option>
      {scoped.map((r) => (
        <option key={r.id} value={r.id}>{String(r[target?.title ?? 'title'] ?? r.id)}</option>
      ))}
      {/* A value that is no longer in the list is kept visible, not silently dropped. */}
      {value && !(q.data?.rows ?? []).some((r) => r.id === value) && !q.loading && (
        <option value={value}>(no longer exists) {value}</option>
      )}
    </select>
  );
}

interface Writer { id: string; name: string; mobile: string }

/* The member credited as the writer. Search by name or mobile number. */
function WriterPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState('');
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(false);

  /* Wait for a pause in typing before asking the server. */
  useEffect(() => { const t = setTimeout(() => setTyped(q), 250); return () => clearTimeout(t); }, [q]);

  const current = useQuery(
    () => (value ? api.get<{ rows: Writer[] }>(`/content/writers?id=${encodeURIComponent(value)}`) : Promise.resolve({ rows: [] as Writer[] })),
    [value],
  );
  const found = useQuery(
    () => (open ? api.get<{ rows: Writer[] }>(`/content/writers?q=${encodeURIComponent(typed)}`) : Promise.resolve({ rows: [] as Writer[] })),
    [typed, open],
  );

  const chosen = current.data?.rows[0];
  if (value && !open) {
    return (
      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <b>{chosen?.name ?? (current.loading ? 'Loading…' : `Member ${value}`)}</b>
          {chosen?.mobile && <span className="muted"> · {chosen.mobile}</span>}
        </div>
        <Btn sm onClick={() => { setQ(''); setOpen(true); }}>Change</Btn>
        <Btn sm onClick={() => onChange('')}>Remove</Btn>
      </div>
    );
  }
  return (
    <div>
      <input className="inp" value={q} placeholder="Search a member by name or mobile number"
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open && (
        <div className="writer-list">
          {found.loading && <div className="muted" style={{ padding: 10 }}>Searching…</div>}
          {!found.loading && !(found.data?.rows.length) && <div className="muted" style={{ padding: 10 }}>No member found.</div>}
          {(found.data?.rows ?? []).map((w) => (
            <button type="button" key={w.id} onClick={() => { onChange(w.id); setOpen(false); }}>
              <b>{w.name}</b><span className="muted">{w.mobile}</span>
            </button>
          ))}
          {value && <button type="button" onClick={() => setOpen(false)}><span className="muted">Keep the current writer</span></button>}
        </div>
      )}
    </div>
  );
}

/* The embeds of an entry. Only the ones in use are drawn; the + button adds the next,
   and removing one moves the rest up, so the slots stay filled from the first. */
function EmbedList({ title, members, values, errors, setValues }: {
  title: string; members: FieldDef[]; values: Values; errors: Record<string, string>;
  setValues: (fn: (s: Values) => Values) => void;
}) {
  const filledTo = members.reduce((n, m, i) => (String(values[m.key] ?? '').trim() ? i + 1 : n), 0);
  const [asked, setAsked] = useState(0);
  const shown = Math.min(members.length, Math.max(filledTo, asked));

  const remove = (i: number) => {
    setValues((s) => {
      const next = { ...s };
      for (let j = i; j < members.length; j++) next[members[j].key] = j + 1 < members.length ? s[members[j + 1].key] ?? '' : '';
      return next;
    });
    setAsked(Math.max(0, shown - 1));
  };

  return (
    <div className="embeds">
      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
        <b style={{ flex: 1, fontSize: 13 }}>{title} <span className="muted" style={{ fontWeight: 400 }}>({shown} of {members.length})</span></b>
        <Btn sm icon="plus" disabled={shown >= members.length} onClick={() => setAsked(shown + 1)}>Add embed</Btn>
      </div>
      {shown === 0 && <p className="xs muted" style={{ margin: '8px 0 0' }}>No embeds yet. Use the + button to add one.</p>}
      <div className="stack" style={{ marginTop: shown ? 10 : 0 }}>
        {members.slice(0, shown).map((m, i) => (
          <Field key={m.key} label={m.label} error={errors[m.key]}>
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <textarea className={'ta' + (errors[m.key] ? ' err' : '')} rows={2} style={{ flex: 1 }}
                value={String(values[m.key] ?? '')} placeholder="A link or embed code"
                onChange={(e) => setValues((s) => ({ ...s, [m.key]: e.target.value }))} />
              <Btn sm aria-label={'Remove ' + m.label} onClick={() => remove(i)}>Remove</Btn>
            </div>
          </Field>
        ))}
      </div>
    </div>
  );
}

function Input({ f, v, set, error, parent }: { f: FieldDef; v: string | boolean; set: (v: string | boolean) => void; error?: string; parent?: string }) {
  const text = typeof v === 'string' ? v : '';
  const invalid = error ? ' err' : '';

  if (f.kind === 'toggle') {
    return (
      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
        <Switch checked={!!v} onChange={(x) => set(x)} label={f.label} />
        <span>{f.label}</span>
        {f.hint && <span className="xs muted">{f.hint}</span>}
      </div>
    );
  }

  const body = (() => {
    switch (f.kind) {
      case 'textarea':
        return <textarea className={'ta' + invalid} rows={f.rows ?? 4} value={text} onChange={(e) => set(e.target.value)} />;
      case 'date':
        return <input className={'inp' + invalid} type="date" value={text} onChange={(e) => set(e.target.value)} />;
      case 'number':
        return <input className={'inp' + invalid} type="number" min={0} value={text} onChange={(e) => set(e.target.value)} />;
      case 'select':
        return (
          <select className={'sel' + invalid} value={text} onChange={(e) => set(e.target.value)}>
            <option value="">—</option>
            {f.options?.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        );
      case 'ref':
        return <RefSelect field={f} value={text} onChange={set} parent={parent} />;
      case 'verses':
        return <VersesEditor value={text} onChange={set} error={error} />;
      case 'member':
        return <WriterPick value={text} onChange={set} />;
      case 'richtext':
        return <RichText value={text} onChange={set} invalid={!!error} label={f.label} />;
      case 'color':
        return (
          <div className="row" style={{ gap: 8 }}>
            <input type="color" aria-label={f.label} value={/^#[0-9a-f]{6}$/i.test(text) ? text : '#0a6bff'}
              onChange={(e) => set(e.target.value)} style={{ width: 44, height: 34, padding: 2 }} />
            <input className={'inp' + invalid} value={text} placeholder="#0A6BFF" onChange={(e) => set(e.target.value)} />
          </div>
        );
      case 'url':
        return (
          <>
            <input className={'inp' + invalid} type="url" value={text} placeholder="https://" onChange={(e) => set(e.target.value)} />
            {/* A picture link is previewed so the office can see what members will. */}
            {/^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(text) && (
              <img src={text} alt="" style={{ marginTop: 8, maxHeight: 120, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--line)' }} />
            )}
          </>
        );
      default:
        return <input className={'inp' + invalid} value={text} onChange={(e) => set(e.target.value)} />;
    }
  })();

  return <Field label={<>{f.label}{f.required && <span style={{ color: 'var(--bad)' }}> *</span>}</>} hint={f.hint} error={error}>{body}</Field>;
}

/* ---------- the form, in a drawer ---------- */

function Editor({ def, row, onClose, onDone }: { def: TypeDef; row: Row | null; onClose: () => void; onDone: () => void }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const canPublish = can('content.publish');

  /* The publish flag has buttons of its own, so it is not a field in the form. */
  const fields = def.fields.filter((f) => f.key !== def.publish);

  const [values, setValues] = useState<Values>(() => {
    const v: Values = {};
    for (const f of fields) {
      const cur = row?.[f.key];
      v[f.key] = f.kind === 'toggle' ? (row ? !!cur : !!f.default)
        : cur === null || cur === undefined ? (!row && f.default !== undefined ? String(f.default) : '') : String(cur);
    }
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(publishAs?: boolean) {
    setBusy(true);
    setErrors({});
    setHint('');
    try {
      const body: Record<string, unknown> = { ...values };
      if (def.publish && publishAs !== undefined) body[def.publish] = publishAs;
      /* A new entry without a stated choice is a draft, not whatever the server defaults to. */
      if (def.publish && !row && publishAs === undefined) body[def.publish] = false;

      if (row) await api.patch(`/content/${def.id}/${row.id}`, body);
      else await api.post(`/content/${def.id}`, body);

      toast(
        publishAs === true ? `The ${def.singular} is live.`
          : publishAs === false && row ? `The ${def.singular} is taken down.`
            : `The ${def.singular} is saved.`,
      );
      onDone();
    } catch (e) {
      const err = e as ApiError;
      setErrors(err.errors ?? {});
      setHint(err.hint ?? '');
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!row) return;
    setBusy(true);
    try {
      await api.del(`/content/${def.id}/${row.id}`);
      toast(`The ${def.singular} is deleted.`, 'warn');
      onDone();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width="wide"
        title={row ? String(row[def.title] || `Edit ${def.singular}`) : `New ${def.singular}`}
        sub={row ? (row.live ? 'Live in the app' : def.publish ? 'A draft: members cannot see it' : '') : `Added to ${def.label}`}
        footer={
          <>
            {row && canPublish && (
              <Btn variant="danger" icon="trash" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</Btn>
            )}
            <span className="sp" style={{ flex: 1 }} />
            <Btn onClick={onClose}>Cancel</Btn>
            {def.publish ? (
              <>
                <Btn disabled={busy} onClick={() => save(row ? undefined : false)}>{row ? 'Save changes' : 'Save as draft'}</Btn>
                {canPublish && (row?.live
                  ? <Btn variant="danger" disabled={busy} onClick={() => save(false)}>Take down</Btn>
                  : <Btn variant="ok" icon="check" disabled={busy} onClick={() => save(true)}>{row ? 'Publish' : 'Save and publish'}</Btn>)}
              </>
            ) : (
              <Btn variant="ok" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save'}</Btn>
            )}
          </>
        }
      >
        <div className="stack">
          {hint && <Note tone="warn" icon="alert">{hint}</Note>}
          {!canPublish && def.publish && (
            <Note tone="mute" icon="lock">Your role can write this but not make it live. Save it as a draft.</Note>
          )}
          {fields.map((f, i) => {
            if (f.showIf && !f.showIf.in.includes(String(values[f.showIf.key] ?? ''))) return null;
            const input = (g: FieldDef) => (
              <Input key={g.key} f={g} v={values[g.key]} error={errors[g.key]}
                parent={g.refParent ? String(values[g.refParent.field] ?? '') : undefined}
                set={(v) => setValues((s) => {
                  const next = { ...s, [g.key]: v };
                  /* Changing the study clears a step that belonged to the old one. */
                  for (const d of fields) if (d.refParent?.field === g.key) next[d.key] = '';
                  return next;
                })} />
            );
            if (!f.group) return input(f);
            /* A group is drawn once, where its first field sits, folded away until it is needed. */
            if (fields.findIndex((x) => x.group === f.group) !== i) return null;
            const members = fields.filter((x) => x.group === f.group);
            return (
              <EmbedList key={'group-' + f.group} title={f.group} members={members} values={values}
                errors={errors} setValues={setValues} />
            );
          })}
        </div>
      </Drawer>

      <Confirm
        open={confirmDelete}
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={`Delete this ${def.singular}?`}
        confirmLabel="Delete it"
      >
        <p className="mt0">
          <b>{String(row?.[def.title] ?? '')}</b> will be removed for good. If it is live, members lose it
          straight away. To keep it but hide it, take it down instead.
        </p>
      </Confirm>
    </>
  );
}

/* ---------- one kind of content ---------- */

function TypeScreen({ def, source, lookup }: { def: TypeDef; source: string; lookup: (id: string) => TypeDef | undefined }) {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [state, setState] = useState<'' | 'live' | 'draft'>('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [bump, setBump] = useState(0);

  /* Fetched once per change, filtered here: every keystroke must not spend a
     Catalyst fetch. */
  const q = useQuery(() => api.get<List>(`/content/${def.id}`), [def.id, bump]);
  const all = q.data?.rows ?? [];

  const rows = useMemo(() => {
    const n = search.toLowerCase().trim();
    return all.filter((r) => {
      if (state === 'live' && !r.live) return false;
      if (state === 'draft' && r.live) return false;
      if (!n) return true;
      return def.fields.some((f) => (f.kind === 'text' || f.kind === 'textarea' || f.kind === 'richtext') && String(r[f.key] ?? '').toLowerCase().includes(n));
    });
  }, [all, search, state, def]);

  const langLabel = (v: unknown) =>
    def.fields.find((f) => f.kind === 'select' && /anguage/i.test(f.key))?.options?.find((o) => o.v === v)?.l ?? '';

  const columns: Column<Row>[] = [
    {
      key: def.title, label: def.label.replace(/s$/, ''),
      cell: (r) => (
        <>
          <b>{String(r[def.title] || '(untitled)')}</b>
          {r.from ? <> <Chip tone="plain">From {String(r.fromLabel)}</Chip></> : null}
        </>
      ),
      sortBy: (r) => String(r[def.title] ?? ''),
    },
    ...(def.dateKey ? [{
      key: def.dateKey, label: def.fields.find((f) => f.key === def.dateKey)?.label ?? 'Date', num: true,
      cell: (r: Row) => (asDate(r[def.dateKey!]) ? <span className="muted">{fd(asDate(r[def.dateKey!])!)}</span> : <span className="muted">—</span>),
      sortBy: (r: Row) => String(r[def.dateKey!] ?? ''),
    } as Column<Row>] : []),
    ...(def.columns ?? []).map((k): Column<Row> => {
      const fld = def.fields.find((x) => x.key === k)!;
      const show = (r: Row) =>
        fld.kind === 'ref' ? String(r[k + 'Label'] ?? '')
          : fld.kind === 'select' ? (fld.options?.find((o) => o.v === String(r[k]))?.l ?? '')
            : fld.kind === 'toggle' ? (r[k] ? 'Yes' : 'No')
              : String(r[k] ?? '');
      return { key: k, label: fld.label, cell: (r) => <span className={fld.kind === 'ref' ? undefined : 'muted'}>{show(r) || '—'}</span>, sortBy: (r) => show(r) };
    }),
    ...(def.fields.some((f) => f.kind === 'select' && /anguage/i.test(f.key))
      ? [{ key: 'lang', label: 'Language', cell: (r: Row) => <span className="muted">{langLabel(r[def.fields.find((f) => f.kind === 'select' && /anguage/i.test(f.key))!.key]) || '—'}</span> } as Column<Row>]
      : []),
    ...(def.publish ? [{
      key: 'live', label: 'Status',
      cell: (r: Row) => (r.live ? <Chip tone="ok" icon="check">Live</Chip> : <Chip tone="mute">Draft</Chip>),
      sortBy: (r: Row) => String(r.live),
    } as Column<Row>] : []),
  ];

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;

  const notReady = q.data?.notReady;
  const canWrite = can('content.edit') && !notReady;

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <p className="muted" style={{ margin: 0, flex: 1 }}>{def.intro}</p>
        <Btn variant="ok" icon="plus" disabled={!canWrite} onClick={() => setEditing('new')}>New {def.singular}</Btn>
      </div>

      {notReady && (
        <Note tone="warn" icon="alert">
          <b>Cannot be used yet.</b> {notReady.why}
          {notReady.hint && <><br /><span className="small">{notReady.hint}</span></>}
        </Note>
      )}
      {!notReady && source === 'catalyst' && (
        <p className="xs muted" style={{ margin: 0 }}>
          Saved to the Catalyst table <span className="mono">{def.table}</span>. If a save is refused, that table
          has not been given its columns yet; the message will say so.
        </p>
      )}

      <Kpis>
        <Kpi label={def.label} value={all.length} icon="layers" />
        {def.publish && <Kpi label="Live" value={all.filter((r) => r.live).length} icon="check" />}
        {def.publish && <Kpi label="Drafts" value={all.filter((r) => !r.live).length} icon="edit" />}
      </Kpis>

      {q.loading && !q.data ? (
        <div className="card"><Loading what={def.label.toLowerCase()} /></div>
      ) : (
        <Table
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          search={search}
          onSearch={setSearch}
          searchPlaceholder={`Search ${def.label.toLowerCase()}`}
          onRowClick={(r) => setEditing(r)}
          pageSize={25}
          toolbar={def.publish ? (
            <select className="sel" aria-label="Filter by status" value={state} onChange={(e) => setState(e.target.value as '' | 'live' | 'draft')}>
              <option value="">Everything</option>
              <option value="live">Live</option>
              <option value="draft">Drafts</option>
            </select>
          ) : undefined}
          empty={
            <Empty icon="layers" title={all.length ? 'Nothing matches' : `No ${def.label.toLowerCase()} yet`}>
              {all.length ? 'Try a wider search.' : notReady ? 'It cannot be filled until it is set up.' : `Add the first ${def.singular} with the button above.`}
            </Empty>
          }
        />
      )}

      {editing && (
        <Editor
          key={editing === 'new' ? 'new' : (editing.from ? 'from-' : '') + editing.id}
          def={editing !== 'new' && editing.from ? (lookup(String(editing.from)) ?? def) : def}
          row={editing === 'new' ? null : editing.from ? (editing.source as Row) : editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); setBump((n) => n + 1); }}
        />
      )}
    </div>
  );
}

/* ---------- a tab: one kind, or several behind a switcher ---------- */

export function ContentManager({ types }: { types: string[] }) {
  const [active, setActive] = useState(types[0]);
  const defs = useQuery(() => api.get<{ types: TypeDef[]; source: string }>('/content/types'), []);

  if (defs.error) return <Failed error={defs.error} onRetry={defs.reload} />;
  if (!defs.data) return <div className="card"><Loading what="this section" /></div>;

  const mine = types.map((id) => defs.data!.types.find((t) => t.id === id)).filter((t): t is TypeDef => !!t);
  const def = mine.find((t) => t.id === active) ?? mine[0];
  if (!def) return <Note tone="warn" icon="alert">Nothing is defined for this section.</Note>;

  return (
    <div className="stack">
      {mine.length > 1 && (
        <Seg value={def.id} onChange={setActive} options={mine.map((t) => ({ id: t.id, label: t.label }))} />
      )}
      <TypeScreen key={def.id} def={def} source={defs.data.source} lookup={(id) => defs.data!.types.find((t) => t.id === id)} />
    </div>
  );
}

