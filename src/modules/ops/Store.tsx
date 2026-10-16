/* The store the app sells from, and the orders waiting to go out. */

import { useMemo } from 'react';
import { collection } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { Table } from '@/components/Table';
import { Chip, Kpi, Kpis, Note, Status, Who, Bar, Failed, Loading, Empty } from '@/components/ui';
import { fdt, inr, inrS, num } from '@/lib/format';

interface Product { id: string; name: string; cat: string; price: number; stock: number; sold: number; wish: number; active: boolean }
interface Order { id: string; member: string; name: string; items: number; amt: number; addr: string; status: string; at: Date; pay: string }

export default function Store() {
  const products = useQuery(() => collection<Product>('PRODUCTS', { limit: 200 }), []);
  const orders = useQuery(() => collection<Order>('ORDERS', { limit: 200, sort: 'at', dir: 'desc' }), []);

  const stats = useMemo(() => {
    const p = products.data?.rows ?? [];
    const o = orders.data?.rows ?? [];
    return {
      toDispatch: o.filter((x) => x.status === 'Awaiting dispatch'),
      revenue: o.filter((x) => x.status !== 'Cancelled').reduce((n, x) => n + x.amt, 0),
      outOfStock: p.filter((x) => x.active && x.stock === 0),
      lowStock: p.filter((x) => x.active && x.stock > 0 && x.stock < 10),
    };
  }, [products.data, orders.data]);

  if (products.error) return <Failed error={products.error} onRetry={products.reload} />;
  if (!products.data || !orders.data) return <div className="card"><Loading what="the store" /></div>;

  return (
    <div className="stack">
      {stats.outOfStock.length > 0 && (
        <Note tone="warn" icon="box">
          <b>{stats.outOfStock.length} {stats.outOfStock.length === 1 ? 'product is' : 'products are'} out of stock</b> and still
          listed in the app: {stats.outOfStock.map((p) => p.name).join(', ')}.
        </Note>
      )}

      <Kpis>
        <Kpi label="To dispatch" value={stats.toDispatch.length} icon="truck"
          tone={stats.toDispatch.length ? 'warn' : undefined} detail="paid, not yet sent" />
        <Kpi label="Taken" value={inrS(stats.revenue)} icon="rupee" detail={`${orders.data.total} orders`} />
        <Kpi label="Out of stock" value={stats.outOfStock.length} icon="box"
          tone={stats.outOfStock.length ? 'bad' : undefined} />
        <Kpi label="Running low" value={stats.lowStock.length} icon="alert" detail="fewer than ten left" />
      </Kpis>

      <Table
        title="Orders"
        rows={orders.data.rows}
        rowKey={(o) => o.id}
        pageSize={12}
        columns={[
          { key: 'id', label: 'Order', cell: (o) => <span className="mono">{o.id}</span> },
          { key: 'name', label: 'Member', cell: (o) => <Who name={o.name} sub={<span className="mono">{o.member}</span>} size="sm" /> },
          { key: 'items', label: 'Items', num: true },
          { key: 'amt', label: 'Amount', num: true, cell: (o) => <b className="tnum">{inr(o.amt)}</b> },
          { key: 'addr', label: 'Send to', cell: (o) => <span className="muted small">{o.addr}</span> },
          { key: 'at', label: 'Placed', num: true, cell: (o) => <span className="muted">{fdt(o.at)}</span> },
          { key: 'status', label: 'Status', cell: (o) => <Status>{o.status}</Status> },
        ]}
        empty={<Empty icon="cart" title="No orders">Nothing has been bought yet.</Empty>}
      />

      <Table
        title="Products"
        rows={products.data.rows}
        rowKey={(p) => p.id}
        pageSize={12}
        columns={[
          { key: 'name', label: 'Product', cell: (p) => <>{p.name}<span className="sub">{p.cat}</span></> },
          { key: 'price', label: 'Price', num: true, cell: (p) => inr(p.price) },
          {
            key: 'stock', label: 'In stock', num: true, width: 140,
            cell: (p) => (
              p.stock === 0
                ? <Chip tone="bad">Out of stock</Chip>
                : (
                  <>
                    <span className="tnum">{num(p.stock)}</span>
                    <Bar value={Math.min(p.stock, 120)} max={120} tone={p.stock < 10 ? 'warn' : undefined} />
                  </>
                )
            ),
          },
          { key: 'sold', label: 'Sold', num: true, cell: (p) => num(p.sold) },
          { key: 'wish', label: 'Wishlisted', num: true, cell: (p) => (p.wish ? num(p.wish) : <span className="muted">—</span>) },
          {
            key: 'active', label: 'In the app',
            cell: (p) => (p.active ? <Chip tone="ok" icon="check">Listed</Chip> : <Chip tone="mute">Hidden</Chip>),
            sortBy: (p) => String(p.active),
          },
        ]}
      />
    </div>
  );
}
