import type { ReactNode } from 'react'
import { cn } from './cn'

type Tone = 'info' | 'warning' | 'blocking'

const toneClass: Record<Tone, string> = {
  info: 'border-brand bg-brand-subtle text-brand',
  warning: 'border-warning bg-surface text-warning',
  blocking: 'border-danger bg-surface text-danger',
}

/** Figma `Notice Banner`（70:253）。 */
export function NoticeBanner({ tone = 'info', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      className={cn('flex min-h-[58px] items-center gap-2.5 rounded-lg border px-3.5 py-2 font-medium', toneClass[tone], className)}
    >
      <span aria-hidden className="text-[17px] leading-[25px]">
        !
      </span>
      <p className="text-[12px] leading-[19px]">{children}</p>
    </div>
  )
}
