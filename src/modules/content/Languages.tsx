/* Content > Languages: the languages the app's content is translated into (server/routes/translation.js).

   Switch a language on and everything saved from then on is translated into it; Translate everything does what was written
   before. Members using the app in that language see the translation, and the original where there is none yet. */

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { useToast } from '@/components/layers';
import { Bar, Btn, Card, Chip, Failed, Kpi, Kpis, Loading, Note, Switch } from '@/components/ui';
import { fd } from '@/lib/format';

interface Lang { iso: string; code: number; name: string; native: string; on: boolean }
interface Coverage { id: string; label: string; originals: number; done: Record<string, number>; error?: string }
interface Job {
  running: boolean; languages: string[]; startedAt: string; finishedAt: string | null;
  total: number; done: number; made: number; failed: number; current: string; stopped?: string;
  failures: { what: string; lang: string; error: string }[];
}
interface Overview { ready: boolean; on: string[]; languages: Lang[]; kinds: string[]; coverage: Coverage[]; job: Job | null }

export default function Languages() {
  const { can } = useAuth();
  const { toast } = useToast();
  const q = useQuery(() => api.get<Overview>('/translation'), []);
  const [saving, setSaving] = useState('');
  const [starting, setStarting] = useState(false);
  const manage = can('content.publish');

  /* While everything is being translated, look again every few seconds. */
  const running = !!q.data?.job?.running;
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => q.reload(), 4000);
    return () => clearInterval(t);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;
  if (!q.data) return <div className="card"><Loading what="the languages" /></div>;
  const d = q.data;

  const total = d.coverage.reduce((n, c) => n + c.originals, 0);
  const doneIn = (iso: string) => d.coverage.reduce((n, c) => n + (c.done[iso] ?? 0), 0);
  const missing = d.on.reduce((n, iso) => n + (total - doneIn(iso)), 0);

  async function toggle(l: Lang, on: boolean) {
    setSaving(l.iso);
    try {
      const next = on ? [...d.on, l.iso] : d.on.filter((x) => x !== l.iso);
      await api.put('/translation/languages', { languages: next });
      toast(on ? `${l.name} is on. New and changed content will be translated into it.` : `${l.name} is off. Nothing new will be translated into it.`);
      q.reload();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setSaving('');
    }
  }

  async function translateEverything() {
    setStarting(true);
    try {
      const r = await api.post<{ job: Job }>('/translation/run', {});
      toast(r.job.total ? `Translating ${r.job.total} ${r.job.total === 1 ? 'entry' : 'entries'}.` : 'Everything is translated already.');
      q.reload();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setStarting(false);
    }
  }

  const job = d.job;
  const nameOf = (iso: string) => d.languages.find((l) => l.iso === iso)?.name ?? iso;

  return (
    <div className="stack">
      {!d.ready && <Note tone="warn" icon="globe">Translation is not connected yet, so nothing is being translated.</Note>}

      <Kpis>
        <Kpi label="Languages on" value={d.on.length} icon="globe" detail={d.on.map(nameOf).join(', ') || 'English only'} />
        <Kpi label="Entries" value={total} icon="book" detail={d.kinds.join(', ')} />
        <Kpi label="Still to translate" value={missing} icon="clock" tone={missing ? 'warn' : undefined}
          detail={d.on.length ? 'across the languages that are on' : 'switch a language on'} />
      </Kpis>

      {job && (job.running || (job.finishedAt && job.total > 0)) && (
        <Card
          title={job.running ? 'Translating everything' : 'Last time everything was translated'}
          sub={job.running ? job.current : `Finished ${fd(new Date(job.finishedAt!))}`}
        >
          <div className="stack" style={{ gap: 8 }}>
            <Bar value={job.done} max={Math.max(1, job.total)} tone={job.failed ? 'warn' : 'ok'} />
            <div className="muted">
              {job.done} of {job.total} entries · {job.made} translation{job.made === 1 ? '' : 's'} made
              {job.failed ? ` · ${job.failed} failed` : ''}
            </div>
            {job.stopped && <Note tone="bad">{job.stopped}</Note>}
            {!job.running && job.failures.length > 0 && (
              <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
                {job.failures.slice(0, 5).map((f, i) => <li key={i}>{f.what}{f.lang ? ` (${f.lang})` : ''}: {f.error}</li>)}
              </ul>
            )}
          </div>
        </Card>
      )}

      <Card
        title="Languages"
        sub="Members who use the app in one of these languages read the content in it."
        actions={manage && d.on.length > 0 && (
          <Btn icon="globe" disabled={!d.ready || starting || running || missing === 0} onClick={translateEverything}>
            {running ? 'Translating…' : 'Translate everything'}
          </Btn>
        )}
        flush
      >
        <div className="tscroll">
          <table className="t">
            <thead>
              <tr>
                <th>Language</th>
                <th>Translated</th>
                <th style={{ width: 90, textAlign: 'right' }}>On</th>
              </tr>
            </thead>
            <tbody>
              {d.languages.map((l) => {
                const done = doneIn(l.iso);
                return (
                  <tr key={l.iso}>
                    <td>
                      <b>{l.name}</b> <span className="muted">{l.native}</span>
                    </td>
                    <td style={{ minWidth: 180 }}>
                      {l.on ? (
                        <div className="row gap8" style={{ alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 80 }}><Bar value={done} max={Math.max(1, total)} tone={done < total ? 'warn' : 'ok'} /></div>
                          <span className="muted mono">{done} of {total}</span>
                        </div>
                      ) : done > 0 ? <span className="muted">{done} kept from before</span> : <Chip tone="mute">Off</Chip>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Switch checked={l.on} disabled={!manage || saving !== ''} label={`Translate into ${l.name}`} onChange={(v) => toggle(l, v)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {d.on.length > 0 && (
        <Card title="By kind of content" flush>
          <div className="tscroll">
            <table className="t">
              <thead>
                <tr>
                  <th>Content</th>
                  <th style={{ textAlign: 'right' }}>Entries</th>
                  {d.on.map((iso) => <th key={iso} style={{ textAlign: 'right' }}>{nameOf(iso)}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.coverage.map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.label}</b>{c.error && <span className="sub">Could not be read just now.</span>}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{c.originals}</td>
                    {d.on.map((iso) => {
                      const n = c.done[iso] ?? 0;
                      return (
                        <td key={iso} className="mono" style={{ textAlign: 'right' }}>
                          {c.originals === 0 ? <span className="muted">—</span> : n === c.originals ? <Chip tone="ok" icon="check">{n}</Chip> : <span>{n} <span className="muted">of {c.originals}</span></span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
