import { Info, OctagonX, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

type Tone = 'info' | 'neutral' | 'warning' | 'blocking'

const toneClass: Record<Tone, string> = {
  info: 'border-brand/35 bg-brand-subtle text-brand',
  neutral: 'border-transparent bg-surface-subtle text-text-primary [&>svg]:text-brand',
  warning: 'border-warning/40 bg-warning-subtle text-warning',
  // danger（#b91c28）× danger-subtle（#fef2f2）は 5.89:1 で WCAG AA 準拠（決定事項36 V2-11）。
  blocking: 'border-danger-border bg-danger-subtle text-danger',
}

const toneIcon: Record<Tone, LucideIcon> = {
  info: Info,
  neutral: Info,
  warning: TriangleAlert,
  blocking: OctagonX,
}

/** Figma `Notice Banner`（70:253、v2 トーン）。 */
export function NoticeBanner({ tone = 'info', children, action, className }: { tone?: Tone; children: ReactNode; action?: ReactNode; className?: string }) {
  const Icon = toneIcon[tone]
  return (
    <div
      role={tone === 'warning' || tone === 'blocking' ? 'alert' : 'status'}
      className={cn('grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 gap-y-2 rounded-lg border px-3.5 py-2.5 font-normal', toneClass[tone], className)}
    >
      <Icon aria-hidden size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
      <div className="min-w-0 text-[12px] leading-[19px] wrap-anywhere">{children}</div>
      {action && <div className="col-span-full">{action}</div>}
    </div>
  )
}
