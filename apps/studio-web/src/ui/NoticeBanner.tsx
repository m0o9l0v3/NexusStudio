import { Info, OctagonX, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

type Tone = 'info' | 'warning' | 'blocking'

const toneClass: Record<Tone, string> = {
  info: 'border-brand/40 bg-brand-subtle text-brand',
  warning: 'border-warning/45 bg-warning-subtle text-warning',
  // danger の文字は danger-subtle の上では 4.16:1 で AA に届かないため白地にする。
  blocking: 'border-danger/60 bg-surface text-danger',
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
      className={cn('flex min-h-[48px] items-center gap-2.5 rounded-lg border px-3.5 py-2 font-medium', toneClass[tone], className)}
    >
      <Icon aria-hidden size={16} strokeWidth={2} className="shrink-0" />
      <p className="text-[12px] leading-[19px]">{children}</p>
    </div>
  )
}
