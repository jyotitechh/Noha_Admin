/* The people with a sign-in to this console.

   An override is a permission denied to one person despite their role — the
   second-approver rule on large payment batches, for instance. */

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useToast } from '@/components/layers';
import { ListScreen } from '@/components/ListScreen';
import { Btn, Chip, Icon, Kpi, Kpis, Kv, Note, Status, Who } from '@/components/ui';
import { fd, since } from '@/lib/format';

interface Staff {
  id: string; name: string; role: string; title: string; email: string;
  status: string; from: Date; to: Date | null; lastIn: Date | null;
  mfa: boolean; locs: string[]; overrides: { p: string; mode: string; why: string }[];
}

export default function Accounts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState('');
  const [bump, setBump] = useState(0);

  async function setStatus(s: Staff, to: string) {
    setBusy(s.id);
    try {
      await api.post(`/staff/${s.id}/status`, { to });
      setBump((n) => n + 1);
      toast(`${s.name} is now ${to.toLowerCase()}.`, to === 'Active' ? 'ok' : 'warn');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy('');
    }
  }

  return (
    <ListScreen<Staff>
      key={bump}
      name="STAFF"
      what="staff accounts"
      searchPlaceholder="Name, email or job title"
      searchIn={(s) => `${s.name} ${s.email} ${s.title} ${s.role}`}
      intro={
        <Note tone="mute" icon="key">
          Sign-in is a local email and one-time code in this build. Zoho single
          sign-on is not wired up; when it is, these accounts stay as they are
          and only the sign-in step changes.
        </Note>
      }
      kpis={(rows) => (
        <Kpis>
          <Kpi label="Staff accounts" value={rows.length} icon="users" />
          <Kpi label="Active" value={rows.filter((s) => s.status === 'Active').length} icon="user-check" />
          <Kpi label="With an override" value={rows.filter((s) => s.overrides.length).length} icon="sliders"
            detail="a permission denied despite their role" />
          <Kpi label="Without two-step" value={rows.filter((s) => !s.mfa).length} icon="alert"
            tone={rows.some((s) => !s.mfa) ? 'warn' : undefined} />
        </Kpis>
      )}
      filters={(rows, set) => (
        <select className="sel" aria-label="Filter by role" onChange={(e) => {
          const v = e.target.value;
          set(v ? (r) => r.role === v : () => true);
        }}>
          <option value="">Every role</option>
          {Array.from(new Set(rows.map((r) => r.role))).sort().map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      columns={[
        {
          key: 'name', label: 'Person',
          cell: (s) => (
            <Who
              name={s.name}
              sub={<>{s.title} · {s.email}{user?.id === s.id ? ' · you' : ''}</>}
            />
          ),
        },
        { key: 'role', label: 'Role', cell: (s) => <Chip tone="plain">{s.role}</Chip> },
        {
          key: 'mfa', label: 'Two-step',
          cell: (s) => (s.mfa ? <Chip tone="ok" icon="check">On</Chip> : <Chip tone="warn" icon="alert">Off</Chip>),
          sortBy: (s) => String(s.mfa),
        },
        {
          key: 'overrides', label: 'Overrides', num: true,
          cell: (s) => (s.overrides.length ? <Chip tone="info">{s.overrides.length}</Chip> : <span className="muted">—</span>),
          sortBy: (s) => s.overrides.length,
        },
        {
          key: 'lastIn', label: 'Last signed in', num: true,
          cell: (s) => (s.lastIn ? <span className="muted">{since(s.lastIn)}</span> : <span className="muted">never</span>),
          sortBy: (s) => s.lastIn ?? new Date(0),
        },
        { key: 'status', label: 'Status', cell: (s) => <Status>{s.status}</Status> },
      ]}
      drawerTitle={(s) => s.name}
      drawerSub={(s) => <>{s.title} · <span className="mono">{s.id}</span></>}
      detail={(s) => (
        <>
          <div className="row wrap gap6 mb12">
            <Status>{s.status}</Status>
            <Chip tone="plain">{s.role}</Chip>
            {s.mfa ? <Chip tone="ok" icon="lock">Two-step on</Chip> : <Chip tone="warn" icon="unlock">Two-step off</Chip>}
            {user?.id === s.id && <Chip tone="brand">This is you</Chip>}
          </div>

          <Kv rows={[
            ['Email', s.email],
            ['Job title', s.title],
            ['Role', s.role],
            ['Joined', fd(s.from)],
            ['Last signed in', s.lastIn ? since(s.lastIn) : 'Never'],
            ['Congregations', s.locs.join(', ')],
          ]} />

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

          {user?.id !== s.id && (
            <>
              <hr className="div" />
              <div className="sect-title">Account</div>
              {s.status === 'Active' ? (
                <Btn variant="danger" icon="lock" disabled={busy === s.id} onClick={() => setStatus(s, 'Suspended')}>
                  Suspend this account
                </Btn>
              ) : (
                <Btn variant="ok" icon="unlock" disabled={busy === s.id} onClick={() => setStatus(s, 'Active')}>
                  Re-enable this account
                </Btn>
              )}
              <p className="xs muted mt8">
                A suspended account cannot sign in. Their work stays in the audit log.
              </p>
            </>
          )}
        </>
      )}
    />
  );
}
