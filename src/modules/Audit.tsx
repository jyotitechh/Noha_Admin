/* Everything done in this console: who, what, when, and from where.

   Entries written during this session are marked, so you can see your own
   work land in the log as you do it. */

import { ListScreen } from '@/components/ListScreen';
import { Chip, Icon, Kpi, Kpis, Kv, Note, Who } from '@/components/ui';
import { fdt, since } from '@/lib/format';

interface Entry {
  id: string; at: Date; actor: string; role: string; action: string; mod: string;
  rec: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  remark: string; ip: string; live?: boolean;
}

/** Before and after, field by field. */
function Diff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  if (!keys.length) return <p className="muted small">Nothing was changed on the record itself.</p>;

  return (
    <table className="t" style={{ width: '100%' }}>
      <thead>
        <tr><th>Field</th><th>Before</th><th>After</th></tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k}>
            <td><b>{k}</b></td>
            <td className="muted">{before && k in before ? String(before[k]) : <span className="muted">—</span>}</td>
            <td><b>{after && k in after ? String(after[k]) : <span className="muted">—</span>}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Audit() {
  return (
    <ListScreen<Entry>
      name="AUD"
      what="the audit log"
      searchPlaceholder="Person, action, record or area"
      searchIn={(a) => `${a.actor} ${a.action} ${a.mod} ${a.rec} ${a.role} ${a.remark}`}
      pageSize={30}
      drawerWidth="wide"
      intro={
        <Note tone="mute" icon="history">
          Every change made in this console is recorded here, including reading
          a member’s contact details. Entries cannot be edited or removed.
        </Note>
      }
      kpis={(rows) => {
        const thisSession = rows.filter((a) => a.live).length;
        const people = new Set(rows.map((a) => a.actor));
        return (
          <Kpis>
            <Kpi label="Entries" value={rows.length} icon="history" />
            <Kpi label="From this session" value={thisSession} icon="zap"
              detail={thisSession ? 'your work, as you do it' : 'nothing yet'} />
            <Kpi label="People" value={people.size} icon="users" />
            <Kpi label="Latest" value={rows[0] ? since(rows[0].at) : '—'} icon="clock"
              detail={rows[0]?.action} />
          </Kpis>
        );
      }}
      filters={(rows, set) => (
        <>
          <select className="sel" aria-label="Filter by area" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.mod === v : () => true);
          }}>
            <option value="">Every area</option>
            {Array.from(new Set(rows.map((r) => r.mod))).sort().map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="sel" aria-label="Filter by person" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.actor === v : () => true);
          }}>
            <option value="">Everyone</option>
            {Array.from(new Set(rows.map((r) => r.actor))).sort().map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </>
      )}
      columns={[
        {
          key: 'at', label: 'When', width: 150,
          cell: (a) => (
            <>
              <span className={a.live ? '' : 'muted'}>{fdt(a.at)}</span>
              {a.live && <span className="sub" style={{ color: 'var(--brand-ink)', fontWeight: 700 }}>This session</span>}
            </>
          ),
        },
        { key: 'actor', label: 'Who', cell: (a) => <Who name={a.actor} sub={a.role} size="sm" /> },
        { key: 'action', label: 'What', cell: (a) => <b style={{ fontWeight: 600 }}>{a.action}</b> },
        { key: 'mod', label: 'Area', cell: (a) => <Chip tone="plain">{a.mod}</Chip> },
        { key: 'rec', label: 'Record', cell: (a) => <span className="mono small">{a.rec}</span> },
        { key: 'ip', label: 'From', cell: (a) => <span className="mono muted small">{a.ip}</span>, sortable: false },
      ]}
      drawerTitle={(a) => a.action}
      drawerSub={(a) => <>{a.actor} · {fdt(a.at)}</>}
      detail={(a) => (
        <>
          <div className="row wrap gap6 mb12">
            <Chip tone="plain">{a.mod}</Chip>
            {a.live && <Chip tone="brand" icon="zap">This session</Chip>}
          </div>

          <Kv rows={[
            ['Action', a.action],
            ['Record', <span key="r" className="mono">{a.rec}</span>],
            ['Who', <Who key="w" name={a.actor} sub={a.role} size="sm" />],
            ['When', fdt(a.at)],
            ['From', <span key="i" className="mono">{a.ip}</span>],
            ...(a.remark ? [['Note', a.remark] as [string, React.ReactNode]] : []),
          ]} />

          <div className="sect-title">What changed</div>
          <Diff before={a.before} after={a.after} />

          <Note tone="mute" icon="lock">
            <Icon name="info" /> Audit entries are written once. Nothing in this
            console can change or remove one.
          </Note>
        </>
      )}
      footNote="Newest first"
    />
  );
}
