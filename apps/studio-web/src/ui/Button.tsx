import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'danger'

const variantClass: Record<Variant, string> = {
  primary: 'bg-brand text-surface hover:bg-brand/90',
  secondary: 'border border-border bg-surface text-text-primary hover:bg-surface-subtle',
  danger: 'border border-danger bg-surface text-text-primary hover:bg-surface-subtle',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }

/** Figma `Button`（6:8）。40px高、最小幅120px。 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex h-10 min-w-[120px] items-center justify-center whitespace-nowrap rounded-lg px-4 text-[14px] leading-[22px] font-medium',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:cursor-not-allowed disabled:opacity-45',
        variantClass[variant],
        className,
      )}
      {...props}
    />
  )
})
