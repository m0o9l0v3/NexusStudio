import { Info, OctagonX, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

type Tone = 'info' | 'warning' | 'blocking'

const toneClass: Record<Tone, string> = {
  info: 'border-brand/35 bg-brand-subtle text-brand',
  warning: 'border-warning/40 bg-warning-subtle text-warning',
  // danger（#b91c28）× danger-subtle（#fef2f2）は 5.89:1 で WCAG AA 準拠（決定事項36 V2-11）。
  blocking: 'border-danger-border bg-danger-subtle text-danger',
}

const toneIcon: Record<Tone, LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  blocking: OctagonX,
}

/** Figma `Notice Banner`（70:253、v2 トーン）。 */
export function NoticeBanner({ tone = 'info', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const Icon = toneIcon[tone]
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      className={cn('flex min-h-[48px] items-center gap-2.5 rounded-lg border px-3.5 py-2 font-normal', toneClass[tone], className)}
    >
      <Icon aria-hidden size={16} strokeWidth={2} className="shrink-0" />
      <p className="text-[12px] leading-[19px]">{children}</p>
    </div>
  )
}
