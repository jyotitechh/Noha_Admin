/* Comments members have reported, on Daily Manna and on Noahgram.

   Members can like, reply to and report a comment. One member reports one comment once, and never their own. When three different
   members have reported it, the app hides it for everybody; it stays in the table and nobody is told. The office decides here:

     Keep it     it was reported unfairly: the reports are cleared and, if it was hidden, it shows again
     Hide it     out of sight for members, but not removed
     Remove it   gone for good, and the Manna or post has one comment fewer

   Replies are shown with the comment they answer, because hiding a comment does not hide its replies. */

import { useState } from 'react';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useQueues } from '@/state/queues';
import { Confirm, useToast } from '@/components/layers';
import { Age, Btn, Chip, Empty, Failed, Kpi, Kpis, Loading, Who } from '@/components/ui';
import { since } from '@/lib/format';

interface Reply { id: string; author: { id: string; name: string }; text: string; hidden: boolean; at: Date | null }
interface Reported {
  id: string; kind: 'manna' | 'noahgram'; where: { id: string; title: string };
  author: { id: string; name: string }; text: string; reports: number; hidden: boolean; isReply: boolean;
  replies: Reply[]; at: Date | null;
}
type Action = 'keep' | 'hide' | 'remove';

const KIND = { manna: { label: 'Daily Manna', icon: 'book' }, noahgram: { label: 'Noahgram', icon: 'image' } } as const;

export default function ReportedComments() {
  const q = useQuery(() => api.get<{ rows: Reported[] }>('/reported-comments'), []);
  const [busy, setBusy] = useState('');
  const [removing, setRemoving] = useState<Reported | null>(null);
  const { toast } = useToast();
  const queues = useQueues();

  async function decide(c: Reported, action: Action) {
    setBusy(c.id);
    try {
      await api.post(`/reported-comments/${c.id}/decide`, { action });
      toast(
        action === 'keep' ? 'Kept. The reports are cleared and the comment shows again.'
          : action === 'hide' ? 'Hidden from members. It is not removed.' : 'Removed.',
        action === 'keep' ? 'ok' : 'warn',
      );
      q.reload(); queues.refresh();
    } catch (e) {
      toast((e as Error).message, 'bad');
      q.reload();
    } finally {
      setBusy('');
    }
  }

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;
  if (!q.data) return <div className="card"><Loading what="reported comments" /></div>;

  const rows = q.data.rows;
  const hidden = rows.filter((r) => r.hidden).length;
  const many = rows.filter((r) => r.reports >= 3).length;
  const oldest = rows.map((r) => r.at).filter(Boolean).sort((a, b) => +a! - +b!)[0] ?? null;

  return (
    <div className="stack">
      <Kpis>
        <Kpi label="Reported" value={rows.length} icon="flag" tone={rows.length ? 'warn' : undefined}
          detail={oldest ? <>oldest <Age at={oldest} warn={24} bad={72} /></> : 'nothing reported'} />
        <Kpi label="Hidden" value={hidden} icon="eye-off" />
        <Kpi label="Reported 3 times or more" value={many} icon="alert" tone={many ? 'bad' : undefined} />
      </Kpis>

      {rows.length === 0 ? (
        <div className="card"><Empty icon="check" title="Nothing reported" /></div>
      ) : (
        <ul className="list card">
          {rows.map((c) => (
            <li key={c.id} style={{ alignItems: 'flex-start' }}>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="row wrap gap6" style={{ marginBottom: 4 }}>
                  <Chip icon={KIND[c.kind].icon}>{KIND[c.kind].label}</Chip>
                  <Chip tone={c.reports >= 3 ? 'bad' : 'warn'} icon="flag">Reported {c.reports} {c.reports === 1 ? 'time' : 'times'}</Chip>
                  {c.hidden && <Chip tone="mute" icon="eye-off">Hidden from members</Chip>}
                  {c.isReply && <Chip tone="plain">Reply</Chip>}
                </span>
                <span className="t1" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{c.text || '(no text)'}</span>
                <span className="t2" style={{ display: 'block' }}>
                  <Who name={c.author.name} size="sm" sub={`${since(c.at)}${c.where.title ? ` · on “${c.where.title}”` : ''}`} />
                </span>
                {c.replies.length > 0 && (
                  <ul className="list mt8" style={{ marginLeft: 12 }}>
                    {c.replies.map((r) => (
                      <li key={r.id}>
                        <span className="grow">
                          <span className="t2"><b>{r.author.name}</b> replied{r.hidden ? ' (hidden)' : ''}: {r.text}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </span>
              <span className="row gap6 wrap">
                <Btn sm variant="ok" icon="check" disabled={busy === c.id} onClick={() => decide(c, 'keep')}>Keep it</Btn>
                {!c.hidden && <Btn sm icon="eye-off" disabled={busy === c.id} onClick={() => decide(c, 'hide')}>Hide it</Btn>}
                <Btn sm variant="danger" icon="trash" disabled={busy === c.id} onClick={() => setRemoving(c)}>Remove it</Btn>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Confirm
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && decide(removing, 'remove')}
        title="Remove this comment?"
        confirmLabel="Remove it"
        danger
      >
        <p style={{ marginTop: 0 }}>This comment will be removed.</p>
        {removing && <p className="muted small" style={{ whiteSpace: 'pre-wrap' }}>“{removing.text}”</p>}
      </Confirm>
    </div>
  );
}
