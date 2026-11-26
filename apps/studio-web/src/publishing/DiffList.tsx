import type { DiffRow } from './diff'

export function DiffList({ rows, before = '公開中', after = '公開候補', empty = '公開中の内容との違いはありません。' }: { rows: DiffRow[]; before?: string; after?: string; empty?: string }) {
  if (rows.length === 0) return <p className="mt-3 text-[12px] text-text-secondary">{empty}</p>
  return (
    <div className="mt-2 text-[12px]">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)] gap-3 border-b border-border-subtle py-2 text-text-secondary"><span>項目</span><span>{before}</span><span>{after}</span></div>
      {rows.map((row, position) => (
        <div key={position} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)] gap-3 border-b border-border-subtle py-3 break-words">
          <div className={row.kind === '削除' || row.kind === '取り下げ' ? 'text-danger' : 'text-text-secondary'}>{row.label}<span className="block text-[11px]">{row.kind}</span></div>
          <div className="text-text-secondary">{row.published}</div><div className="font-medium text-text-primary">{row.candidate}</div>
        </div>
      ))}
    </div>
  )
}
