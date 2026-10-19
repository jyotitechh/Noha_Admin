/* Who holds which role in the Noah app.

   Everyone approved is an ordinary church member. This is where the office
   gives them more — pastor, cell leader, prayer warrior — and the app opens
   the matching features the next time they sign in.

   These are MEMBER roles, in the app. They are not the ten staff roles that
   govern this console; giving someone "pastor" here does not give them a
   console sign-in. */

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useToast, Drawer, Confirm } from '@/components/layers';
import { Table, type Column } from '@/components/Table';
import { Chip, Empty, Failed, Icon, Kpi, Kpis, Loading, Note, Seg, Switch, Who } from '@/components/ui';

interface RoleDef {
  id: string; label: string; desc: string;
  opens?: string[]; care?: string; always?: boolean;
}
interface Person {
  memberRowId: string; name: string; mobile: string; loc: string;
  approved: boolean; hasRolesRow: boolean;
  roles: string[]; restrictions: string[];
  isPastor: boolean; isLeader: boolean; isPrayerWarrior: boolean;
  features: string[];
}

export default function People() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pastor' | 'extra'>('all');
  const [open, setOpen] = useState<Person | null>(null);
  const [busy, setBusy] = useState('');
  /* Role id -> the value the office just clicked, before the server agrees. */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ role: RoleDef; on: boolean } | null>(null);

  const { toast } = useToast();

  const cat = useQuery(() => api.get<{ roles: RoleDef[]; restrictions: RoleDef[] }>('/app-roles/catalogue'), []);
  const people = useQuery(() => api.get<{ rows: Person[]; notInProject?: boolean; message?: string }>('/app-roles/people'), []);

  const roles = cat.data?.roles ?? [];
  const restrictions = cat.data?.restrictions ?? [];
  const all = people.data?.rows ?? [];

  const rows = useMemo(() => {
    let r = all;
    if (filter === 'pastor') r = r.filter((p) => p.isPastor);
    if (filter === 'extra') r = r.filter((p) => p.roles.length > 1 || p.restrictions.length);
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter((p) => [p.name, p.mobile, p.loc].some((v) => String(v ?? '').toLowerCase().includes(s)));
    }
    return r;
  }, [all, filter, search]);

  const stats = useMemo(() => ({
    pastors: all.filter((p) => p.isPastor).length,
    leaders: all.filter((p) => p.isLeader).length,
    warriors: all.filter((p) => p.isPrayerWarrior).length,
    plain: all.filter((p) => p.roles.length <= 1 && !p.restrictions.length).length,
  }), [all]);

  /* The switch moves the instant it is clicked, and goes back if the server
     refuses or the confirmation is cancelled.

     Writing to Catalyst takes a couple of seconds. Without this the switch
     sits still the whole time and the click feels like it did nothing. */
  async function toggle(person: Person, role: RoleDef, on: boolean) {
    setPending((p) => ({ ...p, [role.id]: on }));
    setBusy(role.id);
    try {
      const res = await api.post<Person & { changed: string }>(`/app-roles/${person.memberRowId}/${role.id}`, { on });
      /* Keep the drawer showing the truth the server just returned. */
      setOpen({ ...person, ...res });
      people.reload();
      toast(
        on
          ? `${person.name} is now ${role.label.toLowerCase()}. The app opens it next time they sign in.`
          : `${role.label} removed from ${person.name}.`,
        on ? 'ok' : 'warn',
      );
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      /* Clear the optimistic value either way: on success the server's
         answer is already in `open`, on failure this is the revert. */
      setPending((p) => { const next = { ...p }; delete next[role.id]; return next; });
      setBusy('');
    }
  }

  /** What the switch should show: the pending click, else the server truth. */
  const isOn = (person: Person, id: string) =>
    pending[id] ?? (person.roles.includes(id) || person.restrictions.includes(id));

  /** Asked to change something that needs confirming: move it, then ask. */
  function request(person: Person, role: RoleDef, on: boolean) {
    if (role.care && on) {
      setPending((p) => ({ ...p, [role.id]: true }));
      setConfirm({ role, on });
      return;
    }
    toggle(person, role, on);
  }

  function cancelConfirm() {
    if (confirm) setPending((p) => { const next = { ...p }; delete next[confirm.role.id]; return next; });
    setConfirm(null);
  }

  const columns: Column<Person>[] = [
    { key: 'name', label: 'Member', cell: (p) => <Who name={p.name} sub={<span className="mono">{p.mobile}</span>} /> },
    { key: 'loc', label: 'Congregation', cell: (p) => p.loc || <span className="muted">—</span> },
    {
      key: 'roles', label: 'Roles in the app',
      cell: (p) => (
        <span className="row wrap gap4">
          {p.roles.map((id) => {
            const r = roles.find((x) => x.id === id);
            return (
              <Chip key={id} tone={id === 'pastor' ? 'brand' : id === 'member' ? 'mute' : 'info'}>
                {r?.label ?? id}
              </Chip>
            );
          })}
          {p.restrictions.map((id) => {
            const r = restrictions.find((x) => x.id === id);
            return <Chip key={id} tone="bad" icon="ban">{r?.label ?? id}</Chip>;
          })}
        </span>
      ),
      sortBy: (p) => p.roles.length,
    },
  ];

  if (cat.error) return <Failed error={cat.error} onRetry={cat.reload} />;
  if (people.error) return <Failed error={people.error} onRetry={people.reload} />;

  if (people.data?.notInProject) {
    return (
      <div className="card">
        <Empty icon="db" title="Not in the connected project">{people.data.message}</Empty>
      </div>
    );
  }

  return (
    <div className="stack">
      <Note tone="brand" icon="mobile">
        <b>Everyone approved starts as an ordinary church member.</b> Anything
        more is given here, deliberately. The app opens the matching features
        the next time that person signs in.
        <br />
        <span className="small">
          These are roles in the member app. They do not give anyone a sign-in
          to this console — that is Staff and permissions.
        </span>
      </Note>

      <Kpis>
        <Kpi label="Pastors" value={stats.pastors} icon="user-check" detail="see their congregation" />
        <Kpi label="Cell leaders" value={stats.leaders} icon="users" />
        <Kpi label="Prayer warriors" value={stats.warriors} icon="shield"
          detail="see private prayer requests" />
        <Kpi label="Ordinary members" value={stats.plain} icon="user" detail="no extra roles" />
      </Kpis>

      {people.loading && !people.data ? (
        <div className="card"><Loading what="people and roles" /></div>
      ) : (
        <Table
          rows={rows}
          columns={columns}
          rowKey={(p) => p.memberRowId}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Name, number or congregation"
          onRowClick={setOpen}
          pageSize={25}
          toolbar={
            <Seg
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'all', label: 'Everyone', count: all.length },
                { id: 'extra', label: 'With extra roles', count: all.length - stats.plain },
                { id: 'pastor', label: 'Pastors', count: stats.pastors },
              ]}
            />
          }
          empty={<Empty icon="users" title="Nobody matches">Try a wider search.</Empty>}
        />
      )}

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        width="wide"
        title={open?.name ?? ''}
        sub={open ? <><span className="mono">{open.mobile}</span>{open.loc ? ` · ${open.loc}` : ''}</> : ''}
      >
        {open && (
          <>
            {!open.approved && (
              <div className="mb12">
                <Note tone="warn" icon="alert">
                  This person has not been approved yet, so the app will not open
                  for them whatever roles they are given.
                </Note>
              </div>
            )}

            <div className="sect-title">Roles</div>
            <div className="col gap6">
              {roles.map((role) => {
                const on = isOn(open, role.id);
                const saving = busy === role.id;
                return (
                  <div key={role.id} className="card" style={{ padding: '12px 14px' }}>
                    <div className="row top">
                      <div className="grow">
                        <b style={{ fontSize: 13.5 }}>
                          {role.label}
                          {role.always && <Chip tone="mute">always</Chip>}
                        </b>
                        <div className="small muted">{role.desc}</div>
                        {on && role.opens?.length ? (
                          <div className="row wrap gap4 mt8">
                            {role.opens.map((f) => <Chip key={f} tone="ok" icon="check">{f}</Chip>)}
                          </div>
                        ) : null}
                        {role.care && (
                          <div className="mt8">
                            <Note tone="warn" icon="alert"><span className="small">{role.care}</span></Note>
                          </div>
                        )}
                      </div>
                      <span className="row gap6">
                        {saving && <span className="xs muted">saving…</span>}
                        <Switch
                          checked={on}
                          disabled={!!role.always || saving}
                          label={`${role.label} for ${open.name}`}
                          onChange={(next) => request(open, role, next)}
                        />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sect-title">Restrictions</div>
            <div className="col gap6">
              {restrictions.map((r) => {
                const on = isOn(open, r.id);
                const saving = busy === r.id;
                return (
                  <div key={r.id} className="card" style={{ padding: '12px 14px' }}>
                    <div className="row top">
                      <div className="grow">
                        <b style={{ fontSize: 13.5 }}>{r.label}</b>
                        <div className="small muted">{r.desc}</div>
                      </div>
                      <span className="row gap6">
                        {saving && <span className="xs muted">saving…</span>}
                        <Switch
                          checked={on}
                          disabled={saving}
                          label={`${r.label} for ${open.name}`}
                          onChange={(next) => toggle(open, r, next)}
                        />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <hr className="div" />
            <div className="sect-title">What the app opens for them</div>
            {open.features.length ? (
              <div className="row wrap gap4">
                {open.features.map((f) => <Chip key={f} icon="mobile">{f}</Chip>)}
              </div>
            ) : (
              <p className="muted small">Nothing beyond the ordinary member app.</p>
            )}

            <Note tone="mute" icon="info">
              <Icon name="info" /> The app reads these when they sign in, so a
              change takes effect on their next sign-in.
            </Note>
          </>
        )}
      </Drawer>

      <Confirm
        open={!!confirm}
        onClose={cancelConfirm}
        onConfirm={() => open && confirm && toggle(open, confirm.role, confirm.on)}
        title={`Give ${open?.name ?? ''} the role of ${confirm?.role.label.toLowerCase() ?? ''}?`}
        confirmLabel={`Yes, make them ${confirm?.role.label.toLowerCase() ?? ''}`}
      >
        <p className="mt0">{confirm?.role.care}</p>
        {confirm?.role.opens?.length ? (
          <>
            <div className="sect-title">It opens</div>
            <div className="row wrap gap4">
              {confirm.role.opens.map((f) => <Chip key={f} tone="ok">{f}</Chip>)}
            </div>
          </>
        ) : null}
      </Confirm>
    </div>
  );
}
