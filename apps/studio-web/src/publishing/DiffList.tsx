import { StatusBadge } from '../ui/StatusBadge'
import type { DiffRow } from './diff'

/** 差分の行（Figma R01「公開中との差分」）。左右の見出しは用途に合わせて変える。 */
export function DiffList({ rows, before = '公開中', after = '公開候補', empty = '公開中の内容との違いはありません。' }: { rows: DiffRow[]; before?: string; after?: string; empty?: string }) {
  if (rows.length === 0) return <p className="mt-3 text-[12px] leading-5 text-text-secondary">{empty}</p>
  return (
    <ul className="mt-1 flex flex-col">
      {rows.map((row, position) => (
        <li key={position} className="flex flex-col gap-1.5 border-b border-border py-3.5 last:border-b-0">
          <div className="flex items-center gap-2">
            <StatusBadge tone={row.kind === '削除' || row.kind === '取り下げ' ? 'danger' : 'neutral'}>{row.kind}</StatusBadge>
            <span className="text-[13px] leading-[21px] font-medium text-text-primary">{row.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-[11px] leading-[19px] break-words">
            <p className="text-text-secondary">
              {before}：{row.published}
            </p>
            <p className="text-text-primary">
              {after}：{row.candidate}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
