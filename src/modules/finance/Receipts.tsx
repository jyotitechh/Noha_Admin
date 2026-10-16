/* Every gift received, and the 80G receipt for it. */

import { ListScreen } from '@/components/ListScreen';
import { Chip, Kpi, Kpis, Kv, Note, Status, Who } from '@/components/ui';
import { fdt, inr, inrS, num } from '@/lib/format';

interface Receipt {
  id: string; member: string; name: string; amt: number; gw: string; mode: string;
  towards: string; status: string; at: Date; pan: boolean; intl: boolean;
  ref: string; loc: string; by: string;
}

export default function Receipts() {
  return (
    <ListScreen<Receipt>
      name="RECEIPTS"
      what="receipts"
      sort={{ key: 'at', dir: 'desc' }}
      searchPlaceholder="Receipt number, member or reference"
      searchIn={(r) => `${r.id} ${r.name} ${r.ref} ${r.towards} ${r.mode}`}
      intro={
        <Note tone="mute" icon="receipt">
          Receipts are the ledger of record and post to Zoho Books. A gift given
          in the app arrives here within minutes of the gateway confirming it.
        </Note>
      }
      kpis={(rows) => {
        const paid = rows.filter((r) => r.status === 'Paid');
        const total = paid.reduce((n, r) => n + r.amt, 0);
        const needPan = paid.filter((r) => r.amt >= 2000 && !r.pan).length;
        return (
          <Kpis>
            <Kpi label="Received" value={inrS(total)} icon="rupee" detail={`${num(paid.length)} receipts`} />
            <Kpi label="Average gift" value={inrS(paid.length ? total / paid.length : 0)} icon="trend" />
            <Kpi label="Missing a PAN" value={needPan} icon="alert" tone={needPan ? 'warn' : undefined}
              detail="₹2,000 and over needs one for 80G" />
            <Kpi label="Cancelled" value={rows.filter((r) => r.status === 'Cancelled').length} icon="ban" />
          </Kpis>
        );
      }}
      filters={(rows, set) => (
        <>
          <select className="sel" aria-label="Filter by purpose" onChange={(e) => {
            const v = e.target.value;
            set(v ? (r) => r.towards === v : () => true);
          }}>
            <option value="">Every purpose</option>
            {Array.from(new Set(rows.map((r) => r.towards))).sort().map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </>
      )}
      columns={[
        { key: 'id', label: 'Receipt', cell: (r) => <span className="mono">{r.id}</span> },
        { key: 'name', label: 'Given by', cell: (r) => <Who name={r.name} sub={<span className="mono">{r.member}</span>} size="sm" /> },
        { key: 'towards', label: 'Towards', cell: (r) => <>{r.towards}<span className="sub">{r.loc}</span></> },
        {
          key: 'mode', label: 'How', width: 130,
          cell: (r) => <>{r.mode}<span className="sub">{r.gw}</span></>,
        },
        { key: 'amt', label: 'Amount', num: true, cell: (r) => <b className="tnum">{inr(r.amt)}</b> },
        { key: 'at', label: 'When', num: true, cell: (r) => <span className="muted">{fdt(r.at)}</span> },
        { key: 'status', label: 'Status', cell: (r) => <Status>{r.status}</Status> },
      ]}
      drawerTitle={(r) => inr(r.amt)}
      drawerSub={(r) => <><span className="mono">{r.id}</span> · {fdt(r.at)}</>}
      detail={(r) => (
        <>
          <div className="row wrap gap6 mb12">
            <Status>{r.status}</Status>
            <Chip tone="plain">{r.mode}</Chip>
            <Chip tone="plain">{r.gw}</Chip>
            {r.intl && <Chip tone="info" icon="globe">From outside India</Chip>}
            {r.amt >= 2000 && (
              r.pan
                ? <Chip tone="ok" icon="check">PAN on file</Chip>
                : <Chip tone="warn" icon="alert">No PAN</Chip>
            )}
          </div>

          <Kv rows={[
            ['Amount', <b key="a" style={{ fontSize: 17 }}>{inr(r.amt)}</b>],
            ['Towards', r.towards],
            ['Congregation', r.loc],
            ['Mode', `${r.mode}${r.gw && r.gw !== 'Offline' ? ` via ${r.gw}` : ''}`],
            ['Gateway reference', r.ref ? <span key="r" className="mono">{r.ref}</span> : <span key="n" className="muted">None, taken offline</span>],
            ['Receipted by', r.by],
          ]} />

          {r.amt >= 2000 && !r.pan && (
            <Note tone="warn" icon="alert">
              A gift of ₹2,000 or more needs a PAN before an 80G receipt can be
              issued. Ask the member for it before sending the receipt.
            </Note>
          )}

          <hr className="div" />
          <div className="sect-title">Given by</div>
          <Who name={r.name} sub={<span className="mono">{r.member}</span>} />
        </>
      )}
      footNote="Newest first"
    />
  );
}
