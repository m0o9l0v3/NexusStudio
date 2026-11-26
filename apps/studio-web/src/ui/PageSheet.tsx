import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * 既存未刷新画面との後方互換ラッパー（決定事項36 V2-12）。
 * 角丸の白いシート表現を廃止し、白キャンバス上のフラットな領域として描画する。
 */
export function PageSheet({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas', className)}>{children}</div>
}
