import { NavLink } from 'react-router'
import { useSessionQuery } from '../auth/session'
import { Badge } from '../ui/Badge'
import { cn } from '../ui/cn'
import { AccountMenu } from './AccountMenu'
import { navGroups, type NavArea } from './navigation'

/**
 * Figma v2 `App Shell / Sidebar`（18:4）。ロゴ直下に環境バッジ（12 UI-22、決定事項36 V2-7）、
 * ホーム＋3グループ（コンテンツ／公開／運用）、最下部にアカウントメニュー。
 * 画面の高さが足りないときは縦にスクロールしてアカウントメニューへ届くようにする（検証記録 A-5 D9）。
 */
export function Sidebar() {
  const { data: session } = useSessionQuery()

  return (
    <aside className="flex w-[216px] shrink-0 flex-col gap-4 overflow-y-auto bg-sidebar px-3 pt-5 pb-3">
      <div className="flex shrink-0 flex-col items-start gap-1.5 px-2.5">
        <p className="text-[15px] leading-6 text-text-primary">
          <span className="font-bold">Nexus</span> <span className="font-normal">Studio</span>
        </p>
        {session?.environmentLabel && (
          <Badge tone="info">
            {session.environmentLabel}
          </Badge>
        )}
      </div>

      <nav aria-label="メインメニュー" className="flex shrink-0 flex-col gap-4">
        {navGroups.map((group) => (
          <div key={group.label ?? 'top'} className="flex flex-col gap-0.5">
            {group.label && <p className="px-2.5 pb-1 text-[11px] leading-[19px] font-medium text-text-secondary">{group.label}</p>}
            {group.areas.map((area) => (
              <SidebarLink key={area.path} area={area} />
            ))}
          </div>
        ))}
      </nav>

      {session && (
        <div className="mt-auto shrink-0 border-t border-border pt-2">
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
          'flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] leading-[21px]',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
          isActive ? 'bg-brand-nav font-medium text-brand-nav-text' : 'text-text-primary hover:bg-black/5',
        )
      }
    >
      <Icon aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
      <span className="truncate">{area.label}</span>
    </NavLink>
  )
}
