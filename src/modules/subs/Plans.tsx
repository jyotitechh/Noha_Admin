/* The plans and add-ons members can buy in Jodie.

   The prices here must match what the app shows and what the store listings
   say, because Apple and Razorpay each hold their own copy of the product. */

import { useQuery } from '@/lib/useQuery';
import { collection } from '@/lib/api';
import { Card, Chip, Icon, Kpi, Kpis, Kv, Note, Failed, Loading } from '@/components/ui';
import { Table } from '@/components/Table';
import { inr, inrS, num } from '@/lib/format';

interface Plan {
  id: string; cat: string; name: string; price: number; period: string; gst: number;
  apple: string; rzp: string; active: boolean; subs: number; ent: string[];
}
interface Addon { id: string; name: string; price: number; period: string; gst: number; apple: string; active: boolean; subs: number }

export default function Plans() {
  const plans = useQuery(() => collection<Plan>('PLANS', { limit: 50 }), []);
  const addons = useQuery(() => collection<Addon>('ADDONS', { limit: 50 }), []);

  if (plans.error) return <Failed error={plans.error} onRetry={plans.reload} />;
  if (!plans.data) return <div className="card"><Loading what="plans" /></div>;

  const rows = plans.data.rows;
  const revenue = rows.reduce((n, p) => n + p.price * p.subs, 0);

  return (
    <div className="stack">
      <Note tone="warn" icon="alert">
        <b>A price here is not the only copy of it.</b> Apple and Razorpay each
        hold their own product record. Changing a price means changing it in
        all three, or members will be charged the old one.
      </Note>

      <Kpis>
        <Kpi label="Plans" value={rows.length} icon="layers" detail={`${rows.filter((p) => p.active).length} on sale`} />
        <Kpi label="Subscribers" value={num(rows.reduce((n, p) => n + p.subs, 0))} icon="users" />
        <Kpi label="Current value" value={inrS(revenue)} icon="rupee" detail="at current prices" />
        <Kpi label="Add-ons" value={addons.data?.rows.length ?? 0} icon="plus" />
      </Kpis>

      <div className="g3">
        {rows.map((p) => (
          <Card
            key={p.id}
            title={<>{p.name} <Chip tone="plain">{p.cat}</Chip></>}
            sub={p.period}
            actions={p.active ? <Chip tone="ok" icon="check">On sale</Chip> : <Chip tone="mute">Withdrawn</Chip>}
          >
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>{inr(p.price)}</div>
            <p className="small muted mt4 mb12">
              including {p.gst}% GST · {num(p.subs)} {p.subs === 1 ? 'subscriber' : 'subscribers'}
            </p>
            <ul className="checks">
              {p.ent.map((e) => (
                <li key={e} className="ok"><Icon name="check" /><span className="grow">{e}</span></li>
              ))}
            </ul>
            <hr className="div" />
            <Kv rows={[
              ['Apple product', <span key="a" className="mono xs">{p.apple}</span>],
              ['Razorpay plan', <span key="r" className="mono xs">{p.rzp}</span>],
            ]} />
          </Card>
        ))}
      </div>

      <Table
        title="Add-ons"
        rows={addons.data?.rows ?? []}
        rowKey={(a) => a.id}
        pageSize={0}
        columns={[
          { key: 'name', label: 'Add-on' },
          { key: 'price', label: 'Price', num: true, cell: (a) => inr(a.price) },
          { key: 'period', label: 'Lasts' },
          { key: 'gst', label: 'GST', num: true, cell: (a) => `${a.gst}%` },
          { key: 'subs', label: 'Bought', num: true, cell: (a) => num(a.subs) },
          { key: 'apple', label: 'Apple product', cell: (a) => <span className="mono xs">{a.apple}</span> },
          {
            key: 'active', label: 'On sale',
            cell: (a) => (a.active ? <Chip tone="ok" icon="check">Yes</Chip> : <Chip tone="mute">No</Chip>),
            sortBy: (a) => String(a.active),
          },
        ]}
      />
    </div>
  );
}
