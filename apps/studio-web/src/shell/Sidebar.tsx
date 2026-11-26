import { NavLink } from 'react-router'
import { useSessionQuery } from '../auth/session'
import { cn } from '../ui/cn'
import { AccountMenu } from './AccountMenu'
import { navGroups, type NavArea } from './navigation'

/**
 * Figma v2 `App Shell / Sidebar`（18:4、決定事項36 V2-12）。幅220px・右1px仕切り。
 * ロゴ直下に環境バッジ（12 UI-22、決定事項36 V2-7）、ホーム＋3グループ（コンテンツ／公開／運用）、最下部にアカウントメニュー。
 * 画面の高さが足りないときは縦にスクロールしてアカウントメニューへ届くようにする（検証記録 A-5 D9）。
 */
export function Sidebar() {
  const { data: session } = useSessionQuery()

  return (
    <aside className="flex w-[220px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-sidebar px-3 pt-4 pb-3">
      <div className="flex shrink-0 flex-col items-start gap-2 px-2.5">
        <p className="text-[15px] leading-[1.3] font-bold text-text-primary">Nexus Studio</p>
        {session?.environmentLabel && (
          <span className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-hover px-2 py-0.5 text-[11px] leading-4 text-text-secondary">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning-dot" />
            {session.environmentLabel}
          </span>
        )}
      </div>

      <nav aria-label="メインメニュー" className="flex shrink-0 flex-col gap-4">
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
