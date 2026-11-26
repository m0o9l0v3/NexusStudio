import type { ReactNode } from 'react'
import { cn } from './cn'

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const toneClass: Record<StatusTone, string> = {
  neutral: 'bg-surface-subtle text-text-secondary',
  info: 'bg-brand-subtle text-brand',
  success: 'bg-surface-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  // danger（#b91c28）× danger-subtle（#fef2f2）は 5.89:1 で WCAG AA 準拠（決定事項36 V2-11）。
  danger: 'bg-danger-subtle text-danger ring-1 ring-danger-border ring-inset',
}

/**
 * Figma `Status Badge`（6:19）。公開・保存・検証を色だけでなく文言でも示す。
 * v2 で背景を持たない状態表示は `StatusLabel`（37:224）を使う。
 */
export function StatusBadge({ tone = 'neutral', children, className }: { tone?: StatusTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] leading-[17px] font-normal whitespace-nowrap', toneClass[tone], className)}>
      {children}
    </span>
  )
}
