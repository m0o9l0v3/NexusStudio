import { CalendarDays, LayoutDashboard, ListChecks, Map, MapPin, Package, School, ScrollText, type LucideIcon } from 'lucide-react'

/**
 * Sidebar の領域（12 §1・15 Step 1-a）。順序・表示名・グループは Figma v2 `App Shell / Sidebar`（18:4）に合わせる（決定事項36 V2-2・V2-3）。
 * URL パスは v1 から変えない（ブックマーク・API の参照先を壊さないため）。
 */
export type NavArea = {
  path: string
  /** Sidebar・準備中表示に出す表示名（平易な日本語。決定事項36 V2-2）。 */
  label: string
  /** Toolbarの補足文。製品向けの文言があるものだけ設定する。 */
  subtitle?: string
  /** この画面を実装する予定の段階（15 v02 §8）。準備中表示で使う。 */
  plannedStep: string
  /** Lucide のアイコン（Sidebar では16px）。 */
  icon: LucideIcon
}

export type NavGroup = {
  /** グループ見出し。`null` は見出しを持たない先頭の項目（ホーム）。 */
  label: string | null
  areas: NavArea[]
}

export const navGroups: NavGroup[] = [
  {
    label: null,
    areas: [{ path: '/overview', label: 'ホーム', subtitle: '現在の公開状態と次の作業', plannedStep: 'PR 3（決定事項36 V2-8）', icon: LayoutDashboard }],
  },
  {
    label: 'コンテンツ',
    areas: [
      { path: '/events', label: 'イベント', plannedStep: 'Step 2', icon: CalendarDays },
      { path: '/spots', label: '地点', subtitle: '地点・会場の公開版と下書きを管理', plannedStep: 'Step 3以降', icon: MapPin },
      { path: '/open-campus', label: 'オープンキャンパス', plannedStep: 'Step 3以降', icon: School },
      { path: '/map-data', label: '地図', plannedStep: '技術検証と構成案の確認の後（実装移行計画 E・F）', icon: Map },
    ],
  },
  {
    label: '公開',
    areas: [
      { path: '/validation', label: '公開前チェック', subtitle: '下書き全体の診断', plannedStep: 'Step 4', icon: ListChecks },
      { path: '/releases', label: '公開履歴', subtitle: '公開・公開停止・復旧の履歴', plannedStep: 'Step 4', icon: Package },
    ],
  },
  {
    label: '運用',
    areas: [{ path: '/logs', label: '操作記録', subtitle: '保存・公開・ログインの記録', plannedStep: 'Step 4', icon: ScrollText }],
  },
]

/** すべての領域を Sidebar の順に並べたもの（ルーティング・既存コードとの互換用）。 */
export const navAreas: NavArea[] = navGroups.flatMap((group) => group.areas)
