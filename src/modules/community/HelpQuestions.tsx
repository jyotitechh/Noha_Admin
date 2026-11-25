/* What members asked the help bot in the app (Menu > Help), from FOR-CONSOLE-HELP-BOT.md.

   The bot answers from the FAQ files in Catalyst QuickML. When the FAQ has nothing, or the member says the answer did not
   help, the question is in "Needs attention": that is the office's to-do list for the FAQ. There is nothing to approve or
   reply to here; the member already got the answer, or the "Talk to us" button.

   The same question asked by many members is shown once with how often it was asked (lower case, spaces and the closing
   question mark ignored), so the office sees what to add first. */

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { Chip, Empty, Failed, Kpi, Kpis, Loading, Note } from '@/components/ui';

type Show = 'attention' | 'answered' | 'all';

interface Question {
  id: string; question: string; answer: string | null; answered: boolean; helpful: boolean | null;
  /* The API client turns the time into a Date. */
  problem: 'none' | 'unhelpful' | null; memberId: string | null; memberName: string; at: Date | string | null;
}

const when = (v: Date | string | null) => (v ? +new Date(v) : 0);

interface Group { key: string; latest: Question; all: Question[] }

/* India time, whatever the computer's clock is set to. */
const ist = (v: Date | string | null) => (v
  ? new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  : '');

const keyOf = (q: string) => q.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[\s?.!।]+$/u, '');

function Badge({ q }: { q: Question }) {
  if (q.problem === 'none') return <Chip tone="bad" icon="alert">No answer</Chip>;
  if (q.problem === 'unhelpful') return <Chip tone="warn" icon="x">Not helpful</Chip>;
  if (q.helpful === true) return <Chip tone="ok" icon="check">Helpful</Chip>;
  return <Chip tone="mute">Answered</Chip>;
}

export default function HelpQuestions() {
  const [show, setShow] = useState<Show>('attention');
  const [together, setTogether] = useState(true);
  const [search, setSearch] = useState('');

  const q = useQuery(() => api.get<{ rows: Question[]; needsAdminKey?: boolean }>(`/help-questions?show=${show}`), [show]);
  /* The to-do list, for the counts at the top whichever list is open. */
  const todo = useQuery(() => api.get<{ rows: Question[] }>('/help-questions?show=attention'), []);

  const groups = useMemo<Group[]>(() => {
    const s = search.trim().toLowerCase();
    const rows = (q.data?.rows ?? []).filter((r) => !s || r.question.toLowerCase().includes(s) || r.memberName.toLowerCase().includes(s));
    if (!together) return rows.map((r) => ({ key: r.id, latest: r, all: [r] }));
    const by = new Map<string, Group>();
    for (const r of rows) {
      const k = keyOf(r.question) || r.id;
      const g = by.get(k);
      if (g) g.all.push(r);
      else by.set(k, { key: k, latest: r, all: [r] });
    }
    /* Asked most often first, then the newest. */
    return [...by.values()].sort((a, b) => b.all.length - a.all.length || when(b.latest.at) - when(a.latest.at));
  }, [q.data, together, search]);

  const t = todo.data?.rows ?? [];
  const noAnswer = t.filter((r) => r.problem === 'none').length;
  const unhelpful = t.filter((r) => r.problem === 'unhelpful').length;
  const topics = new Set(t.map((r) => keyOf(r.question))).size;

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;
  if (q.data?.needsAdminKey) {
    return <Note tone="warn" icon="alert">The help bot's questions cannot be shown right now. Ask the administrator who looks after the console.</Note>;
  }

  return (
    <div className="stack">
      <Kpis>
        <Kpi label="Needs attention" value={t.length} icon="inbox" tone={t.length ? 'warn' : undefined} detail="to add to the FAQ" />
        <Kpi label="No answer" value={noAnswer} icon="alert" detail="the FAQ has nothing on it" />
        <Kpi label="Not helpful" value={unhelpful} icon="x" detail="the member said it did not help" />
        <Kpi label="Different questions" value={topics} icon="list" detail="the same question counted once" />
      </Kpis>

      <div className="card">
        <div className="row wrap gap8" style={{ padding: '12px 16px', alignItems: 'center' }}>
          <select className="sel" value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Which questions">
            <option value="attention">Needs attention ({t.length})</option>
            <option value="answered">Answered</option>
            <option value="all">All</option>
          </select>
          <input className="inp" style={{ maxWidth: 280 }} placeholder="A word in the question, or a name" value={search}
            onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
          <label className="row gap6 small" style={{ alignItems: 'center' }}>
            <input type="checkbox" checked={together} onChange={(e) => setTogether(e.target.checked)} />
            Same questions together
          </label>
          <span className="sp" style={{ flex: 1 }} />
          <span className="small muted">{together ? 'Asked most often first' : 'Newest first'}</span>
        </div>

        {q.loading && !q.data ? (
          <Loading what="the questions" />
        ) : groups.length === 0 ? (
          <Empty icon="check" title={show === 'attention' ? 'Nothing needs attention' : 'No questions here'}>
            {show === 'attention' ? 'The help bot had an answer for every question, and nobody said it did not help.' : search ? 'Nothing matches the search.' : 'No member has asked the help bot yet.'}
          </Empty>
        ) : (
          <ul className="list">
            {groups.map((g) => {
              const r = g.latest;
              const names = [...new Set(g.all.map((x) => x.memberName).filter(Boolean))];
              /* Of the ways it was asked, show one written properly (starting with a capital) when there is one. */
              const wording = g.all.find((x) => /^\p{Lu}/u.test(x.question))?.question ?? r.question;
              return (
                <li key={g.key} style={{ alignItems: 'flex-start' }}>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="row wrap gap6" style={{ marginBottom: 6 }}>
                      <Badge q={r} />
                      {g.all.length > 1 && <Chip tone="brand" icon="users">Asked {g.all.length} times</Chip>}
                    </span>
                    <b style={{ display: 'block', fontSize: 15.5, whiteSpace: 'pre-wrap' }}>{wording || '(no text)'}</b>
                    <span className="t2" style={{ display: 'block', marginTop: 2 }}>
                      {names.length ? names.slice(0, 4).join(', ') + (names.length > 4 ? ` and ${names.length - 4} more` : '') : 'A member'}
                      {' · '}{ist(r.at)}{g.all.length > 1 ? ' (latest)' : ''}
                    </span>
                    {r.answer && (
                      <span className="small" style={{ display: 'block', marginTop: 8, padding: '8px 10px', background: 'var(--wash)', borderRadius: 8, whiteSpace: 'pre-wrap' }}>
                        <span className="muted">The bot answered: </span>{r.answer}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
