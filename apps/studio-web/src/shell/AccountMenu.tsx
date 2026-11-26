import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useQueryClient } from '@tanstack/react-query'
import { CircleUser, LogOut } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { logout, type Session } from '../api/auth'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { Dialog, DialogActions } from '../ui/Dialog'
import { useUnsavedChangesRegistry } from './unsavedChanges'

/**
 * Figma v2 Sidebar（18:4）下部の「アカウント」。メニューに表示名・メールアドレス・ログアウトを出す（決定事項36 V2-3）。
 * v1 の E31「管理者メニュー」（94:1648）の役割を引き継ぐ。
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
            'flex h-9 w-full shrink-0 items-center gap-2 rounded-md px-2.5 text-[13px] leading-[19px] font-normal text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand data-[state=open]:bg-surface-hover data-[state=open]:text-text-primary',
          )}
        >
          <CircleUser aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
          アカウント
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={6}
            className="z-30 flex w-[232px] flex-col gap-1 rounded-lg border border-border bg-canvas p-1.5 shadow-menu"
          >
            <DropdownMenu.Label className="flex flex-col px-2.5 py-2">
              <span className="text-[13px] leading-[19px] font-bold break-all text-text-primary">{session.displayName}</span>
              <span className="text-[11px] leading-4 break-all text-text-secondary">{session.email}</span>
            </DropdownMenu.Label>
            <DropdownMenu.Separator className="mx-1 h-px bg-border-subtle" />
            <DropdownMenu.Item
              disabled={loggingOut}
              onSelect={() => {
                if (unsaved.hasUnsavedChanges()) setConfirming(true)
                else void handleLogout()
              }}
              className={cn(
                'flex h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[13px] leading-[19px] font-normal text-text-primary outline-none',
                'data-[highlighted]:bg-surface-hover data-[highlighted]:outline-2 data-[highlighted]:outline-brand data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
              )}
            >
              <LogOut aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-text-secondary" />
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
