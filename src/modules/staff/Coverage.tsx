/* Every endpoint and the permission guarding it.

   The point is the claim that the console and the API agree. An endpoint with
   no permission against it is a hole: it would let any signed-in staff member
   call it, whatever their role. */

import { ListScreen } from '@/components/ListScreen';
import { Chip, Kpi, Kpis, Kv, Note } from '@/components/ui';
import { fdt, pct } from '@/lib/format';

interface Endpoint {
  id: string; method: string; path: string; perm: string;
  svc: string; tested: boolean; last: Date;
}

const METHOD_TONE: Record<string, 'ok' | 'info' | 'warn' | 'bad' | 'mute'> = {
  GET: 'info', POST: 'ok', PATCH: 'warn', PUT: 'warn', DELETE: 'bad',
};

export default function Coverage() {
  return (
    <ListScreen<Endpoint>
      name="ENDPOINTS"
      what="endpoints"
      searchPlaceholder="Path, method or permission"
      searchIn={(e) => `${e.method} ${e.path} ${e.perm} ${e.svc}`}
      pageSize={30}
      intro={
        <Note tone="brand" icon="shield-check">
          <b>Hiding a button is not security.</b> Every endpoint below checks a
          permission on the server, so a role that cannot see a screen also
          cannot call what sits behind it. An endpoint with no permission is a
          hole.
        </Note>
      }
      kpis={(rows) => {
        const guarded = rows.filter((e) => e.perm).length;
        const untested = rows.filter((e) => !e.tested).length;
        return (
          <Kpis>
            <Kpi label="Endpoints" value={rows.length} icon="server" />
            <Kpi label="Behind a permission" value={`${pct(guarded, rows.length)}%`} icon="lock"
              detail={`${guarded} of ${rows.length}`} />
            <Kpi label="Unguarded" value={rows.length - guarded} icon="alert"
              tone={rows.length - guarded ? 'bad' : undefined} detail="any signed-in staff could call these" />
            <Kpi label="Not yet tested" value={untested} icon="alert" tone={untested ? 'warn' : undefined} />
          </Kpis>
        );
      }}
      filters={(rows, set) => (
        <>
          <select className="sel" aria-label="Filter by method" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.method === v : () => true);
          }}>
            <option value="">Every method</option>
            {Array.from(new Set(rows.map((r) => r.method))).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="sel" aria-label="Filter by service" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.svc === v : () => true);
          }}>
            <option value="">Every service</option>
            {Array.from(new Set(rows.map((r) => r.svc))).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </>
      )}
      columns={[
        {
          key: 'method', label: 'Method', width: 90,
          cell: (e) => <Chip tone={METHOD_TONE[e.method] ?? 'mute'}>{e.method}</Chip>,
        },
        { key: 'path', label: 'Endpoint', cell: (e) => <span className="mono">{e.path}</span> },
        {
          key: 'perm', label: 'Needs',
          cell: (e) => (e.perm
            ? <span className="mono small">{e.perm}</span>
            : <Chip tone="bad" icon="alert">Nothing</Chip>),
        },
        { key: 'svc', label: 'Service', cell: (e) => <span className="muted">{e.svc}</span> },
        {
          key: 'tested', label: 'Tested',
          cell: (e) => (e.tested ? <Chip tone="ok" icon="check">Yes</Chip> : <Chip tone="warn">Not yet</Chip>),
          sortBy: (e) => String(e.tested),
        },
      ]}
      drawerTitle={(e) => <><span className="mono">{e.method}</span> {e.path}</>}
      drawerSub={(e) => e.svc}
      detail={(e) => (
        <>
          <div className="row wrap gap6 mb12">
            <Chip tone={METHOD_TONE[e.method] ?? 'mute'}>{e.method}</Chip>
            {e.perm ? <Chip tone="ok" icon="lock">{e.perm}</Chip> : <Chip tone="bad" icon="alert">No permission</Chip>}
            {e.tested ? <Chip tone="ok">Tested</Chip> : <Chip tone="warn">Not tested</Chip>}
          </div>
          <Kv rows={[
            ['Path', <span key="p" className="mono">{e.path}</span>],
            ['Method', e.method],
            ['Permission', e.perm ? <span key="x" className="mono">{e.perm}</span> : 'None — anyone signed in may call it'],
            ['Service', e.svc],
            ['Last checked', fdt(e.last)],
          ]} />
          {!e.perm && (
            <Note tone="bad" icon="alert">
              This endpoint has no permission against it. Any signed-in staff
              member, in any role, can call it. Fix this before release.
            </Note>
          )}
        </>
      )}
    />
  );
}
