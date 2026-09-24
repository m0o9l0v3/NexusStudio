import type { ReactNode } from 'react'

/** Figma `Toolbar`（27:28）。64px高。右側には画面ごとの状態・操作を置く。 */
export function Toolbar({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-5 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <h1 className="truncate text-[15px] leading-[23px] font-medium text-text-primary">{title}</h1>
        {subtitle && <p className="truncate text-[10px] leading-[18px] text-text-secondary">{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}
