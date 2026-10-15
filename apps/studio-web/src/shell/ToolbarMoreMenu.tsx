import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '../ui/cn'

export type ToolbarMoreItem = { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean }

/**
 * 1280px未満の Toolbar で、常に見せる操作以外をまとめるメニュー（2026-10-15 利用者判断、検証記録 A-5 D9）。
 * 見た目は管理者メニュー（Figma `Account Menu` 94:1644）に合わせる。
 */
export function ToolbarMoreMenu({ label, note, items }: { label: string; note?: string; items: ToolbarMoreItem[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={label}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-[16px] leading-6 font-bold text-text-primary hover:bg-surface-subtle',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand data-[state=open]:bg-surface-subtle',
        )}
      >
        <span aria-hidden>⋯</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-30 flex w-[220px] flex-col items-stretch gap-2 rounded-lg border border-border bg-surface p-2.5 shadow-menu"
        >
          {note && <DropdownMenu.Label className="text-[12px] leading-5 font-medium text-text-secondary">{note}</DropdownMenu.Label>}
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                'flex h-10 cursor-pointer items-center justify-center rounded-lg border bg-surface px-3 text-[14px] leading-[22px] font-medium text-text-primary outline-none',
                item.danger ? 'border-danger' : 'border-border',
                'data-[highlighted]:bg-surface-subtle data-[highlighted]:outline-2 data-[highlighted]:outline-brand data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
              )}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
