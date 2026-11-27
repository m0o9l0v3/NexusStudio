import * as Dialog from '@radix-ui/react-dialog'
import { Menu, X } from 'lucide-react'
import { useEffect, useRef, useState, type Ref } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useSessionQuery } from '../auth/session'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { AccountMenu } from './AccountMenu'
import { navGroups, type NavArea } from './navigation'

/**
 * Figma v2 `App Shell / Sidebar`（18:4、決定事項36 V2-12）。幅220px・右1px仕切り。
 * ロゴ直下に環境バッジ（12 UI-22、決定事項36 V2-7）、ホーム＋3グループ（コンテンツ／公開／運用）、最下部にアカウントメニュー。
 * 画面の高さが足りないときは縦にスクロールしてアカウントメニューへ届くようにする（検証記録 A-5 D9）。
 */
export function Sidebar({ className, navRef }: { className?: string; navRef?: Ref<HTMLElement> }) {
  const { data: session } = useSessionQuery()

  return (
    <aside className={cn('flex w-[220px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-sidebar px-3 pt-4 pb-3', className)}>
      <div className="flex shrink-0 flex-col items-start gap-2 px-2.5">
        <p className="text-[15px] leading-[1.3] font-bold text-text-primary">Nexus Studio</p>
        {session?.environmentLabel && (
          <span className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-hover px-2 py-0.5 text-[11px] leading-4 text-text-secondary">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning-dot" />
            {session.environmentLabel}
          </span>
        )}
      </div>

      <nav ref={navRef} aria-label="メインメニュー" className="flex shrink-0 flex-col gap-4">
        {navGroups.map((group) => (
          <div key={group.label ?? 'top'} className="flex flex-col gap-0.5">
            {group.label && <p className="px-2.5 pb-1 text-[11px] leading-4 font-bold text-text-secondary">{group.label}</p>}
            {group.areas.map((area) => (
              <SidebarLink key={area.path} area={area} />
            ))}
          </div>
        ))}
      </nav>

      {session && (
        <div className="mt-auto shrink-0 border-t border-border-subtle pt-2">
          <AccountMenu session={session} />
        </div>
      )}
    </aside>
  )
}

export function MobileSidebar({ responsive, onFocusFallback }: { responsive: boolean; onFocusFallback: () => void }) {
  const { key: locationKey } = useLocation()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const open = responsive && openedAt === locationKey
  if (openedAt !== null && !open) setOpenedAt(null)

  useEffect(() => {
    if (!open) return
    const desktop = window.matchMedia('(min-width: 48rem)')
    function closeOnDesktop() {
      if (desktop.matches) setOpenedAt(null)
    }
    closeOnDesktop()
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [open])

  return (
    <div className={cn('shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3 py-1', responsive ? 'flex md:hidden' : 'hidden')}>
      <Dialog.Root open={open} onOpenChange={(nextOpen) => setOpenedAt(nextOpen ? locationKey : null)}>
        <Dialog.Trigger asChild>
          <Button ref={triggerRef} variant="ghost" aria-label="メインメニューを開く" className="px-2">
            <Menu aria-hidden size={20} />
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" onClick={() => setOpenedAt(null)} />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 w-[220px] max-w-full bg-sidebar shadow-floating focus:outline-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              const trigger = triggerRef.current
              if (trigger?.isConnected && trigger.offsetParent !== null) trigger.focus()
              else onFocusFallback()
            }}
          >
            <Dialog.Title className="sr-only">メインメニュー</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="メインメニューを閉じる" className="absolute top-2 right-2 px-2">
                <X aria-hidden size={18} />
              </Button>
            </Dialog.Close>
            <Sidebar className="h-full max-w-full" />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <span className="text-[15px] leading-[1.3] font-bold text-text-primary">Nexus Studio</span>
    </div>
  )
}

function SidebarLink({ area }: { area: NavArea }) {
  const Icon = area.icon
  return (
    <NavLink
      to={area.path}
      className={({ isActive }) =>
        cn(
          'flex h-9 items-center gap-2 rounded-md px-2.5 text-[13px] leading-[19px]',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
          isActive
            ? 'bg-nav-active font-bold text-text-primary'
            : 'font-normal text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon aria-hidden size={16} strokeWidth={1.5} className={cn('shrink-0', isActive && 'text-brand')} />
          <span className="truncate">{area.label}</span>
        </>
      )}
    </NavLink>
  )
}
