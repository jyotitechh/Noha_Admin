/* Noahgram posts, reels, comments, profile photos and about-me text, waiting
   for a moderator. Nothing a member writes appears to anyone else until it
   has been through here — the app's terms page promises that. */

import { DecisionQueue, type DecisionRow } from '@/components/DecisionQueue';
import { Chip, Kpi, Note, Who } from '@/components/ui';

interface ModItem extends DecisionRow {
  type: string; member: string; name: string; text: string; cat: string; auto: string;
}

const TYPE_ICON: Record<string, string> = {
  Post: 'image', Reel: 'play', Comment: 'msg', 'About me': 'user', 'Profile photo': 'sil',
};

export default function Moderation() {
  return (
    <DecisionQueue<ModItem>
      name="MODQ"
      waiting="Pending"
      states={['Pending', 'Approved', 'Rejected']}
      sla={12}
      searchPlaceholder="Words in the post, or a member's name"
      approveLabel="Approve"
      rejectLabel="Reject"
      emptyTitle="Nothing to moderate"
      intro={
        <Note tone="brand" icon="chats">
          <b>Nothing here is visible to other members yet.</b> Posts, reels,
          comments, profile photographs and about-me text all wait for a
          moderator before they appear in Noahgram.
        </Note>
      }
      extraKpis={(rows) => {
        const pending = rows.filter((r) => r.state === 'Pending');
        const flagged = pending.filter((r) => r.auto).length;
        return (
          <>
            <Kpi label="Caught automatically" value={flagged} icon="zap"
              tone={flagged ? 'warn' : undefined} detail="look at these first" />
            <Kpi label="Approved today" value={rows.filter((r) => r.state === 'Approved').length} icon="check" />
          </>
        );
      }}
      columns={[
        {
          key: 'type', label: 'What', width: 140,
          cell: (r) => <Chip icon={TYPE_ICON[r.type] ?? 'file'}>{r.type}</Chip>,
        },
        { key: 'name', label: 'Member', cell: (r) => <Who name={r.name} sub={<span className="mono">{r.member}</span>} size="sm" /> },
        {
          key: 'text', label: 'Content',
          cell: (r) => (
            <>
              <span style={{ display: 'block', maxWidth: '50ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.text}
              </span>
              {r.auto && <span className="sub" style={{ color: 'var(--warn)' }}>Caught: {r.auto}</span>}
            </>
          ),
        },
      ]}
      drawerTitle={(r) => `${r.type} from ${r.name}`}
      detail={(r) => (
        <>
          <div className="row wrap gap6 mb12">
            <Chip icon={TYPE_ICON[r.type] ?? 'file'}>{r.type}</Chip>
            {r.cat && <Chip tone="plain">{r.cat}</Chip>}
            {r.auto && <Chip tone="warn" icon="zap">{r.auto}</Chip>}
          </div>

          <div className="card pad">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65 }}>{r.text}</p>
          </div>

          {r.auto && (
            <div className="mt16">
              <Note tone="warn" icon="zap">
                Flagged automatically for <b>{r.auto}</b>. The check is a filter,
                not a decision — read it and judge for yourself.
              </Note>
            </div>
          )}

          <div className="mt16">
            <div className="sect-title">Who posted it</div>
            <Who name={r.name} sub={<span className="mono">{r.member}</span>} />
          </div>
        </>
      )}
      reasons={[
        'It advertises something for sale.',
        'It shares a personal phone number publicly.',
        'It is off topic for this community.',
        'It repeats a post you have already made.',
        'It is unkind to another member.',
      ]}
    />
  );
}
