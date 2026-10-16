/* The Daily Manna: the devotional the app opens on.

   The thing worth seeing at a glance is the days ahead that have nothing
   written yet, because the app shows whatever is published for the day and
   there is no second chance once the morning arrives.

   Each day is written once and published in seven languages. The language
   strip shows which translations are in. */

import { useMemo, useState } from 'react';
import { api, collection } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { useToast, Drawer } from '@/components/layers';
import { Table, type Column } from '@/components/Table';
import { Btn, Chip, Field, Icon, Kpi, Kpis, Kv, Note, Status, Failed, Loading, Empty } from '@/components/ui';
import { fd, fwd, num } from '@/lib/format';

const LANGS: [string, string][] = [
  ['en', 'English'], ['hi', 'Hindi'], ['mr', 'Marathi'], ['te', 'Telugu'],
  ['ml', 'Malayalam'], ['ta', 'Tamil'], ['kn', 'Kannada'],
];

interface MannaRow {
  id: string; date: Date; title: string; verse: string; cat: string;
  langs: Record<string, string>; status: string; author: string; views: number;
  updatedBy: string; updated: Date;
}

/** Which of the seven translations are in. */
function Langs({ langs }: { langs: Record<string, string> }) {
  return (
    <span className="acts-inline">
      {LANGS.map(([code, name]) => {
        const done = langs?.[code] === 'ok';
        return (
          <span
            key={code}
            title={`${name}: ${done ? 'in' : 'not yet'}`}
            className="mono xs"
            style={{
              padding: '1px 4px', borderRadius: 4, fontWeight: 700,
              background: done ? 'var(--ok-bg)' : 'var(--mute-bg)',
              color: done ? 'var(--ok)' : 'var(--ink-4)',
            }}
          >
            {code}
          </span>
        );
      })}
    </span>
  );
}

const isToday = (d: Date) => fd(d) === fd(new Date(2026, 9, 9));

export default function Manna() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<MannaRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ title: '', verse: '' });

  const { can } = useAuth();
  const { toast } = useToast();

  const q = useQuery(() => collection<MannaRow>('MANNA', { limit: 200, sort: 'date', dir: 'desc' }), []);

  const rows = useMemo(() => {
    let r = q.data?.rows ?? [];
    if (status) r = r.filter((m) => m.status === status);
    if (search.trim()) {
      const n = search.toLowerCase();
      r = r.filter((m) => (m.title + ' ' + m.verse + ' ' + m.cat).toLowerCase().includes(n));
    }
    return r;
  }, [q.data, status, search]);

  const stats = useMemo(() => {
    const all = q.data?.rows ?? [];
    const future = all.filter((m) => +m.date > +new Date(2026, 9, 9));
    return {
      published: all.filter((m) => m.status === 'Published').length,
      scheduled: all.filter((m) => m.status === 'Scheduled').length,
      /* The ones that matter: a future day with nothing written. */
      gaps: future.filter((m) => !m.title).length,
      partial: all.filter((m) => m.title && m.langs && Object.values(m.langs).filter((v) => v === 'ok').length < 7).length,
      today: all.find((m) => isToday(m.date)) ?? null,
    };
  }, [q.data]);

  async function publish(m: MannaRow) {
    setBusy(true);
    try {
      await api.post(`/manna/${m.id}/publish`);
      q.reload();
      setOpen(null);
      toast(`“${m.title}” is live. The app shows it on ${fd(m.date)}.`);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function save(m: MannaRow) {
    setBusy(true);
    try {
      await api.patch(`/manna/${m.id}`, draft);
      q.reload();
      setOpen(null);
      toast('Saved.');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<MannaRow>[] = [
    {
      key: 'date', label: 'Day', width: 160,
      cell: (m) => (
        <>
          <b>{fwd(m.date)}</b>
          {isToday(m.date) && <span className="sub" style={{ color: 'var(--brand-ink)', fontWeight: 700 }}>Today</span>}
        </>
      ),
    },
    {
      key: 'title', label: 'Devotional',
      cell: (m) => (m.title
        ? <>{m.title}<span className="sub">{m.verse} · {m.cat}</span></>
        : <span className="muted">Nothing written yet</span>),
    },
    { key: 'langs', label: 'Translations', cell: (m) => <Langs langs={m.langs} />, sortable: false },
    { key: 'views', label: 'Read by', num: true, cell: (m) => (m.views ? num(m.views) : <span className="muted">—</span>) },
    { key: 'status', label: 'Status', cell: (m) => <Status>{m.status}</Status> },
  ];

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;

  return (
    <div className="stack">
      {stats.gaps > 0 && (
        <Note tone="warn" icon="alert">
          <b>{stats.gaps} {stats.gaps === 1 ? 'day' : 'days'} ahead have nothing written.</b>{' '}
          The app shows whatever is published for the day, so a gap is a blank
          home screen for everyone that morning.
        </Note>
      )}

      <Kpis>
        <Kpi label="Today" value={stats.today?.title ? 'Ready' : 'Nothing'} icon="book-open"
          tone={stats.today?.title ? undefined : 'bad'}
          detail={stats.today?.title || 'the app has no devotional for today'} />
        <Kpi label="Days ahead with nothing" value={stats.gaps} icon="alert" tone={stats.gaps ? 'warn' : undefined} />
        <Kpi label="Scheduled" value={stats.scheduled} icon="clock" detail="written, not yet live" />
        <Kpi label="Missing translations" value={stats.partial} icon="globe"
          detail="fewer than seven languages" />
      </Kpis>

      {q.loading && !q.data ? (
        <div className="card"><Loading what="the Daily Manna" /></div>
      ) : (
        <Table
          rows={rows}
          columns={columns}
          rowKey={(m) => m.id}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Title, verse or category"
          onRowClick={(m) => { setOpen(m); setDraft({ title: m.title, verse: m.verse }); }}
          pageSize={20}
          toolbar={
            <select className="sel" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value="">Every day</option>
              <option value="Published">Published</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Draft">Draft</option>
            </select>
          }
          empty={<Empty icon="book" title="Nothing matches">Try a different search.</Empty>}
          footNote="Newest first"
        />
      )}

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        width="wide"
        title={open?.title || 'Nothing written yet'}
        sub={open ? <>{fwd(open.date)} · <span className="mono">{open.id}</span></> : ''}
        footer={
          open && (
            <>
              <span className="muted small">
                {open.status === 'Published'
                  ? `Live. Read by ${num(open.views)} members.`
                  : `Will appear in the app on ${fd(open.date)}.`}
              </span>
              <span className="sp" style={{ flex: 1 }} />
              {can('content.edit') && (
                <Btn icon="check" disabled={busy} onClick={() => save(open)}>Save</Btn>
              )}
              {can('content.publish') && open.status !== 'Published' && (
                <Btn variant="ok" icon="upload" disabled={busy || !draft.title.trim()} onClick={() => publish(open)}>
                  Publish
                </Btn>
              )}
            </>
          )
        }
      >
        {open && (
          <>
            <div className="dw-cols">
              <div>
                <Field label="Title" hint="What the app shows on the home card.">
                  <input className="inp" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </Field>
                <div className="mt16">
                  <Field label="Scripture reference" hint="Book, chapter and verse.">
                    <input className="inp" value={draft.verse} onChange={(e) => setDraft({ ...draft, verse: e.target.value })} />
                  </Field>
                </div>
              </div>

              <div>
                <div className="sect-title">Translations</div>
                <ul className="checks">
                  {LANGS.map(([code, name]) => {
                    const done = open.langs?.[code] === 'ok';
                    return (
                      <li key={code} className={done ? 'ok' : 'unknown'}>
                        <Icon name={done ? 'check' : 'minus'} />
                        <span className="grow">{name}</span>
                        {!done && <Chip tone="mute">Not yet</Chip>}
                      </li>
                    );
                  })}
                </ul>
                <Note tone="mute" icon="globe">
                  Scripture must come from a licensed Bible for each language,
                  never machine-translated. The hand-off doc says the same.
                </Note>
              </div>
            </div>

            <hr className="div" />

            <Kv rows={[
              ['Day in the app', fwd(open.date)],
              ['Category', open.cat],
              ['Status', <Status key="s">{open.status}</Status>],
              ['Written by', open.author],
              ['Last changed', <>{fd(open.updated)} by {open.updatedBy}</>],
              ['Read by', open.views ? `${num(open.views)} members` : 'not published yet'],
            ]} />
          </>
        )}
      </Drawer>
    </div>
  );
}
