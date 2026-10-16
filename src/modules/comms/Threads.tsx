/* What members have written to their pastor, their cell leader or the office.

   The app calls these Messages. Each one is a person waiting for an answer,
   so the age column is the point of the screen. */

import { ListScreen } from '@/components/ListScreen';
import { Age, Chip, Kpi, Kpis, Note, Status, Who, Icon } from '@/components/ui';
import { fdt, since } from '@/lib/format';

interface Thread {
  id: string; kind: string; to: string; member: string; name: string;
  last: string; at: Date; state: string; unread: boolean; assigned: string;
  msgs: { me: boolean; t: string; at: Date }[];
}

const KIND_ICON: Record<string, string> = { Pastor: 'user', Office: 'contact', Ministry: 'users' };

export default function Threads() {
  return (
    <ListScreen<Thread>
      name="THREADS"
      what="member threads"
      sort={{ key: 'at', dir: 'desc' }}
      searchPlaceholder="Member, recipient or words in the message"
      searchIn={(t) => `${t.name} ${t.to} ${t.last} ${t.kind}`}
      drawerWidth="wide"
      intro={
        <Note tone="mute" icon="msg">
          These come from <b>Messages</b> in the app. A member who writes to
          their pastor sees the reply in the same thread.
        </Note>
      }
      kpis={(rows) => {
        const open = rows.filter((t) => t.state === 'Open');
        const oldest = open.map((t) => t.at).sort((a, b) => +a - +b)[0] ?? null;
        return (
          <Kpis>
            <Kpi label="Waiting for a reply" value={open.length} icon="msg" tone={open.length > 6 ? 'warn' : undefined}
              detail={oldest ? <>oldest <Age at={oldest} warn={24} bad={48} /></> : 'none waiting'} />
            <Kpi label="Unread" value={rows.filter((t) => t.unread).length} icon="mail" />
            <Kpi label="For a pastor" value={open.filter((t) => t.kind === 'Pastor').length} icon="user"
              detail="pastoral, not office" />
            <Kpi label="Target" value="24 h" icon="clock" />
          </Kpis>
        );
      }}
      filters={(rows, set) => (
        <select className="sel" aria-label="Filter by who it is for" onChange={(e) => {
          const v = e.target.value;
          set(v ? (r) => r.kind === v : () => true);
        }}>
          <option value="">Everyone</option>
          {Array.from(new Set(rows.map((r) => r.kind))).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      )}
      columns={[
        {
          key: 'name', label: 'From',
          cell: (t) => (
            <Who
              name={t.name}
              size="sm"
              sub={<>{t.unread && <b style={{ color: 'var(--brand-ink)' }}>Unread · </b>}<span className="mono">{t.member}</span></>}
            />
          ),
        },
        {
          key: 'to', label: 'To', width: 190,
          cell: (t) => (
            <>
              <span className="acts-inline"><Icon name={KIND_ICON[t.kind] ?? 'msg'} />{t.to}</span>
              <span className="sub">{t.kind}</span>
            </>
          ),
        },
        {
          key: 'last', label: 'Message',
          cell: (t) => (
            <span style={{ display: 'block', maxWidth: '48ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.last}
            </span>
          ),
        },
        {
          key: 'at', label: 'Waiting', num: true,
          cell: (t) => (t.state === 'Open' ? <Age at={t.at} warn={24} bad={48} /> : <span className="muted">{since(t.at)}</span>),
        },
        { key: 'state', label: 'Status', cell: (t) => <Status>{t.state}</Status> },
      ]}
      drawerTitle={(t) => t.name}
      drawerSub={(t) => <>to {t.to} · {fdt(t.at)}</>}
      detail={(t) => (
        <>
          <div className="row wrap gap6 mb12">
            <Status>{t.state}</Status>
            <Chip icon={KIND_ICON[t.kind] ?? 'msg'}>{t.kind}</Chip>
            {t.assigned && <Chip tone="plain" icon="user-check">{t.assigned}</Chip>}
          </div>

          <div className="sect-title">The conversation</div>
          <div className="col gap14">
            {(t.msgs ?? []).map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.me ? 'flex-end' : 'flex-start',
                  maxWidth: '78%',
                  background: m.me ? 'var(--brand-soft)' : 'var(--wash-2)',
                  border: '1px solid ' + (m.me ? 'var(--brand-line)' : 'var(--line)'),
                  borderRadius: 12, padding: '10px 13px',
                }}
              >
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{m.t}</p>
                <span className="xs muted" style={{ display: 'block', marginTop: 5 }}>
                  {m.me ? 'The office' : t.name} · {since(m.at)}
                </span>
              </div>
            ))}
          </div>

          <Note tone="mute" icon="info">
            Replying from this console is not built yet. The thread, its history
            and who it is assigned to are all here; the compose box comes with
            the Broadcast and Push screens.
          </Note>
        </>
      )}
      footNote="Newest first"
    />
  );
}
