/* Content other members have reported.

   Different from the approval queue: this is already live, so leaving it is a
   decision too. "Clear" leaves it up; "Remove" takes it down. */

import { DecisionQueue, type DecisionRow } from '@/components/DecisionQueue';
import { Chip, Kpi, Note, Who } from '@/components/ui';

interface Flag extends DecisionRow {
  type: string; name: string; member: string; text: string; reports: number; reasons: string;
}

export default function Flagged() {
  return (
    <DecisionQueue<Flag>
      name="FLAGS"
      waiting="Open"
      states={['Open', 'Cleared', 'Removed']}
      sla={24}
      searchPlaceholder="Words in the content, or a member name"
      approveLabel="Clear and leave it up"
      rejectLabel="Remove it"
      emptyTitle="Nothing reported"
      intro={
        <Note tone="warn" icon="flag">
          <b>This content is live right now.</b> Other members reported it.
          Clearing leaves it where it is; removing takes it down and tells the
          member why.
        </Note>
      }
      extraKpis={(rows) => {
        const open = rows.filter((r) => r.state === 'Open');
        const many = open.filter((r) => r.reports >= 5).length;
        return (
          <>
            <Kpi label="Reported five times or more" value={many} icon="alert"
              tone={many ? 'bad' : undefined} detail="these first" />
            <Kpi label="Removed" value={rows.filter((r) => r.state === 'Removed').length} icon="trash" />
          </>
        );
      }}
      columns={[
        { key: 'type', label: 'What', width: 130, cell: (r) => <Chip>{r.type}</Chip> },
        { key: 'name', label: 'Posted by', cell: (r) => <Who name={r.name} sub={<span className="mono">{r.member}</span>} size="sm" /> },
        {
          key: 'text', label: 'Content',
          cell: (r) => (
            <span style={{ display: 'block', maxWidth: '46ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.text}
            </span>
          ),
        },
        {
          key: 'reports', label: 'Reports', num: true,
          cell: (r) => (
            <>
              <b className="tnum" style={r.reports >= 5 ? { color: 'var(--bad)' } : { color: 'var(--ink-3)' }}>{r.reports}</b>
              <span className="sub">{r.reasons}</span>
            </>
          ),
        },
      ]}
      drawerTitle={(r) => `${r.type} reported ${r.reports} times`}
      detail={(r) => (
        <>
          <div className="row wrap gap6 mb12">
            <Chip>{r.type}</Chip>
            <Chip tone={r.reports >= 5 ? 'bad' : 'warn'}>{r.reports} reports</Chip>
            <Chip tone="plain">{r.reasons}</Chip>
          </div>

          <div className="card pad">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65 }}>{r.text}</p>
          </div>

          <div className="mt16">
            <div className="sect-title">Posted by</div>
            <Who name={r.name} sub={<span className="mono">{r.member}</span>} />
          </div>

          <div className="mt16">
            <div className="sect-title">What was reported</div>
            <p className="muted">
              {r.reports} {r.reports === 1 ? 'member' : 'members'} reported this, most often as
              <b> {r.reasons.toLowerCase()}</b>.
            </p>
          </div>
        </>
      )}
      reasons={[
        'It advertises something for sale.',
        'It shares personal contact details publicly.',
        'It is unkind to another member.',
        'It is misleading.',
      ]}
    />
  );
}
