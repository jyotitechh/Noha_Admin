/* The console's one table.

   Every register, queue and log in the console is this component with a
   different column list, so sorting, searching, selecting and paging behave
   the same everywhere. Columns describe themselves; the table does the rest. */

import { useMemo, useState, type ReactNode } from 'react';
import { Icon, Empty } from './ui';

export interface Column<T> {
  /** Key into the row, and the sort key unless `sortBy` says otherwise. */
  key: string;
  /** Column heading. */
  label: ReactNode;
  /** What to draw in the cell. Defaults to the raw value. */
  cell?: (row: T) => ReactNode;
  /** Right-aligned and tabular, for money and counts. */
  num?: boolean;
  /** Set false for columns that cannot be ordered, such as an actions column. */
  sortable?: boolean;
  /** Value to sort on, when the cell is not the value. */
  sortBy?: (row: T) => string | number | Date;
  width?: number | string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  /** Unique key per row. */
  rowKey: (row: T) => string;
  title?: ReactNode;
  /** Free-text box. Searches the fields listed in `searchFields`. */
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  /** Extra controls on the toolbar: filters, segmented switches. */
  toolbar?: ReactNode;
  /** Row click opens a drawer, usually. */
  onRowClick?: (row: T) => void;
  /** Turn on tick boxes and bulk actions. */
  selectable?: boolean;
  selected?: Set<string>;
  onSelect?: (next: Set<string>) => void;
  bulkActions?: (selected: string[]) => ReactNode;
  empty?: ReactNode;
  /** Rows per page. 0 shows everything. */
  pageSize?: number;
  inset?: boolean;
  footNote?: ReactNode;
}

export function Table<T>({
  rows, columns, rowKey, title, search, onSearch, searchPlaceholder = 'Search',
  toolbar, onRowClick, selectable, selected, onSelect, bulkActions, empty,
  pageSize = 25, inset, footNote,
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const value = (r: T) => (col.sortBy ? col.sortBy(r) : ((r as Record<string, unknown>)[col.key] as string | number | Date));
    const sign = sort.dir === 'desc' ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const x = value(a), y = value(b);
      if (x == null) return 1;
      if (y == null) return -1;
      if (x instanceof Date && y instanceof Date) return (+x - +y) * sign;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
      return String(x).localeCompare(String(y), 'en-IN') * sign;
    });
  }, [rows, sort, columns]);

  const pages = pageSize ? Math.ceil(sorted.length / pageSize) : 1;
  const safePage = Math.min(page, Math.max(0, pages - 1));
  const shown = pageSize ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted;

  const allOnPage = shown.map(rowKey);
  const allTicked = allOnPage.length > 0 && allOnPage.every((k) => selected?.has(k));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allTicked) allOnPage.forEach((k) => next.delete(k));
    else allOnPage.forEach((k) => next.add(k));
    onSelect?.(next);
  };

  const toggleOne = (key: string) => {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    onSelect?.(next);
  };

  const headSort = (col: Column<T>) => {
    if (col.sortable === false) return;
    setSort((s) => (s?.key === col.key ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: 'asc' }));
    setPage(0);
  };

  return (
    <div className={'tbl' + (inset ? ' inset' : '')}>
      {(title || onSearch || toolbar) && (
        <div className="tbar">
          {title && <span className="ttl">{title}</span>}
          {onSearch && (
            <div className="srch">
              <Icon name="search" />
              <input
                className="inp"
                value={search ?? ''}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                onChange={(e) => { onSearch(e.target.value); setPage(0); }}
              />
            </div>
          )}
          {toolbar}
        </div>
      )}

      {selectable && selected && selected.size > 0 && (
        <div className="bulk">
          <Icon name="check-sq" />
          {selected.size} selected
          <span className="sp" style={{ flex: 1 }} />
          {bulkActions?.(Array.from(selected))}
          <button className="btn ghost sm" onClick={() => onSelect?.(new Set())}>Clear</button>
        </div>
      )}

      <div className="tscroll">
        <table className="t">
          <thead>
            <tr>
              {selectable && (
                <th className="cb">
                  <input type="checkbox" checked={allTicked} aria-label="Select every row on this page" onChange={toggleAll} />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={[c.num && 'num', c.sortable !== false && 'sort'].filter(Boolean).join(' ')}
                  style={c.width ? { width: c.width } : undefined}
                  onClick={() => headSort(c)}
                  aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.label}
                  {sort?.key === c.key && <span className="arr">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  className={[onRowClick && 'click', selected?.has(key) && 'sel'].filter(Boolean).join(' ')}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable && (
                    <td className="cb" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected?.has(key) ?? false} aria-label={'Select ' + key} onChange={() => toggleOne(key)} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={c.num ? 'num' : undefined}>
                      {c.cell ? c.cell(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {shown.length === 0 && (empty ?? <Empty title="Nothing here">Nothing matches what you asked for.</Empty>)}
      </div>

      {(pages > 1 || footNote) && (
        <div className="tfoot">
          <span>
            {sorted.length === 0
              ? 'No rows'
              : `${safePage * pageSize + 1}–${Math.min(sorted.length, (safePage + 1) * pageSize)} of ${sorted.length}`}
          </span>
          {footNote && <span className="muted">· {footNote}</span>}
          <span className="sp" style={{ flex: 1 }} />
          {pages > 1 && (
            <>
              <button className="btn ghost sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
                <Icon name="chev-l" />
              </button>
              <span>Page {safePage + 1} of {pages}</span>
              <button className="btn ghost sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page">
                <Icon name="chev-r" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
