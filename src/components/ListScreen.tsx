/* A read-only register: tiles, a filter or two, a table, and a detail drawer.

   Several screens are exactly this and differ only in their columns, so they
   describe themselves here rather than repeating the loading, failure, search
   and drawer handling. Screens that decide things use DecisionQueue instead. */

import { useMemo, useState, type ReactNode } from 'react';
import { collection } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { Table, type Column } from '@/components/Table';
import { Drawer } from '@/components/layers';
import { Failed, Loading, Empty } from '@/components/ui';

interface Props<T extends { id: string }> {
  /** Seed collection to read. */
  name: string;
  columns: Column<T>[];
  searchPlaceholder: string;
  /** Tiles above the table, given every row. */
  kpis?: (rows: T[]) => ReactNode;
  /** A line above the tiles. */
  intro?: ReactNode;
  /** Dropdowns and switches on the table toolbar. */
  filters?: (rows: T[], set: (f: (r: T) => boolean) => void) => ReactNode;
  /** Narrow the rows client side, for the filters above. */
  filter?: (row: T) => boolean;
  /** Fields the free-text box looks at. */
  searchIn: (row: T) => string;
  /** Opening a row shows this. Omit for a table with no drawer. */
  detail?: (row: T) => ReactNode;
  drawerTitle?: (row: T) => ReactNode;
  drawerSub?: (row: T) => ReactNode;
  drawerWidth?: 'wide' | 'xwide';
  sort?: { key: string; dir: 'asc' | 'desc' };
  pageSize?: number;
  emptyTitle?: string;
  emptyIcon?: string;
  footNote?: ReactNode;
  what?: string;
}

export function ListScreen<T extends { id: string }>({
  name, columns, searchPlaceholder, kpis, intro, filters, filter, searchIn,
  detail, drawerTitle, drawerSub, drawerWidth, sort, pageSize = 25,
  emptyTitle = 'Nothing matches', emptyIcon = 'search', footNote, what = 'this',
}: Props<T>) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<T | null>(null);
  const [extra, setExtra] = useState<{ fn: (r: T) => boolean } | null>(null);

  const q = useQuery(
    () => collection<T>(name, { limit: 500, sort: sort?.key, dir: sort?.dir }),
    [],
  );

  const all = q.data?.rows ?? [];

  const rows = useMemo(() => {
    let r = all;
    if (filter) r = r.filter(filter);
    if (extra) r = r.filter(extra.fn);
    if (search.trim()) {
      const n = search.toLowerCase();
      r = r.filter((x) => searchIn(x).toLowerCase().includes(n));
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, search, extra, filter]);

  if (q.error) return <Failed error={q.error} onRetry={q.reload} />;

  /* Connected to Catalyst, but this collection has no table in that project.
     Say that plainly — an empty table would read as "nothing matched". */
  if (q.data?.notInProject) {
    return (
      <div className="card">
        <Empty icon="db" title="Not in the connected project">
          {q.data.message}
          <br />
          Nothing is shown rather than sample data, so that what you see is
          only what is really there.
        </Empty>
      </div>
    );
  }

  return (
    <div className="stack">
      {intro}
      {kpis?.(all)}

      {q.loading && !q.data ? (
        <div className="card"><Loading what={what} /></div>
      ) : (
        <Table
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          search={search}
          onSearch={setSearch}
          searchPlaceholder={searchPlaceholder}
          onRowClick={detail ? setOpen : undefined}
          pageSize={pageSize}
          toolbar={filters?.(all, (fn) => setExtra({ fn }))}
          empty={<Empty icon={emptyIcon} title={emptyTitle}>Try a wider search or filter.</Empty>}
          footNote={footNote}
        />
      )}

      {detail && (
        <Drawer
          open={!!open}
          onClose={() => setOpen(null)}
          width={drawerWidth}
          title={open && drawerTitle ? drawerTitle(open) : ''}
          sub={open && drawerSub ? drawerSub(open) : undefined}
        >
          {open && detail(open)}
        </Drawer>
      )}
    </div>
  );
}
