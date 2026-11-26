import { Check } from 'lucide-react'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
  /** ラベルの下に出す補足。 */
  description?: ReactNode
}

/**
 * Figma v2 `共通 / チェックボックス`（60:396）。キーボード・読み上げの互換性のため標準の checkbox を使い、見た目だけ重ねる。
 * 枠は入力欄と同じ `border-input`（WCAG 1.4.11 の 3:1）。
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, id, disabled, 'aria-describedby': describedBy, ...props },
  ref,
) {
  const generated = useId()
  const inputId = id ?? generated
  const descriptionId = description ? `${inputId}-description` : undefined
  const descriptionIds = [describedBy, descriptionId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex items-start gap-2', disabled && 'opacity-55', className)}>
      <span className="relative mt-0.5 inline-flex size-4 shrink-0">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          disabled={disabled}
          aria-describedby={descriptionIds}
          className={cn(
            'peer size-4 cursor-pointer appearance-none rounded-[4px] border border-border-input bg-canvas',
            'checked:border-brand checked:bg-brand',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed',
          )}
          {...props}
        />
        <Check
          aria-hidden
          size={12}
          strokeWidth={3}
          className="pointer-events-none absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-canvas peer-checked:block"
        />
      </span>
      <span className="flex min-w-0 flex-col">
        <label htmlFor={inputId} className={cn('text-sm leading-5 font-normal text-text-primary', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
          {label}
        </label>
        {description && (
          <span id={descriptionId} className="text-[11px] leading-4 text-text-secondary">
            {description}
          </span>
        )}
      </span>
    </div>
  )
})
