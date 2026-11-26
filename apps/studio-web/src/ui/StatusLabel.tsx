import type { ReactNode } from 'react'
import { cn } from './cn'
import type { StatusTone } from './StatusBadge'

const toneClass: Record<StatusTone, string> = {
  neutral: 'text-text-muted',
  info: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

const filledDotClass: Record<StatusTone, string> = {
  neutral: 'bg-text-muted',
  info: 'bg-brand',
  success: 'bg-success-dot',
  warning: 'bg-warning-dot',
  danger: 'bg-danger-dot',
}

const hollowDotClass: Record<StatusTone, string> = {
  neutral: 'border-[1.5px] border-text-muted bg-transparent',
  info: 'border-[1.5px] border-brand bg-transparent',
  success: 'border-[1.5px] border-success-dot bg-transparent',
  warning: 'border-[1.5px] border-warning-dot bg-transparent',
  danger: 'border-[1.5px] border-danger-dot bg-transparent',
}

type StatusLabelProps = {
  tone?: StatusTone
  /** 6px ドットの表現。省略時は neutral を白抜き丸、それ以外を塗り丸にする。 */
  dot?: 'filled' | 'hollow' | 'none'
  /** 既存未刷新画面の互換用。指定された場合はドットの代わりにアイコンを表示する。 */
  icon?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Figma v2 `Status / Label`（37:224、決定事項36 V2-13）。背景のピルを持たない「6px ドット＋文言」の状態表示。
 * 状態は色だけでなく必ず文言で示す（ドット・アイコンは読み上げない）。
 */
export function StatusLabel({ tone = 'neutral', dot, icon, children, className }: StatusLabelProps) {
  const resolvedDot = dot ?? (tone === 'neutral' ? 'hollow' : 'filled')
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-[12px] leading-[17px] whitespace-nowrap', toneClass[tone], className)}>
      {icon != null && icon !== false ? (
        <span aria-hidden className="inline-flex shrink-0">
          {icon}
        </span>
      ) : (
        resolvedDot !== 'none' && (
          <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', resolvedDot === 'hollow' ? hollowDotClass[tone] : filledDotClass[tone])} />
        )
      )}
      <span>{children}</span>
    </span>
  )
}
