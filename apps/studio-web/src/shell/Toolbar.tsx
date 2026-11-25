import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

type ToolbarProps = {
  /** 画面の見出し（h1）。`titleNode` を渡したときは読み上げ用の名前としてだけ使う。 */
  title?: string
  subtitle?: string
  /** 見出しの左に置く要素（戻るボタンなど）。 */
  leading?: ReactNode
  /** 見出しを文字列以外（パンくず・状態つき）で描く場合。 */
  titleNode?: ReactNode
  className?: string
  children?: ReactNode
}

/**
 * Figma v2 の上部ヘッダー（canvas の上、下線なし）。56px以上。右側には画面ごとの状態・操作を置く。
 * v1 `Toolbar`（27:28）の役割（画面名・状態・主要操作）を引き継ぐ。
 */
export function Toolbar({ title, subtitle, leading, titleNode, className, children }: ToolbarProps) {
  return (
    <header className={cn('flex min-h-14 shrink-0 items-center gap-3 bg-canvas px-5 py-2.5', className)}>
      {leading}
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        {titleNode ? (
          <h1 aria-label={title} className="min-w-0 truncate text-[17px] leading-6 font-bold text-text-primary">
            {titleNode}
          </h1>
        ) : (
          title && <h1 className="truncate text-[17px] leading-6 font-bold text-text-primary">{title}</h1>
        )}
        {subtitle && <p className="truncate text-[11px] leading-[19px] text-text-secondary">{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}
