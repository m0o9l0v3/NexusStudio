import { CircleCheck, Info, Minus, OctagonX, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'
import type { StatusTone } from './StatusBadge'

const toneClass: Record<StatusTone, string> = {
  neutral: 'text-text-secondary',
  info: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

const defaultIcon: Record<StatusTone, LucideIcon> = {
  neutral: Minus,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: OctagonX,
}

type StatusLabelProps = {
  tone?: StatusTone
  /** 省略時は tone ごとの既定アイコン。 */
  icon?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Figma v2 `Status / Label`（37:224）。背景のピルを持たない「アイコン＋文言」の状態表示。
 * 状態は色だけでなく必ず文言で示す（アイコンは読み上げない）。
 */
export function StatusLabel({ tone = 'neutral', icon, children, className }: StatusLabelProps) {
  const Default = defaultIcon[tone]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 text-sm leading-[18px] whitespace-nowrap', toneClass[tone], className)}>
      <span aria-hidden className="inline-flex shrink-0">
        {icon ?? <Default size={16} strokeWidth={1.5} />}
      </span>
      <span>{children}</span>
    </span>
  )
}
