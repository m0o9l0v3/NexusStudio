import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { logout, type Session } from '../api/auth'
import { cn } from '../ui/cn'

/**
 * Figma E31「管理者メニュー」（94:1648、Component `Account Menu` 94:1644）。
 * 未保存の変更がある画面でのログアウト確認（E32）は、編集画面の実装（Step 2）で追加する。
 */
export function AccountMenu({ session }: { session: Session }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // 通信できなくても、この画面からは認証済みの表示を消してログイン画面へ戻す。
      // Cookieが残っていてもHttpOnly・期限付きであり、次にログイン画面を開いたときに状態を確認し直す。
    }
    queryClient.clear()
    void navigate('/login', { replace: true })
  }

  return (
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
            onSelect={(event) => {
              event.preventDefault()
              void handleLogout()
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
  )
}
