import type { ReactNode } from 'react'
import { cn } from './cn'

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const toneClass: Record<StatusTone, string> = {
  neutral: 'bg-surface-subtle text-text-secondary',
  info: 'bg-brand-subtle text-brand',
  success: 'bg-surface-subtle text-success',
  warning: 'bg-surface-subtle text-warning',
  danger: 'bg-surface-subtle text-danger',
}

/** Figma `Status Badge`（6:19）。公開・保存・検証を色だけでなく文言でも示す。 */
export function StatusBadge({ tone = 'neutral', children, className }: { tone?: StatusTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 rounded-full px-2.5 py-1 text-[12px] leading-5 font-medium whitespace-nowrap', toneClass[tone], className)}>
      {children}
    </span>
  )
}
