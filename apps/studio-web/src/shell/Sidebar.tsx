import { NavLink } from 'react-router'
import { useSessionQuery } from '../auth/session'
import { Badge } from '../ui/Badge'
import { cn } from '../ui/cn'
import { AccountMenu } from './AccountMenu'
import { navAreas } from './navigation'

/** Figma `App Shell / Sidebar`（27:3）。 */
export function Sidebar() {
  const { data: session } = useSessionQuery()

  return (
    <aside className="flex w-[216px] shrink-0 flex-col items-start gap-2 border-r border-border bg-surface px-4 pt-[18px] pb-4">
      <div className="flex flex-col gap-[3px]">
        <p className="text-[16px] leading-6 font-bold text-text-primary">NEXUS STUDIO</p>
        <p className="text-[10px] leading-[18px] text-text-secondary">キャンパス制作環境</p>
      </div>
      {session?.environmentLabel && <Badge tone="info">{session.environmentLabel}</Badge>}

      <nav aria-label="メインメニュー" className="flex flex-col gap-2">
        {navAreas.map((area) => (
          <NavLink
            key={area.path}
            to={area.path}
            className={({ isActive }) =>
              cn(
                'flex h-10 w-[184px] items-center rounded-lg px-3 text-[13px] leading-[21px]',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
                isActive ? 'bg-brand-subtle font-medium text-brand' : 'text-text-secondary hover:bg-surface-subtle',
              )
            }
          >
            {area.label}
          </NavLink>
        ))}
      </nav>

      {/* Figmaでは管理者名がNavの下350pxの位置にある。高さが足りない画面では詰める。 */}
      <div aria-hidden className="max-h-[350px] min-h-0 flex-1" />
      {session && <AccountMenu session={session} />}
    </aside>
  )
}
