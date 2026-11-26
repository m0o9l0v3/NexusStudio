import { Outlet, useMatches } from 'react-router'
import { cn } from '../ui/cn'
import { Sidebar } from './Sidebar'

/**
 * Figma v2 フラット App Shell（`9:2`、決定事項36 V2-12）：
 * 左 Sidebar 220px（`bg-sidebar`＋1px `border-border` 仕切り）＋ 右 白キャンバス（`bg-canvas`、54px Toolbar ＋ 本文）。
 * 1280px未満に対応した画面（ルートの handle.responsive）だけ最小幅を外す。対応前の画面は横スクロールで操作する（検証記録 A-5 D9）。
 */
export function AppShell() {
  const responsive = useMatches().some((match) => (match.handle as { responsive?: boolean } | undefined)?.responsive)
  return (
    <div className={cn('flex h-svh bg-canvas', responsive ? 'min-w-0' : 'min-w-[1280px]')}>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <Outlet />
      </div>
    </div>
  )
}
