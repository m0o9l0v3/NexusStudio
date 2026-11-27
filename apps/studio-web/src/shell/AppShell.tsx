import { useRef } from 'react'
import { Outlet, useMatches } from 'react-router'
import { cn } from '../ui/cn'
import { MobileSidebar, Sidebar } from './Sidebar'

/**
 * Figma v2 フラット App Shell（`9:2`、決定事項36 V2-12）：
 * 左 Sidebar 220px（`bg-sidebar`＋1px `border-border` 仕切り）＋ 右 白キャンバス（`bg-canvas`、54px Toolbar ＋ 本文）。
 * ルートの handle.responsive が true の画面は最小幅を外し、md 未満でモバイルメニューを表示する。
 */
export function AppShell() {
  const responsive = useMatches().some((match) => (match.handle as { responsive?: boolean } | undefined)?.responsive === true)
  const sidebarNav = useRef<HTMLElement>(null)

  function focusSidebarLink() {
    const nav = sidebarNav.current
    const link = nav?.querySelector<HTMLAnchorElement>('a[aria-current="page"]') ?? nav?.querySelector('a')
    link?.focus()
  }

  return (
    <div className={cn('flex h-svh bg-canvas', responsive ? 'min-w-0 max-md:flex-col' : 'min-w-[1280px]')}>
      <Sidebar className={responsive ? 'max-md:hidden' : undefined} navRef={sidebarNav} />
      <MobileSidebar responsive={responsive} onFocusFallback={focusSidebarLink} />
      <div className={cn('flex min-w-0 flex-1 flex-col bg-canvas', responsive && 'max-md:min-h-0')}>
        <Outlet />
      </div>
    </div>
  )
}
