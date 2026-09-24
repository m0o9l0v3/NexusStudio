import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { cn } from './cn'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  invalid?: boolean
}

/** Figma `Field`（69:248）Kind=Text。ダイアログ・編集フォーム用の40px高の入力欄。 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, invalid, className, id, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <div className={cn('flex w-[320px] max-w-full flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className={cn('text-[12px] leading-5 font-medium', invalid ? 'text-danger' : 'text-text-secondary')}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-10 rounded-[7px] border bg-surface px-3 text-[13px] leading-[21px] text-text-primary placeholder:text-text-secondary',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-55',
          invalid ? 'border-danger' : 'border-border',
        )}
        {...props}
      />
    </div>
  )
})
