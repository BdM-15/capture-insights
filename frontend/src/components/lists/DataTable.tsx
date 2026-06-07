import type { ReactNode } from 'react'

export interface DataTableColumn<T> {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  headerClassName?: string
  cellClassName?: string
  render: (row: T, index: number) => ReactNode
}

interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[]
  data: readonly T[]
  rowKey?: (row: T, index: number) => string | number
  rowClassName?: (row: T, index: number) => string
  emptyMessage?: string
  stickyHeader?: boolean
  className?: string
  minHeight?: string
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  rowClassName,
  emptyMessage = 'No data.',
  stickyHeader = true,
  className = '',
  minHeight,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div
        className={`data-table-empty ${className}`.trim()}
        style={minHeight ? { minHeight } : undefined}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={`data-table-wrap ${className}`.trim()} style={minHeight ? { minHeight } : undefined}>
      <table className="data-table">
        <thead className={stickyHeader ? 'data-table-head-sticky' : ''}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`data-table-th ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.headerClassName ?? ''}`.trim()}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={rowKey ? rowKey(row, index) : index}
              className={rowClassName?.(row, index) ?? ''}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`data-table-td ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.cellClassName ?? ''}`.trim()}
                >
                  {col.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}