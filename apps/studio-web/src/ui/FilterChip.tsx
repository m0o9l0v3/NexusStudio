import type { ReactNode } from 'react'
import { cn } from './cn'

type FilterChipProps = {
  label: string
  value: string
  /** 既定値以外を選んでいるか。省略時は値が空でなければ選択中とみなす。 */
  active?: boolean
  onChange: (value: string) => void
  children: ReactNode
}

/** 一覧の絞り込み・並べ替え（Figma E01 `11:2`・SP01 `42:2` の丸いバッジ型）。一覧はブラウザ標準のSelectを使う。 */
export function FilterChip({ label, value, active, onChange, children }: FilterChipProps) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'field-sizing-content h-[25px] max-w-[280px] cursor-pointer appearance-none truncate rounded-full px-2.5 text-[11px] leading-[19px] font-medium',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
        (active ?? Boolean(value)) ? 'bg-brand-subtle text-brand' : 'bg-surface-subtle text-text-secondary',
      )}
    >
      {children}
    </select>
  )
}
