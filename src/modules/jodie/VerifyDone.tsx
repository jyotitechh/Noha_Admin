/* What has been verified lately, and by whom.

   Useful for two things: checking a decision someone questions, and seeing
   whether the four verifiers are deciding consistently. */

import { ListScreen } from '@/components/ListScreen';
import { Chip, Kpi, Kpis, Kv, Note, Who } from '@/components/ui';
import { fdt, pct } from '@/lib/format';

const STAGE_NAME: Record<string, string> = {
  I: 'Basic information', P: 'Photographs', E: 'Pastoral endorsement', Q: 'Questionnaire answers',
};

interface Decided {
  id: string; pid: string; name: string; stage: string;
  decision: string; by: string; at: Date; remark: string;
}

export default function VerifyDone() {
  return (
    <ListScreen<Decided>
      name="VERIF_DONE"
      what="decisions"
      sort={{ key: 'at', dir: 'desc' }}
      searchPlaceholder="Profile, verifier or words in the note"
      searchIn={(d) => `${d.name} ${d.by} ${d.remark} ${STAGE_NAME[d.stage] ?? d.stage}`}
      intro={
        <Note tone="mute" icon="history">
          Every decision is also in the audit log, with what changed. This view
          is the verifiers’ own record.
        </Note>
      }
      kpis={(rows) => {
        const approved = rows.filter((d) => d.decision === 'Approved').length;
        const verifiers = new Set(rows.map((d) => d.by));
        return (
          <Kpis>
            <Kpi label="Decisions" value={rows.length} icon="check-sq" detail="recently" />
            <Kpi label="Approved" value={`${pct(approved, rows.length)}%`} icon="check"
              detail={`${approved} of ${rows.length}`} />
            <Kpi label="Returned" value={rows.length - approved} icon="x" detail="sent back to the member" />
            <Kpi label="Verifiers" value={verifiers.size} icon="users" />
          </Kpis>
        );
      }}
      filters={(rows, set) => (
        <>
          <select className="sel" aria-label="Filter by stage" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.stage === v : () => true);
          }}>
            <option value="">Every stage</option>
            {Object.entries(STAGE_NAME).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <select className="sel" aria-label="Filter by verifier" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.by === v : () => true);
          }}>
            <option value="">Every verifier</option>
            {Array.from(new Set(rows.map((r) => r.by))).sort().map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </>
      )}
      columns={[
        { key: 'name', label: 'Profile', cell: (d) => <Who name={d.name} sub={<span className="mono">{d.pid}</span>} size="sm" /> },
        { key: 'stage', label: 'Stage', cell: (d) => <Chip tone="plain">{STAGE_NAME[d.stage] ?? d.stage}</Chip> },
        {
          key: 'decision', label: 'Decision',
          cell: (d) => (
            <Chip tone={d.decision === 'Approved' ? 'ok' : 'bad'} icon={d.decision === 'Approved' ? 'check' : 'x'}>
              {d.decision}
            </Chip>
          ),
        },
        {
          key: 'remark', label: 'Note to the member',
          cell: (d) => (
            <span className="muted" style={{ display: 'block', maxWidth: '46ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.remark || '—'}
            </span>
          ),
        },
        { key: 'by', label: 'By' },
        { key: 'at', label: 'When', num: true, cell: (d) => <span className="muted">{fdt(d.at)}</span> },
      ]}
      drawerTitle={(d) => `${STAGE_NAME[d.stage] ?? d.stage} · ${d.decision}`}
      drawerSub={(d) => <>{d.name} · {fdt(d.at)}</>}
      detail={(d) => (
        <>
          <div className="row wrap gap6 mb12">
            <Chip tone={d.decision === 'Approved' ? 'ok' : 'bad'} icon={d.decision === 'Approved' ? 'check' : 'x'}>
              {d.decision}
            </Chip>
            <Chip tone="plain">{STAGE_NAME[d.stage] ?? d.stage}</Chip>
          </div>
          <Kv rows={[
            ['Profile', <Who key="w" name={d.name} sub={<span className="mono">{d.pid}</span>} size="sm" />],
            ['Stage', STAGE_NAME[d.stage] ?? d.stage],
            ['Decision', d.decision],
            ['Decided by', d.by],
            ['When', fdt(d.at)],
          ]} />
          {d.remark && (
            <>
              <div className="sect-title">What the member was told</div>
              <div className="card pad"><p style={{ margin: 0 }}>“{d.remark}”</p></div>
            </>
          )}
        </>
      )}
      footNote="Newest first"
    />
  );
}
