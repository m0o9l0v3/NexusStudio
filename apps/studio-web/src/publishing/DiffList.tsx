import { cn } from '../ui/cn'
import type { DiffRow } from './diff'

/** 差分の行（Figma R01「公開中との差分」）。左右の見出しは用途に合わせて変える。 */
export function DiffList({
  rows,
  before = '公開中',
  after = '公開候補',
  empty = '公開中の内容との違いはありません。',
}: {
  rows: DiffRow[]
  before?: string
  after?: string
  empty?: string
}) {
  if (rows.length === 0) return <p className="mt-3 text-[12px] leading-5 text-text-secondary">{empty}</p>
  return (
    <div className="mt-2 text-[12px] leading-5">
      <div className="hidden border-b border-border-subtle py-2 text-text-secondary sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,2fr)] sm:gap-4">
        <span>項目</span>
        <span>{before}</span>
        <span>{after}</span>
      </div>
      <ul className="divide-y divide-border-subtle border-b border-border-subtle">
        {rows.map((row, position) => {
          const removed = row.kind === '削除' || row.kind === '公開停止'
          return (
            <li
              key={position}
              className="grid grid-cols-1 gap-1.5 py-3 break-words sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,2fr)] sm:gap-4"
            >
              <div className={cn('min-w-0', removed ? 'text-danger' : 'text-text-secondary')}>
                <span>{row.label}</span>
                <span className="ml-2 text-[11px] sm:ml-0 sm:block">{row.kind}</span>
              </div>
              <div className="min-w-0 text-text-secondary">
                <span className="sm:hidden">{before}：</span>
                {row.published}
              </div>
              <div className={cn('min-w-0 font-bold', removed ? 'text-danger' : 'text-text-primary')}>
                <span className="font-normal text-text-secondary sm:hidden">{after}：</span>
                {row.candidate}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
