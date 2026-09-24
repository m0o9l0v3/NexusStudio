import { useId } from 'react'
import selectedIcon from '../assets/icons/radio-selected.svg'
import unselectedIcon from '../assets/icons/radio-unselected.svg'
import { cn } from './cn'

type Choice<T extends string> = { value: T; label: string }

type ChoiceGroupProps<T extends string> = {
  label: string
  name: string
  value: T | null
  choices: Choice<T>[]
  onChange: (value: T) => void
  /** 選択肢1つの幅。Figma：Time Mode 168px／Participation Radio 270px。 */
  optionWidthClass: string
  invalid?: boolean
  message?: string
}

/**
 * Figma `Time Mode`（70:236）・`Participation Radio`（70:243）。
 * 未選択（null）を許し、どちらかを自動で選ばない（07 EV-42、AC26）。矢印キーでも選べるよう標準のradioを使う。
 */
export function ChoiceGroup<T extends string>({ label, name, value, choices, onChange, optionWidthClass, invalid, message }: ChoiceGroupProps<T>) {
  const labelId = useId()
  return (
    <div role="radiogroup" aria-labelledby={labelId} aria-invalid={invalid || undefined} className="flex flex-col gap-3">
      <p id={labelId} className={cn('text-[12px] leading-5 font-medium', invalid ? 'text-danger' : 'text-text-primary')}>
        {label}
      </p>
      <div className="flex gap-2">
        {choices.map((choice) => {
          const selected = choice.value === value
          return (
            <label
              key={choice.value}
              className={cn(
                'relative flex h-10 cursor-pointer items-center gap-2 rounded-[7px] border px-3 text-[13px] leading-[21px] font-medium',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-brand',
                selected ? 'border-brand bg-brand-subtle text-brand' : 'border-border bg-surface text-text-primary hover:bg-surface-subtle',
                optionWidthClass,
              )}
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={selected}
                onChange={() => onChange(choice.value)}
                className="sr-only"
              />
              <img src={selected ? selectedIcon : unselectedIcon} alt="" width={16} height={16} />
              {choice.label}
            </label>
          )
        })}
      </div>
      {message && <p className="text-[11px] leading-[19px] text-danger">{message}</p>}
    </div>
  )
}
