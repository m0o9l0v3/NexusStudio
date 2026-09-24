import { Outlet } from 'react-router'
import { Sidebar } from './Sidebar'

/**
 * Figma App Shell（`27:2`）：Sidebar 216px ＋ Workspace（Toolbar 64px ＋ 本文）。
 * 右Inspectorは画面ごとに Workspace の中で配置する。
 */
export function AppShell() {
  return (
    <div className="flex h-svh min-w-[1280px] bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}
