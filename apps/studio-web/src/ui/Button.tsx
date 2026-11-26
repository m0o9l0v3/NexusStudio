import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ghostBrand'
export type ButtonSize = 'md' | 'sm'

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-brand font-bold text-canvas hover:bg-brand-hover',
  secondary: 'border border-border bg-canvas font-normal text-text-primary hover:bg-surface-hover',
  danger: 'border border-danger-border bg-canvas font-normal text-danger hover:border-danger hover:bg-danger-subtle',
  ghost: 'font-normal text-text-secondary hover:bg-surface-hover hover:text-text-primary',
  ghostBrand: 'font-normal text-brand hover:bg-surface-hover',
}

const sizeClass: Record<ButtonSize, string> = {
  md: 'h-9 rounded-md px-3 text-[13px] leading-[19px]',
  sm: 'h-[30px] rounded-md px-2.5 text-[12px] leading-[17px]',
}

/**
 * 呼び出し側の className と同じ種類の指定（高さ・左右余白・文字サイズ・行の高さ・角丸）を既定から外す。
 * Tailwind は class の並び順ではなく CSS の順で勝ち負けが決まるため、上書きを確実に効かせる（既存画面の `h-10` 等）。
 */
const overridable: RegExp[] = [/^h-/, /^px-/, /^text-\[\d/, /^leading-/, /^rounded(-|$)/]

function withoutOverridden(base: string, className: string | undefined): string {
  if (!className) return base
  const given = className.split(/\s+/).filter(Boolean)
  return base
    .split(' ')
    .filter((token) => !overridable.some((pattern) => pattern.test(token) && given.some((g) => pattern.test(g))))
    .join(' ')
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }

/** Figma v2 `Button`（60:372・60:367）。md 36px高／sm 30px高。アイコンを並べるときは children に Lucide の16px（sm は14px）を入れる。 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap transition-colors',
        withoutOverridden(sizeClass[size], className),
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:cursor-not-allowed disabled:opacity-45',
        variantClass[variant],
        className,
      )}
      {...props}
    />
  )
})
