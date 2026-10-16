/* Identity videos from members who are already on the register.

   Separate from App registrations: that queue decides whether someone becomes
   a member at all. This one is the identity check for people who already are
   one, which the app's "Identity and consent" page feeds. */

import { DecisionQueue, type DecisionRow } from '@/components/DecisionQueue';
import { Chip, Icon, Kpi, Note, Who } from '@/components/ui';

interface VideoKyc extends DecisionRow {
  name: string; mobile: string; loc: string; secs: number; consent: boolean; attempt: number;
}

export default function VideoCheck() {
  return (
    <DecisionQueue<VideoKyc>
      name="VIDEOKYC"
      waiting="Pending"
      states={['Pending', 'Approved', 'Returned']}
      sla={24}
      searchPlaceholder="Name, number or congregation"
      approveLabel="Approve the video"
      rejectLabel="Return it"
      emptyTitle="No videos waiting"
      intro={
        <Note tone="mute" icon="video">
          These are existing members. New members registering through the app
          are in <b>App registrations</b>, where approving also creates the
          member record.
        </Note>
      }
      extraKpis={(rows) => {
        const retries = rows.filter((r) => r.state === 'Pending' && r.attempt > 1).length;
        return (
          <>
            <Kpi label="Second attempts" value={retries} icon="repeat"
              detail={retries ? 'already returned once' : 'none'} />
            <Kpi label="Approved" value={rows.filter((r) => r.state === 'Approved').length} icon="user-check" />
          </>
        );
      }}
      columns={[
        { key: 'name', label: 'Member', cell: (r) => <Who name={r.name} sub={<span className="mono">{r.mobile}</span>} /> },
        { key: 'loc', label: 'Congregation' },
        {
          key: 'secs', label: 'Video', num: true,
          cell: (r) => (
            <>
              {r.secs}s
              {r.attempt > 1 && <span className="sub">attempt {r.attempt}</span>}
            </>
          ),
        },
        {
          key: 'consent', label: 'Consent',
          cell: (r) => (r.consent ? <Chip tone="ok" icon="check">Given</Chip> : <Chip tone="bad">Missing</Chip>),
          sortBy: (r) => String(r.consent),
        },
      ]}
      drawerTitle={(r) => r.name}
      detail={(r) => (
        <>
          <div className="row wrap gap6 mb12">
            <Chip icon="pin">{r.loc}</Chip>
            <Chip tone={r.consent ? 'ok' : 'bad'} icon={r.consent ? 'check' : 'x'}>
              {r.consent ? 'Consent given' : 'Consent missing'}
            </Chip>
            {r.attempt > 1 && <Chip tone="warn">Attempt {r.attempt}</Chip>}
          </div>

          <div className="filebox video">
            <Icon name="video" />
            <div className="grow">
              <b>{r.id}.mp4</b>
              {r.secs} seconds · recorded on the front camera
            </div>
            <span className="chip plain">No file storage in this build</span>
          </div>

          <div className="mt16">
            <div className="sect-title">Check</div>
            <ul className="checks">
              <li className="unknown"><Icon name="minus" /><span className="grow">The face is visible throughout</span></li>
              <li className="unknown"><Icon name="minus" /><span className="grow">It matches the photograph on the register</span></li>
              <li className={r.secs >= 10 && r.secs <= 30 ? 'ok' : 'bad'}>
                <Icon name={r.secs >= 10 && r.secs <= 30 ? 'check' : 'alert'} />
                <span className="grow">Between 10 and 30 seconds ({r.secs}s)</span>
              </li>
              <li className={r.consent ? 'ok' : 'bad'}>
                <Icon name={r.consent ? 'check' : 'alert'} />
                <span className="grow">Consent recorded</span>
              </li>
            </ul>
          </div>

          <div className="mt16">
            <div className="sect-title">Member</div>
            <Who name={r.name} sub={<span className="mono">{r.mobile}</span>} />
          </div>
        </>
      )}
      reasons={[
        'The video is too dark. Please record it again in daylight.',
        'Your face is not visible for the whole recording.',
        'There is too much background noise to hear you.',
      ]}
    />
  );
}
