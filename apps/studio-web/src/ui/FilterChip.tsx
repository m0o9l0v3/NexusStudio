import { ChevronDown } from 'lucide-react'
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

/** 一覧の絞り込み・並べ替え（Figma E01 `11:2`・SP01 `42:2` の丸いバッジ型、v2 トーン）。一覧はブラウザ標準のSelectを使う。 */
export function FilterChip({ label, value, active, onChange, children }: FilterChipProps) {
  const selected = active ?? Boolean(value)
  return (
    <span className="relative inline-flex max-w-[280px] shrink-0">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'field-sizing-content h-[30px] max-w-[280px] cursor-pointer appearance-none truncate rounded-full border pr-7 pl-3 text-[12px] leading-[17px] font-normal',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
          selected ? 'border-brand bg-brand-subtle text-brand' : 'border-border-input bg-canvas text-text-secondary hover:bg-surface-hover',
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        size={14}
        className={cn('pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2', selected ? 'text-brand' : 'text-text-secondary')}
      />
    </span>
  )
}
