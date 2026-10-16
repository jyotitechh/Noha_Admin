/* Everyone on Jodie, verified or not. */

import { ListScreen } from '@/components/ListScreen';
import { Chip, Icon, Kpi, Kpis, Kv, Note, Who } from '@/components/ui';
import { num, pct } from '@/lib/format';

type StageKey = 'I' | 'P' | 'E' | 'Q';
const STAGE_NAME: Record<StageKey, string> = {
  I: 'Basic information', P: 'Photographs', E: 'Pastoral endorsement', Q: 'Questionnaire',
};

interface JProfile {
  id: string; noah: string; name: string; g: 'M' | 'F'; age: number; loc: string;
  denom: string; edu: string; job: string; height: number; mother: string; church: string;
  st: Record<StageKey, 'pend' | 'ok' | 'ret'>; verified: boolean; sub: string;
}

export default function Profiles() {
  return (
    <ListScreen<JProfile>
      name="JPROFILES"
      what="Jodie profiles"
      searchPlaceholder="Name, profile number, city, work or church"
      searchIn={(p) => `${p.name} ${p.id} ${p.loc} ${p.job} ${p.edu} ${p.church} ${p.denom}`}
      drawerWidth="wide"
      intro={
        <Note tone="mute" icon="heart">
          A profile is in the deck only when it is verified and its membership
          is paid. Verification is in the tab before this one.
        </Note>
      }
      kpis={(rows) => {
        const verified = rows.filter((p) => p.verified).length;
        const paying = rows.filter((p) => p.sub && p.sub !== 'None').length;
        return (
          <Kpis>
            <Kpi label="Profiles" value={num(rows.length)} icon="users" />
            <Kpi label="Verified and live" value={num(verified)} icon="shield-check"
              detail={`${pct(verified, rows.length)}% of all profiles`} />
            <Kpi label="Subscribed" value={num(paying)} icon="repeat" detail="membership or premium" />
            <Kpi label="Cities" value={new Set(rows.map((p) => p.loc)).size} icon="pin" />
          </Kpis>
        );
      }}
      filters={(rows, set) => (
        <>
          <select className="sel" aria-label="Filter by verification" onChange={(e) => {
            const v = e.target.value;
            set(v === 'yes' ? (r) => r.verified : v === 'no' ? (r) => !r.verified : () => true);
          }}>
            <option value="">Verified or not</option>
            <option value="yes">Verified and live</option>
            <option value="no">Not yet live</option>
          </select>
          <select className="sel" aria-label="Filter by city" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.loc === v : () => true);
          }}>
            <option value="">Every city</option>
            {Array.from(new Set(rows.map((r) => r.loc))).sort().map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </>
      )}
      columns={[
        { key: 'name', label: 'Profile', cell: (p) => <Who name={p.name} sub={<>{p.age} · {p.g === 'M' ? 'Male' : 'Female'} · <span className="mono">{p.id}</span></>} /> },
        { key: 'loc', label: 'City', cell: (p) => <>{p.loc}<span className="sub">{p.denom}</span></> },
        { key: 'job', label: 'Work and study', cell: (p) => <>{p.job}<span className="sub">{p.edu}</span></> },
        {
          key: 'verified', label: 'In the deck',
          cell: (p) => (p.verified
            ? <Chip tone="ok" icon="check">Live</Chip>
            : <Chip tone="warn">{Object.values(p.st).filter((s) => s === 'ok').length} of 4 stages</Chip>),
          sortBy: (p) => String(p.verified),
        },
        {
          key: 'sub', label: 'Subscription',
          cell: (p) => (p.sub && p.sub !== 'None' ? <Chip tone="brand">{p.sub}</Chip> : <span className="muted">None</span>),
        },
      ]}
      drawerTitle={(p) => p.name}
      drawerSub={(p) => <><span className="mono">{p.id}</span> · {p.age} · {p.loc}</>}
      detail={(p) => (
        <>
          <div className="row wrap gap6 mb12">
            {p.verified ? <Chip tone="ok" icon="check">Verified and live</Chip> : <Chip tone="warn">Not yet live</Chip>}
            {p.sub && p.sub !== 'None' && <Chip tone="brand" icon="repeat">{p.sub}</Chip>}
            <Chip tone="plain">{p.denom}</Chip>
          </div>

          <div className="sect-title">Verification</div>
          <ul className="checks">
            {(Object.keys(STAGE_NAME) as StageKey[]).map((k) => (
              <li key={k} className={p.st[k] === 'ok' ? 'ok' : p.st[k] === 'ret' ? 'bad' : 'unknown'}>
                <Icon name={p.st[k] === 'ok' ? 'check' : p.st[k] === 'ret' ? 'x' : 'clock'} />
                <span className="grow">{STAGE_NAME[k]}</span>
                <span className="muted small">{{ ok: 'approved', ret: 'returned', pend: 'waiting' }[p.st[k]]}</span>
              </li>
            ))}
          </ul>

          <hr className="div" />
          <div className="sect-title">The profile</div>
          <Kv rows={[
            ['Age', `${p.age}`],
            ['Gender', p.g === 'M' ? 'Male' : 'Female'],
            ['Height', `${p.height} cm`],
            ['City', p.loc],
            ['Education', p.edu],
            ['Work', p.job],
            ['Mother tongue', p.mother],
            ['Denomination', p.denom],
            ['Church', p.church],
            ['Noah member', <span key="n" className="mono">{p.noah}</span>],
          ]} />
        </>
      )}
    />
  );
}
