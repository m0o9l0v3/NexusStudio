import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { logout, type Session } from '../api/auth'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { Dialog, DialogActions } from '../ui/Dialog'
import { useUnsavedChangesRegistry } from './unsavedChanges'

/**
 * Figma E31「管理者メニュー」（94:1648、Component `Account Menu` 94:1644）。
 * 未保存の変更がある場合は、ログアウトの前に確認する（E32 `94:1782`）。
 */
export function AccountMenu({ session }: { session: Session }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const unsaved = useUnsavedChangesRegistry()
  const [loggingOut, setLoggingOut] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // 通信できなくても、この画面からは認証済みの表示を消してログイン画面へ戻す。
      // Cookieが残っていてもHttpOnly・期限付きであり、次にログイン画面を開いたときに状態を確認し直す。
    }
    queryClient.clear()
    // 未保存の変更は利用者が破棄を選んだ後なので、離脱確認を出さずに移動する。
    void navigate('/login', { replace: true, state: { skipUnsavedGuard: true } })
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={cn(
            'rounded text-[11px] leading-[19px] whitespace-pre text-text-secondary hover:text-text-primary',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand data-[state=open]:text-text-primary',
          )}
        >
          {`管理者  ${session.displayName}`}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={8}
            className="z-30 flex w-[184px] flex-col items-start gap-2.5 rounded-lg border border-border bg-surface p-2.5 shadow-menu"
          >
            <DropdownMenu.Label className="text-[12px] leading-5 font-medium text-text-secondary">
              {`管理者 ${session.displayName}`}
              <span className="block text-[11px] leading-[19px] font-normal break-all">{session.email}</span>
            </DropdownMenu.Label>
            <DropdownMenu.Item
              disabled={loggingOut}
              onSelect={() => {
                if (unsaved.hasUnsavedChanges()) setConfirming(true)
                else void handleLogout()
              }}
              className={cn(
                'flex h-10 w-[120px] cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-[14px] leading-[22px] font-medium text-text-primary outline-none',
                'data-[highlighted]:bg-surface-subtle data-[highlighted]:outline-2 data-[highlighted]:outline-brand data-[disabled]:opacity-45',
              )}
            >
              {loggingOut ? 'ログアウト中…' : 'ログアウト'}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title="未保存の変更があります"
        description="ログアウトすると、この画面の未保存の入力は失われます。保存してから戻るか、変更を破棄してログアウトしてください。"
      >
        <DialogActions>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            戻る
          </Button>
          <Button variant="danger" disabled={loggingOut} onClick={() => void handleLogout()}>
            破棄してログアウト
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
