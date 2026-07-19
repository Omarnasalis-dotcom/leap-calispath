import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** enables server-driven sorting via onSort */
  sortable?: boolean;
  align?: 'left' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyLabel?: string;
  emptyHint?: string;
  onRowClick?: (row: T) => void;
  sort?: { key: string; desc: boolean };
  onSort?: (key: string) => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyLabel = 'Nothing here',
  emptyHint,
  onRowClick,
  sort,
  onSort,
}: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => {
              const sorted = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  className={c.sortable ? 'sortable' : undefined}
                  style={c.align === 'right' ? { textAlign: 'right' } : undefined}
                  onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
                  tabIndex={c.sortable ? 0 : undefined}
                  onKeyDown={
                    c.sortable && onSort
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSort(c.key);
                          }
                        }
                      : undefined
                  }
                  aria-sort={
                    sorted ? (sort!.desc ? 'descending' : 'ascending') : undefined
                  }
                >
                  {c.header}
                  {sorted && (
                    <span className="sort-arrow" aria-hidden>
                      {sort!.desc ? '↓' : '↑'}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`s${i}`}>
                {columns.map((c) => (
                  <td key={c.key}>
                    <div className="skeleton" style={{ height: 14, width: '70%' }} />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            rows?.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? 'clickable' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={c.align === 'right' ? { textAlign: 'right' } : undefined}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {!loading && rows && rows.length === 0 && (
        <div className="empty">
          <span className="label">{emptyLabel}</span>
          {emptyHint}
        </div>
      )}
    </div>
  );
}
