import type { ReactNode } from 'react'
import { cn } from './cn'

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const toneClass: Record<StatusTone, string> = {
  neutral: 'bg-surface-subtle text-text-secondary',
  info: 'bg-brand-subtle text-brand',
  success: 'bg-surface-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  // danger の文字は danger-subtle（4.16:1）・surface-subtle（4.37:1）では AA に届かないため白地に枠を付ける。
  danger: 'bg-surface text-danger ring-1 ring-danger/45 ring-inset',
}

/**
 * Figma `Status Badge`（6:19）。公開・保存・検証を色だけでなく文言でも示す。
 * v2 で背景を持たない状態表示は `StatusLabel`（37:224）を使う。
 */
export function StatusBadge({ tone = 'neutral', children, className }: { tone?: StatusTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] leading-5 font-medium whitespace-nowrap', toneClass[tone], className)}>
      {children}
    </span>
  )
}
