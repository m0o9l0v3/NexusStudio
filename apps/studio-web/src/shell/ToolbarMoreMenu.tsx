import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Ellipsis } from 'lucide-react'
import { cn } from '../ui/cn'

export type ToolbarMoreItem = { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean }

/**
 * 1280px未満の Toolbar で、常に見せる操作以外をまとめるメニュー（2026-10-15 利用者判断、検証記録 A-5 D9）。
 * 見た目はアカウントメニュー（Figma v2 Sidebar 18:4）に合わせる。
 */
export function ToolbarMoreMenu({ label, note, items }: { label: string; note?: string; items: ToolbarMoreItem[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={label}
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-canvas text-text-primary hover:bg-surface-hover',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand data-[state=open]:bg-surface-hover',
        )}
      >
        <Ellipsis aria-hidden size={16} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-30 flex w-[220px] flex-col items-stretch gap-1.5 rounded-lg border border-border bg-canvas p-1.5 shadow-menu"
        >
          {note && <DropdownMenu.Label className="px-1.5 py-1 text-[12px] leading-[17px] font-normal text-text-secondary">{note}</DropdownMenu.Label>}
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                'flex h-9 cursor-pointer items-center justify-center rounded-md border bg-canvas px-3 text-[13px] leading-[19px] font-normal outline-none',
                item.danger
                  ? 'border-danger-border text-danger data-[highlighted]:bg-danger-subtle'
                  : 'border-border text-text-primary data-[highlighted]:bg-surface-hover',
                'data-[highlighted]:outline-2 data-[highlighted]:outline-brand data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
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
