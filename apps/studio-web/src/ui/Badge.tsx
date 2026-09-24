import type { ReactNode } from 'react'
import { cn } from './cn'

// 他のtone（Success/Warning/Danger）は使う画面の実装時にFigmaの値を確認して追加する。
type Tone = 'neutral' | 'info'

const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-subtle text-text-secondary',
  info: 'bg-brand-subtle text-brand',
}

/** Figma `Status Badge`（6:19）。状態は色だけでなく必ず文言で示す。 */
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex rounded-full px-[9px] py-[3px] text-[11px] leading-[19px] font-medium whitespace-nowrap', toneClass[tone], className)}>
      {children}
    </span>
  )
}
