/* The people with a sign-in to this console.

   Staff are members of the church. They sign in with the mobile number they
   registered with in the Noah app, and a super administrator decides what the
   console lets them do: finance, membership, content and so on.

   Where the access comes from is shown on every row, because it decides what
   can be done to it:

     catalyst       given here, in the console. Can be changed, suspended, revoked.
     catalyst-flag  the office made them a super administrator in Catalyst. Ours
                    to read, never to change.
     test           a fixed test account. Switched on and off by the server.
     sample         the prototype's fictional people, when there is no Catalyst.

   An override is a permission denied to one person despite their role: the
   second-approver rule on large payment batches, for instance. */

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useQuery } from '@/lib/useQuery';
import { useToast, Drawer } from '@/components/layers';
import { ListScreen } from '@/components/ListScreen';
import { Btn, Chip, Field, Icon, Kpi, Kpis, Kv, Note, Status, Who } from '@/components/ui';
import { fd, since } from '@/lib/format';

interface Staff {
  id: string; name: string; role: string; title: string; email: string; mobile?: string;
  status: string; from: Date | null; to: Date | null; lastIn: Date | null;
  mfa: boolean; locs: string[]; overrides: { p: string; mode: string; why: string }[];
  source?: 'catalyst' | 'catalyst-flag' | 'test' | 'sample'; grantedBy?: string;
}

interface Candidate { rowId: string; name: string; mobile: string; email: string; loc: string }
interface RoleInfo { id: string; name: string; desc: string }

const SOURCE: Record<string, { label: string; tone: 'ok' | 'info' | 'warn' | 'plain'; why: string }> = {
  catalyst: { label: 'Given here', tone: 'ok', why: 'A super administrator gave this access in the console.' },
  'catalyst-flag': { label: 'Set by the office', tone: 'info', why: 'The office made them a super administrator in Catalyst. It cannot be changed from here.' },
  test: { label: 'Test account', tone: 'warn', why: 'A fixed test account with a fixed code. It is switched on and off by the server.' },
  sample: { label: 'Sample', tone: 'plain', why: 'A fictional person from the sample data.' },
};

/** Pick a member and a role. Only approved members who are not staff yet appear. */
function GiveAccess({ open, onClose, roles, onDone }: {
  open: boolean; onClose: () => void; roles: RoleInfo[]; onDone: () => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [role, setRole] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [tableReady, setTableReady] = useState(true);
  const [needsCatalyst, setNeedsCatalyst] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api.get<{ rows: Candidate[]; tableReady?: boolean; needsCatalyst?: boolean }>(`/staff/candidates?q=${encodeURIComponent(q)}`)
        .then((r) => { setCands(r.rows); setTableReady(r.tableReady !== false); setNeedsCatalyst(!!r.needsCatalyst); })
        .catch((e) => toast((e as Error).message, 'bad'));
    }, 200);
    return () => clearTimeout(t);
  }, [open, q, toast]);

  function close() { setPicked(null); setRole(''); setTitle(''); setQ(''); onClose(); }

  async function give() {
    if (!picked || !role) return;
    setBusy(true);
    try {
      await api.post('/staff/grant', { memberRowId: picked.rowId, role, title: title.trim() || undefined });
      toast(`${picked.name} can now sign in with ${picked.mobile}.`);
      close();
      onDone();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const roleName = roles.find((r) => r.id === role)?.name;

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Give access to a member"
      sub="They sign in with the mobile number they registered with"
      footer={
        <>
          <span className="sp" style={{ flex: 1 }} />
          <Btn onClick={close}>Cancel</Btn>
          <Btn variant="ok" icon="user-check" disabled={!picked || !role || busy || !tableReady} onClick={give}>
            {busy ? 'Saving…' : 'Give access'}
          </Btn>
        </>
      }
    >
      {needsCatalyst && (
        <Note tone="warn" icon="alert">
          Giving access needs the Catalyst connection. The sample staff cannot be changed this way.
        </Note>
      )}
      {!needsCatalyst && !tableReady && (
        <Note tone="warn" icon="alert">
          <b>Not set up in Catalyst yet.</b> Roles are stored in a small table that the Catalyst
          developer needs to create, and the console has not been given its id. You can look at
          who would be offered, but not save. docs/CONSOLE-ACCESS.md has what to ask for.
        </Note>
      )}

      <div className="mt12">
        <Field label="Find a member" hint="Only approved members appear. Someone still waiting on registration cannot be given the console.">
          <input
            className="inp"
            value={q}
            autoFocus
            placeholder="Name or mobile number"
            onChange={(e) => { setQ(e.target.value); setPicked(null); }}
          />
        </Field>
      </div>

      {picked ? (
        <div className="card pad mt12">
          <div className="row" style={{ alignItems: 'center' }}>
            <Who name={picked.name} sub={<span className="mono">{picked.mobile}</span>} />
            <span className="sp" style={{ flex: 1 }} />
            <Btn onClick={() => setPicked(null)}>Change</Btn>
          </div>
        </div>
      ) : (
        <div className="card mt12" style={{ maxHeight: 260, overflow: 'auto' }}>
          {cands.length === 0 ? (
            <p className="small muted" style={{ padding: 16, margin: 0 }}>
              {q ? 'No approved member matches.' : 'No approved member is waiting to be given access.'}
            </p>
          ) : (
            <ul className="list">
              {cands.map((c) => (
                <li key={c.rowId} className="click" onClick={() => setPicked(c)}>
                  <span className="grow">
                    <span className="t1">{c.name}</span>
                    <span className="t2 mono">{c.mobile}{c.loc ? ` · ${c.loc}` : ''}</span>
                  </span>
                  <Icon name="chev-r" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {picked && (
        <>
          <div className="mt16">
            <Field label="What may they do?" hint="Each role is a fixed set of screens and actions.">
              <select className="sel" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">Choose a role…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            {role && <p className="small muted mt8">{roles.find((r) => r.id === role)?.desc}</p>}
          </div>
          <div className="mt16">
            <Field label="Job title" hint="Optional. Shown beside their name.">
              <input className="inp" value={title} placeholder={roleName || 'e.g. Accounts'} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          </div>
          {role === 'super' && (
            <div className="mt16">
              <Note tone="warn" icon="alert">
                A super administrator can see everything and give or take away anyone's access.
                Give it deliberately.
              </Note>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}

export default function Accounts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState('');
  const [bump, setBump] = useState(0);
  const [giving, setGiving] = useState(false);
  const [newRole, setNewRole] = useState<Record<string, string>>({});

  const meta = useQuery(() => api.get<{ roles: RoleInfo[]; dataSource?: string }>('/meta'), []);
  const roles = meta.data?.roles ?? [];
  const roleName = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r.name])), [roles]);
  const onCatalyst = meta.data?.dataSource === 'catalyst';

  async function act(s: Staff, path: string, body: object, done: string, tone: 'ok' | 'warn' = 'ok') {
    setBusy(s.id);
    try {
      await api.post(`/staff/${s.id}/${path}`, body);
      setBump((n) => n + 1);
      toast(done, tone);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <ListScreen<Staff>
        key={bump}
        name="STAFF"
        what="staff accounts"
        searchPlaceholder="Name, number or job title"
        searchIn={(s) => `${s.name} ${s.email} ${s.mobile ?? ''} ${s.title} ${s.role}`}
        intro={
          <div className="stack">
            <Note tone="mute" icon="key">
              {onCatalyst
                ? 'Staff are members. They sign in with the mobile number they registered with in the Noah app, and a super administrator decides what this console lets them do.'
                : 'Sign-in is a mobile number and one-time code in this build. Zoho single sign-on is not wired up; when it is, these accounts stay as they are and only the sign-in step changes.'}
            </Note>
            {user && user.perms.includes('staff.manage') && onCatalyst && (
              <div>
                <Btn variant="ok" icon="user-plus" onClick={() => setGiving(true)}>Give access to a member</Btn>
              </div>
            )}
          </div>
        }
        kpis={(rows) => (
          <Kpis>
            <Kpi label="Staff accounts" value={rows.length} icon="users" />
            <Kpi label="Active" value={rows.filter((s) => s.status === 'Active').length} icon="user-check" />
            <Kpi label="With an override" value={rows.filter((s) => s.overrides.length).length} icon="sliders"
              detail="a permission denied despite their role" />
            <Kpi label="Test accounts" value={rows.filter((s) => s.source === 'test').length} icon="key"
              tone={rows.some((s) => s.source === 'test') ? 'warn' : undefined}
              detail={rows.some((s) => s.source === 'test') ? 'switch off before going live' : 'none switched on'} />
          </Kpis>
        )}
        filters={(rows, set) => (
          <select className="sel" aria-label="Filter by role" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.role === v : () => true);
          }}>
            <option value="">Every role</option>
            {Array.from(new Set(rows.map((r) => r.role))).sort().map((r) => <option key={r} value={r}>{roleName[r] ?? r}</option>)}
          </select>
        )}
        columns={[
          {
            key: 'name', label: 'Person',
            cell: (s) => (
              <Who
                name={s.name}
                sub={<>{s.title}{s.mobile ? <> · <span className="mono">{s.mobile}</span></> : s.email ? ` · ${s.email}` : ''}{user?.id === s.id ? ' · you' : ''}</>}
              />
            ),
          },
          { key: 'role', label: 'Role', cell: (s) => <Chip tone="plain">{roleName[s.role] ?? s.role}</Chip> },
          {
            key: 'source', label: 'Access',
            cell: (s) => {
              const k = SOURCE[s.source ?? 'sample'];
              return <Chip tone={k.tone}>{k.label}</Chip>;
            },
            sortBy: (s) => s.source ?? '',
          },
          {
            key: 'lastIn', label: 'Last signed in', num: true,
            cell: (s) => (s.lastIn
              ? <span className="muted">{since(s.lastIn)}</span>
              /* Only access given here has a row to stamp a sign-in on. */
              : <span className="muted">{s.source === 'catalyst-flag' || s.source === 'test' ? 'not tracked' : 'never'}</span>),
            sortBy: (s) => s.lastIn ?? new Date(0),
          },
          { key: 'status', label: 'Status', cell: (s) => <Status>{s.status}</Status> },
        ]}
        drawerTitle={(s) => s.name}
        drawerSub={(s) => <>{s.title} · <span className="mono">{s.mobile || s.id}</span></>}
        detail={(s) => {
          const k = SOURCE[s.source ?? 'sample'];
          const editable = s.source === 'catalyst' && user?.id !== s.id;
          const pick = newRole[s.id] ?? s.role;
          return (
            <>
              <div className="row wrap gap6 mb12">
                <Status>{s.status}</Status>
                <Chip tone="plain">{roleName[s.role] ?? s.role}</Chip>
                <Chip tone={k.tone}>{k.label}</Chip>
                {user?.id === s.id && <Chip tone="brand">This is you</Chip>}
              </div>

              <Kv rows={[
                ['Mobile number', s.mobile ? <span key="m" className="mono">{s.mobile}</span> : '—'],
                ['Email', s.email || '—'],
                ['Job title', s.title || '—'],
                ['Role', roleName[s.role] ?? s.role],
                ['Access given', s.from ? fd(s.from) : '—'],
                ...(s.grantedBy ? [['Given by', s.grantedBy] as [string, string]] : []),
                ['Last signed in', s.lastIn ? since(s.lastIn) : (s.source === 'catalyst-flag' || s.source === 'test' ? 'Not tracked for this kind of access' : 'Never')],
              ]} />

              <p className="small muted mt12">{k.why}</p>

              {s.overrides.length > 0 && (
                <>
                  <div className="sect-title">Overrides</div>
                  <ul className="checks">
                    {s.overrides.map((o) => (
                      <li key={o.p} className="bad">
                        <Icon name="ban" />
                        <span className="grow">
                          <b>{o.mode === 'deny' ? 'Denied' : 'Granted'}</b> <span className="mono">{o.p}</span>
                          <span className="small muted" style={{ display: 'block' }}>{o.why}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Note tone="mute" icon="info">
                    An override beats the role. This person does not hold the
                    permission even though their role does.
                  </Note>
                </>
              )}

              {editable && (
                <>
                  <hr className="div" />
                  <div className="sect-title">Change their role</div>
                  <div className="row gap6">
                    <select className="sel" value={pick} onChange={(e) => setNewRole((m) => ({ ...m, [s.id]: e.target.value }))}>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <Btn
                      disabled={busy === s.id || pick === s.role}
                      onClick={() => act(s, 'role', { role: pick }, `${s.name} is now ${roleName[pick] ?? pick}. If they are signed in, it applies now.`)}
                    >
                      Save role
                    </Btn>
                  </div>

                  <div className="sect-title">Their access</div>
                  {s.status === 'Active' ? (
                    <Btn variant="danger" icon="lock" disabled={busy === s.id} onClick={() => act(s, 'status', { to: 'Suspended' }, `${s.name} is suspended and signed out.`, 'warn')}>
                      Suspend this access
                    </Btn>
                  ) : s.status === 'Suspended' ? (
                    <Btn variant="ok" icon="unlock" disabled={busy === s.id} onClick={() => act(s, 'status', { to: 'Active' }, `${s.name} can sign in again.`)}>
                      Re-enable this access
                    </Btn>
                  ) : null}
                  {s.status !== 'Revoked' && (
                    <Btn variant="danger" icon="ban" disabled={busy === s.id} onClick={() => act(s, 'revoke', {}, `${s.name}'s console access was removed.`, 'warn')}>
                      Remove their access
                    </Btn>
                  )}
                  <p className="xs muted mt8">
                    Suspending or removing signs them out at once. They stay a member of the church and keep
                    using the Noah app; only the console is closed to them. It is kept in the audit log.
                  </p>
                </>
              )}
              {s.source === 'catalyst' && user?.id === s.id && (
                <Note tone="mute" icon="info">You cannot change your own access.</Note>
              )}
            </>
          );
        }}
      />

      <GiveAccess
        open={giving}
        onClose={() => setGiving(false)}
        roles={roles}
        onDone={() => setBump((n) => n + 1)}
      />
    </>
  );
}
