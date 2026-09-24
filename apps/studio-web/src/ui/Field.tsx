import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

// Figma `Field`（69:248）：ラベル12px＋40px高の枠。Text／Select／Time の3種。

const boxClass = (invalid?: boolean) =>
  cn(
    'h-10 w-full rounded-[7px] border bg-surface px-3 text-[13px] leading-[21px] text-text-primary placeholder:text-text-secondary',
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-55',
    invalid ? 'border-danger' : 'border-border',
  )

type FieldFrameProps = {
  id: string
  label: string
  invalid?: boolean
  message?: ReactNode
  messageTone?: 'danger' | 'warning' | 'secondary'
  className?: string
  children: ReactNode
}

function FieldFrame({ id, label, invalid, message, messageTone = 'danger', className, children }: FieldFrameProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-[12px] leading-5 font-medium', invalid ? 'text-danger' : 'text-text-secondary')}>
        {label}
      </label>
      {children}
      {message && (
        <p
          id={`${id}-message`}
          className={cn(
            'text-[11px] leading-[19px]',
            messageTone === 'danger' ? 'text-danger' : messageTone === 'warning' ? 'text-warning' : 'text-text-secondary',
          )}
        >
          {message}
        </p>
      )}
    </div>
  )
}

type CommonProps = {
  label: string
  invalid?: boolean
  message?: ReactNode
  messageTone?: 'danger' | 'warning' | 'secondary'
  className?: string
}

export const InputField = forwardRef<HTMLInputElement, CommonProps & InputHTMLAttributes<HTMLInputElement>>(function InputField(
  { label, invalid, message, messageTone, className, id, ...props },
  ref,
) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <FieldFrame id={inputId} label={label} invalid={invalid} message={message} messageTone={messageTone} className={className}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={invalid || undefined}
        aria-describedby={message ? `${inputId}-message` : undefined}
        className={boxClass(invalid)}
        {...props}
      />
    </FieldFrame>
  )
})

export function TextAreaField({ label, invalid, message, className, id, ...props }: CommonProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <FieldFrame id={inputId} label={label} invalid={invalid} message={message} className={className}>
      <textarea
        id={inputId}
        aria-invalid={invalid || undefined}
        className={cn(boxClass(invalid), 'h-auto min-h-10 resize-y py-[9px]')}
        {...props}
      />
    </FieldFrame>
  )
}

/** Kind=Select。一覧はブラウザ標準のものを使う（キーボード・読み上げの互換性のため）。 */
export function SelectField({ label, invalid, message, messageTone, className, id, children, ...props }: CommonProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <FieldFrame id={inputId} label={label} invalid={invalid} message={message} messageTone={messageTone} className={className}>
      <div className="relative">
        <select
          id={inputId}
          aria-invalid={invalid || undefined}
          aria-describedby={message ? `${inputId}-message` : undefined}
          className={cn(boxClass(invalid), 'appearance-none pr-8')}
          {...props}
        >
          {children}
        </select>
        <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[14px] leading-[22px] font-medium text-text-secondary">
          ▾
        </span>
      </div>
    </FieldFrame>
  )
}
