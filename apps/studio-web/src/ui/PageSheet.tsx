import type { ReactNode } from 'react'
import { cn } from './cn'

/** Figma v2 `base`（12:3）。canvas の上に置く角丸の白いシート。Toolbar の下の本文をこの中に置く。 */
export function PageSheet({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface', className)}>{children}</div>
}
