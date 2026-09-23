import * as RadixDialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

type DialogProps = {
  open: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description: ReactNode
  children?: ReactNode
  /** falseなら背景クリック・Escで閉じない（操作の選択を必ず求める場合）。 */
  dismissible?: boolean
}

/** Figma `Dialog`（71:254）。確認・危険操作・セッション期限切れの共通ダイアログ。 */
export function Dialog({ open, onOpenChange, title, description, children, dismissible = true }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <RadixDialog.Content
          className="fixed top-1/2 left-1/2 z-50 flex w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-[18px] rounded-xl border border-border bg-surface p-6 focus:outline-none"
          onEscapeKeyDown={(event) => !dismissible && event.preventDefault()}
          onPointerDownOutside={(event) => !dismissible && event.preventDefault()}
          onInteractOutside={(event) => !dismissible && event.preventDefault()}
        >
          <RadixDialog.Title className="text-[18px] leading-[26px] font-bold text-text-primary">{title}</RadixDialog.Title>
          <RadixDialog.Description className="text-[13px] leading-[21px] text-text-secondary">{description}</RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

export const DialogClose = RadixDialog.Close

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="flex gap-3">{children}</div>
}
