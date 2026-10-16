/* The permission grid.

   This is the one screen where a change here is a change on the server: the
   API reads the same role list, so taking a tick away stops the call, not
   just the button. The grid shows that plainly. */

import { Fragment, useState } from 'react';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/auth';
import { useToast } from '@/components/layers';
import { Card, Chip, Icon, Kpi, Kpis, Note, Failed, Loading } from '@/components/ui';
import { pct } from '@/lib/format';

interface Role { id: string; name: string; desc: string; perms: string[] }
interface Meta { roles: Role[]; permGroups: [string, [string, string][]][]; permLabels: Record<string, string> }

export default function Roles() {
  const { user, viewAs } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState('');

  const q = useQuery(() => api.get<Meta>('/meta'), []);

  async function toggle(role: Role, perm: string, on: boolean) {
    const key = role.id + perm;
    setBusy(key);
    try {
      await api.patch(`/roles/${role.id}`, { perm, on });
      q.reload();
      /* If you changed your own role, refresh what you can see. */
      if (user?.role === role.id) await viewAs(role.id);
      toast(
        on
          ? `${role.name} can now ${(q.data?.permLabels[perm] ?? perm).toLowerCase()}.`
          : `${role.name} can no longer ${(q.data?.permLabels[perm] ?? perm).toLowerCase()}.`,
        on ? 'ok' : 'warn',
      );
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy('');
    }
  }

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;
  if (!q.data) return <div className="card"><Loading what="roles" /></div>;

  const { roles, permGroups, permLabels } = q.data;
  const allPerms = Object.keys(permLabels);

  return (
    <div className="stack">
      <Note tone="warn" icon="shield">
        <b>These ticks are enforced, not cosmetic.</b> The API checks the same
        list on every call, so removing one stops the request as well as hiding
        the button. Changing your own role takes effect straight away.
      </Note>

      <Kpis>
        <Kpi label="Roles" value={roles.length} icon="key" />
        <Kpi label="Permissions" value={allPerms.length} icon="lock" detail={`in ${permGroups.length} groups`} />
        <Kpi label="Your role" value={user?.roleName ?? '—'} icon="user-check"
          detail={`${user?.perms.length ?? 0} of ${allPerms.length} held`} />
        <Kpi label="Fullest role" value={roles.reduce((a, b) => (a.perms.length > b.perms.length ? a : b)).name} icon="star" />
      </Kpis>

      <Card
        title="Who may do what"
        sub="A tick grants the permission to everyone holding that role"
        flush
      >
        <div className="permgrid" style={{ maxHeight: 620 }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Permission</th>
                {roles.map((r) => (
                  <th key={r.id} title={r.desc}>
                    <span style={{ display: 'block', maxWidth: 92, whiteSpace: 'normal', lineHeight: 1.25 }}>
                      {r.name}
                    </span>
                    <span className="xs muted" style={{ fontWeight: 600 }}>{pct(r.perms.length, allPerms.length)}%</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permGroups.map(([group, perms]) => (
                /* A group heading row plus its permissions, so the key goes on
                   the fragment rather than on either row. */
                <Fragment key={group}>
                  <tr className="grouphead">
                    <th colSpan={roles.length + 1} style={{ position: 'static' }}>{group}</th>
                  </tr>
                  {perms.map(([perm, label]) => (
                    <tr key={perm}>
                      <th title={perm}>
                        {label}
                        <span className="xs muted mono" style={{ display: 'block', fontWeight: 500 }}>{perm}</span>
                      </th>
                      {roles.map((r) => {
                        const on = r.perms.includes(perm);
                        const key = r.id + perm;
                        return (
                          <td key={r.id}>
                            <button
                              aria-label={`${label} for ${r.name}: ${on ? 'granted' : 'not granted'}`}
                              aria-pressed={on}
                              disabled={busy === key}
                              onClick={() => toggle(r, perm, !on)}
                              style={{
                                border: 0, background: 'transparent', padding: 4, borderRadius: 6,
                                color: on ? 'var(--ok)' : 'var(--ink-4)', opacity: busy === key ? 0.4 : 1,
                              }}
                            >
                              <Icon name={on ? 'check-sq' : 'minus'} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="g3">
        {roles.map((r) => (
          <Card key={r.id} title={r.name} sub={`${r.perms.length} of ${allPerms.length} permissions`}
            actions={user?.role === r.id ? <Chip tone="brand">You</Chip> : undefined}>
            <p className="small muted mt0">{r.desc}</p>
            <button className="btn sm mt8" onClick={() => viewAs(r.id)}>
              <Icon name="eye" /> View the console as this role
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
