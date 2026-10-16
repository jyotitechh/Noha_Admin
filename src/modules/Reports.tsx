/* The report library.

   Reports are delivered in Zoho Analytics, so this screen lists what exists
   and who may run it rather than drawing the numbers itself. A report is
   visible only to roles holding its permission, the same rule as everywhere. */

import { ListScreen } from '@/components/ListScreen';
import { useAuth } from '@/state/auth';
import { Chip, Icon, Kpi, Kpis, Kv, Note } from '@/components/ui';
import { fdt, num, since } from '@/lib/format';

interface Report {
  id: string; name: string; app: string; area: string; perm: string;
  runs: number; last: Date; fav: boolean;
}

export default function Reports() {
  const { can } = useAuth();

  return (
    <ListScreen<Report>
      name="REPORTS"
      what="reports"
      searchPlaceholder="Report name or area"
      searchIn={(r) => `${r.name} ${r.app} ${r.area}`}
      pageSize={25}
      intro={
        <Note tone="mute" icon="pie">
          Reports run in Zoho Analytics against the same data this console
          shows. A report you cannot open is one your role does not hold the
          permission for.
        </Note>
      }
      kpis={(rows) => {
        const mine = rows.filter((r) => can(r.perm));
        return (
          <Kpis>
            <Kpi label="Reports" value={rows.length} icon="chart" />
            <Kpi label="You can run" value={mine.length} icon="check"
              detail={`${rows.length - mine.length} need another role`} />
            <Kpi label="Noah" value={rows.filter((r) => r.app === 'Noah').length} icon="users" />
            <Kpi label="Jodie" value={rows.filter((r) => r.app === 'Jodie').length} icon="heart" />
          </Kpis>
        );
      }}
      filters={(rows, set) => (
        <>
          <select className="sel" aria-label="Filter by application" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.app === v : () => true);
          }}>
            <option value="">Both applications</option>
            {Array.from(new Set(rows.map((r) => r.app))).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="sel" aria-label="Filter by area" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.area === v : () => true);
          }}>
            <option value="">Every area</option>
            {Array.from(new Set(rows.map((r) => r.area))).sort().map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </>
      )}
      columns={[
        {
          key: 'name', label: 'Report',
          cell: (r) => (
            <span className="acts-inline">
              {r.fav && <Icon name="star" title="A favourite" />}
              <span>
                {r.name}
                <span className="sub">{r.app} · {r.area}</span>
              </span>
            </span>
          ),
        },
        { key: 'runs', label: 'Run', num: true, cell: (r) => num(r.runs) },
        { key: 'last', label: 'Last run', num: true, cell: (r) => <span className="muted">{since(r.last)}</span> },
        {
          key: 'perm', label: 'Who may run it',
          cell: (r) => (can(r.perm)
            ? <Chip tone="ok" icon="check">You can</Chip>
            : <Chip tone="mute" icon="lock"><span className="mono">{r.perm}</span></Chip>),
          sortBy: (r) => String(can(r.perm)),
        },
      ]}
      drawerTitle={(r) => r.name}
      drawerSub={(r) => <>{r.app} · {r.area}</>}
      detail={(r) => (
        <>
          <div className="row wrap gap6 mb12">
            <Chip tone="plain">{r.app}</Chip>
            <Chip tone="plain">{r.area}</Chip>
            {r.fav && <Chip tone="brand" icon="star">Favourite</Chip>}
          </div>

          <Kv rows={[
            ['Application', r.app],
            ['Area', r.area],
            ['Needs', <span key="p" className="mono">{r.perm}</span>],
            ['Run', `${num(r.runs)} times`],
            ['Last run', fdt(r.last)],
          ]} />

          {can(r.perm) ? (
            <Note tone="ok" icon="check">
              Your role may run this. Opening it in Zoho Analytics is not wired
              up in this build.
            </Note>
          ) : (
            <Note tone="mute" icon="lock">
              Your role does not hold <span className="mono">{r.perm}</span>, so
              this report is listed but cannot be run.
            </Note>
          )}
        </>
      )}
    />
  );
}
