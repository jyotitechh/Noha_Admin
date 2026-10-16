/* The four checks a Jodie profile passes before it goes live.

   A profile is verified only when all four are approved, which is why the
   stage columns matter more than the row: one person can be waiting on one
   stage while three are already done. Returning a stage tells the member
   what to fix. */

import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, collection } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useQueues } from '@/state/queues';
import { useToast, Drawer } from '@/components/layers';
import { Table, type Column } from '@/components/Table';
import { Age, Btn, Chip, Field, Icon, Kpi, Kpis, Kv, Note, Who, Failed, Loading, Empty, Seg } from '@/components/ui';
import { fdt } from '@/lib/format';

type StageKey = 'I' | 'P' | 'E' | 'Q';

const STAGES: { key: StageKey; name: string; icon: string; what: string }[] = [
  { key: 'I', name: 'Basic information', icon: 'user', what: 'Name, age, education, work and congregation, against the ID document.' },
  { key: 'P', name: 'Photographs', icon: 'image', what: 'A clear single portrait that matches the ID. No group photos.' },
  { key: 'E', name: 'Pastoral endorsement', icon: 'shield-check', what: 'Confirmed by their pastor through a secure link.' },
  { key: 'Q', name: 'Questionnaire answers', icon: 'list', what: 'Answers consistent with the rest of the profile.' },
];

interface JProfile {
  id: string; noah: string; name: string; g: 'M' | 'F'; age: number; loc: string;
  denom: string; edu: string; job: string; height: number; mother: string; church: string;
  st: Record<StageKey, 'pend' | 'ok' | 'ret'>;
  stamps: Record<StageKey, Date>;
  verified: boolean; sub: string;
}

const STATE_CHIP = {
  pend: <Chip tone="warn">Waiting</Chip>,
  ok: <Chip tone="ok" icon="check">Approved</Chip>,
  ret: <Chip tone="bad" icon="x">Returned</Chip>,
};

export default function VerifyQueue() {
  /* /jverify/queue/P focuses one stage; the queue bell links that way. */
  const { '*': rest } = useParams();
  const fromUrl = (rest || '').split('/')[0] as StageKey;
  const [stage, setStage] = useState<StageKey | 'all'>(
    STAGES.some((s) => s.key === fromUrl) ? fromUrl : 'all',
  );
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<JProfile | null>(null);
  const [working, setWorking] = useState<StageKey | null>(null);
  const [returning, setReturning] = useState(false);
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);

  const { toast } = useToast();
  const queues = useQueues();
  const q = useQuery(() => collection<JProfile>('JPROFILES', { limit: 300 }), []);

  const all = q.data?.rows ?? [];

  const rows = useMemo(() => {
    let r = all.filter((p) => STAGES.some((s) => p.st[s.key] === 'pend'));
    if (stage !== 'all') r = r.filter((p) => p.st[stage] === 'pend');
    if (search.trim()) {
      const n = search.toLowerCase();
      r = r.filter((p) => `${p.name} ${p.id} ${p.loc} ${p.job}`.toLowerCase().includes(n));
    }
    return r.sort((a, b) => {
      const key = stage === 'all' ? (STAGES.find((s) => a.st[s.key] === 'pend')?.key ?? 'I') : stage;
      return +a.stamps[key] - +b.stamps[key];
    });
  }, [all, stage, search]);

  const counts = useMemo(() => {
    const c = {} as Record<StageKey, number>;
    for (const s of STAGES) c[s.key] = all.filter((p) => p.st[s.key] === 'pend').length;
    return c;
  }, [all]);

  async function decide(p: JProfile, key: StageKey, approve: boolean, why = '') {
    setBusy(true);
    try {
      const res = await api.post<{ profile: JProfile }>(`/jodie/${p.id}/stage/${key}`, { approve, remark: why });
      q.reload();
      queues.refresh();
      setOpen(res.profile);
      setReturning(false);
      setWorking(null);
      setRemark('');
      toast(
        approve
          ? res.profile.verified
            ? `${p.name} passed every stage. The profile is live.`
            : `${STAGES.find((s) => s.key === key)!.name} approved.`
          : `Returned to ${p.name}. They see your note in the app.`,
        approve ? 'ok' : 'warn',
      );
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<JProfile>[] = [
    { key: 'name', label: 'Profile', cell: (p) => <Who name={p.name} sub={<>{p.age} · {p.loc} · <span className="mono">{p.id}</span></>} /> },
    { key: 'job', label: 'Work and study', cell: (p) => <>{p.job}<span className="sub">{p.edu}</span></> },
    ...STAGES.map((s): Column<JProfile> => ({
      key: 'st' + s.key,
      label: <span title={s.name}><Icon name={s.icon} /></span>,
      width: 56,
      sortBy: (p) => p.st[s.key],
      cell: (p) => (
        <span
          title={`${s.name}: ${{ pend: 'waiting', ok: 'approved', ret: 'returned' }[p.st[s.key]]}`}
          style={{
            display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6,
            background: p.st[s.key] === 'ok' ? 'var(--ok-bg)' : p.st[s.key] === 'ret' ? 'var(--bad-bg)' : 'var(--warn-bg)',
            color: p.st[s.key] === 'ok' ? 'var(--ok)' : p.st[s.key] === 'ret' ? 'var(--bad)' : 'var(--warn)',
          }}
        >
          <Icon name={p.st[s.key] === 'ok' ? 'check' : p.st[s.key] === 'ret' ? 'x' : 'clock'} />
        </span>
      ),
    })),
    {
      key: 'waiting', label: 'Waiting', num: true,
      cell: (p) => {
        const key = stage === 'all' ? (STAGES.find((s) => p.st[s.key] === 'pend')?.key ?? 'I') : stage;
        return <Age at={p.stamps[key]} warn={48} bad={96} />;
      },
      sortBy: (p) => p.stamps[stage === 'all' ? 'I' : stage],
    },
  ];

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;

  return (
    <div className="stack">
      <Note tone="brand" icon="shield-check">
        <b>A profile goes live only when all four stages are approved.</b> Until
        then nobody sees it in the deck. Returning a stage sends the member back
        to fix that one thing, not the whole profile.
      </Note>

      <Kpis>
        {STAGES.map((s) => (
          <Kpi key={s.key} label={s.name} value={counts[s.key]} icon={s.icon}
            tone={counts[s.key] > 20 ? 'warn' : undefined} detail="waiting" />
        ))}
      </Kpis>

      {q.loading && !q.data ? (
        <div className="card"><Loading what="profiles" /></div>
      ) : (
        <Table
          rows={rows}
          columns={columns}
          rowKey={(p) => p.id}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Name, profile number, city or work"
          onRowClick={(p) => { setOpen(p); setWorking(stage === 'all' ? null : stage); }}
          pageSize={20}
          toolbar={
            <Seg
              value={stage}
              onChange={setStage}
              options={[
                { id: 'all' as const, label: 'Every stage' },
                ...STAGES.map((s) => ({ id: s.key, label: s.name.split(' ')[0], count: counts[s.key] })),
              ]}
            />
          }
          empty={<Empty icon="check" title="Nothing to verify">Every profile has been through this stage.</Empty>}
          footNote="Longest waiting first"
        />
      )}

      <Drawer
        open={!!open}
        onClose={() => { setOpen(null); setReturning(false); setRemark(''); setWorking(null); }}
        width="wide"
        title={open?.name ?? ''}
        sub={open ? <><span className="mono">{open.id}</span> · {open.age} · {open.loc}{open.verified ? ' · live' : ''}</> : ''}
        footer={
          open && working ? (
            returning ? (
              <>
                <span className="sp" style={{ flex: 1 }} />
                <Btn onClick={() => { setReturning(false); setRemark(''); }}>Cancel</Btn>
                <Btn variant="danger" disabled={!remark.trim() || busy} onClick={() => decide(open, working, false, remark.trim())}>
                  Return this stage
                </Btn>
              </>
            ) : (
              <>
                <span className="muted small">Deciding <b>{STAGES.find((s) => s.key === working)!.name}</b></span>
                <span className="sp" style={{ flex: 1 }} />
                <Btn variant="danger" icon="x" disabled={busy} onClick={() => setReturning(true)}>Return</Btn>
                <Btn variant="ok" icon="check" disabled={busy} onClick={() => decide(open, working, true)}>Approve</Btn>
              </>
            )
          ) : (
            <span className="muted small">Pick a stage below to decide it.</span>
          )
        }
      >
        {open && (
          <>
            {open.verified && (
              <div className="mb12">
                <Note tone="ok" icon="check">This profile has passed every stage and is live in the deck.</Note>
              </div>
            )}

            <div className="sect-title">The four stages</div>
            <div className="col gap6">
              {STAGES.map((s) => {
                const state = open.st[s.key];
                const active = working === s.key;
                return (
                  <button
                    key={s.key}
                    className="card"
                    onClick={() => { setWorking(s.key); setReturning(false); setRemark(''); }}
                    style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left',
                      padding: '12px 14px', cursor: 'pointer', width: '100%',
                      borderColor: active ? 'var(--brand)' : undefined,
                      boxShadow: active ? '0 0 0 3px rgba(167,25,200,.12)' : undefined,
                    }}
                  >
                    <span className={'qi ' + (state === 'ok' ? 'ok' : state === 'ret' ? 'bad' : 'warn')}>
                      <Icon name={s.icon} />
                    </span>
                    <span className="grow">
                      <b style={{ display: 'block', fontSize: 13.5 }}>{s.name}</b>
                      <span className="small muted">{s.what}</span>
                    </span>
                    {STATE_CHIP[state]}
                  </button>
                );
              })}
            </div>

            <hr className="div" />
            <div className="sect-title">What they said about themselves</div>
            <Kv rows={[
              ['Name', open.name],
              ['Age', `${open.age}`],
              ['Gender', open.g === 'M' ? 'Male' : 'Female'],
              ['City', open.loc],
              ['Education', open.edu],
              ['Work', open.job],
              ['Height', `${open.height} cm`],
              ['Mother tongue', open.mother],
              ['Denomination', open.denom],
              ['Church', open.church],
              ['Noah member', <span key="n" className="mono">{open.noah}</span>],
            ]} />

            {returning && (
              <div className="mt20">
                <Note tone="warn" icon="alert">
                  The member reads this in the app and fixes only this stage.
                </Note>
                <div className="mt12">
                  <Field label="What needs to change?" hint="Required.">
                    <textarea className="ta" rows={3} value={remark} autoFocus onChange={(e) => setRemark(e.target.value)} />
                  </Field>
                </div>
                <div className="row wrap gap6 mt12">
                  {[
                    'The photograph is a group photo. Please send a single portrait.',
                    'The name does not match the ID document.',
                    'Your pastor has not confirmed the endorsement link yet.',
                    'Some answers do not match the rest of your profile.',
                  ].map((t) => (
                    <button key={t} className="btn sm" onClick={() => setRemark(t)}>{t.slice(0, 34)}…</button>
                  ))}
                </div>
              </div>
            )}

            {working && !returning && (
              <div className="mt16">
                <Note tone="mute" icon="clock">
                  This stage has been waiting since {fdt(open.stamps[working])}.
                </Note>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
