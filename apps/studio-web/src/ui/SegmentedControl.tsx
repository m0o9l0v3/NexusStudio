import { cn } from './cn'

export type SegmentedControlOption<T extends string> = {
  value: T
  label: string
}

export type SegmentedControlProps<T extends string> = {
  value: T | null
  options: ReadonlyArray<SegmentedControlOption<T>>
  onChange: (value: T) => void
  name: string
  'aria-label'?: string
  'aria-labelledby'?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Figma v2 セグメント切替（100:1724、決定事項36 V2-13）。30px高。
 * 未選択（null）を許容し、自動で選ばない（07 EV-42・AC26）。
 * 矢印キー移動とスクリーンリーダー対応のため、role="radiogroup" と標準の radio 入力を使う。
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  name,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  invalid,
  disabled,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-invalid={invalid || undefined}
      aria-disabled={disabled || undefined}
      className={cn(
        'inline-flex h-[30px] items-center rounded-md border bg-surface-subtle p-0.5',
        invalid ? 'border-danger' : 'border-border',
        disabled && 'opacity-55',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <label
            key={option.value}
            className={cn(
              'relative inline-flex h-full items-center rounded-[4px] px-2.5 text-[12px] leading-[24px] whitespace-nowrap select-none',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-brand',
              disabled ? 'cursor-not-allowed' : 'cursor-pointer',
              selected
                ? 'bg-canvas font-bold text-text-primary shadow-segment'
                : disabled
                  ? 'font-normal text-text-secondary'
                  : 'font-normal text-text-secondary hover:text-text-primary',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}
