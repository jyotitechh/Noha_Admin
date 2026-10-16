/* Praise reports: testimonies of what God has done.

   These go on the praise wall and into the swipeable Praises screen in the
   app, so they are read far more often than they are written. */

import { DecisionQueue, type DecisionRow } from '@/components/DecisionQueue';
import { Chip, Kpi, Note, Who } from '@/components/ui';

interface Praise extends DecisionRow {
  member: string; name: string; text: string; photos: number; likes: number;
}

export default function PraiseScreen() {
  return (
    <DecisionQueue<Praise>
      name="PRAISE"
      waiting="Pending"
      states={['Pending', 'Published', 'Rejected']}
      sla={24}
      searchPlaceholder="Words in the testimony, or a member name"
      approveLabel="Publish"
      rejectLabel="Reject"
      emptyTitle="Nothing to publish"
      intro={
        <Note tone="brand" icon="sparkles">
          Published praise reports appear on the praise wall and in the
          swipeable <b>Praises</b> screen in the app.
        </Note>
      }
      extraKpis={(rows) => (
        <>
          <Kpi label="Published" value={rows.filter((r) => r.state === 'Published').length} icon="check" />
          <Kpi label="With photographs" value={rows.filter((r) => r.photos > 0).length} icon="image"
            detail="look at these before publishing" />
        </>
      )}
      columns={[
        { key: 'name', label: 'Member', cell: (r) => <Who name={r.name} sub={<span className="mono">{r.member}</span>} size="sm" /> },
        {
          key: 'text', label: 'Testimony',
          cell: (r) => (
            <>
              <span style={{ display: 'block', maxWidth: '54ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.text}
              </span>
              {r.photos > 0 && <span className="sub">{r.photos} {r.photos === 1 ? 'photograph' : 'photographs'}</span>}
            </>
          ),
        },
      ]}
      drawerTitle={(r) => `Praise report from ${r.name}`}
      detail={(r) => (
        <>
          <div className="card pad">
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7 }}>{r.text}</p>
          </div>

          {r.photos > 0 && (
            <div className="mt16">
              <div className="sect-title">Photographs</div>
              <div className="row wrap gap6">
                {Array.from({ length: r.photos }).map((_, i) => (
                  <div key={i} className="filebox" style={{ width: 120, height: 92, justifyContent: 'center' }}>
                    <span className="xs">Photo {i + 1}</span>
                  </div>
                ))}
              </div>
              <p className="xs muted mt8">
                There is no file storage in this build, so the photographs are shown as placeholders.
              </p>
            </div>
          )}

          <div className="mt16">
            <div className="sect-title">Who gave it</div>
            <Who name={r.name} sub={<span className="mono">{r.member}</span>} />
          </div>

          {r.state === 'Published' && r.likes > 0 && (
            <div className="mt16">
              <Chip tone="ok" icon="heart">{r.likes} members have responded</Chip>
            </div>
          )}
        </>
      )}
      reasons={[
        'It names a doctor or hospital. Please send it again without that.',
        'It names someone else without their permission.',
        'Please shorten it a little for the praise wall.',
      ]}
    />
  );
}
