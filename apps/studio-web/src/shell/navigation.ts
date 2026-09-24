/** Sidebarの領域（12 §1・15 Step 1-a）。順序はFigma `27:3` に合わせる。 */
export type NavArea = {
  path: string
  label: string
  /** Toolbarの補足文。Figmaに製品向けの文言があるものだけ設定する。 */
  subtitle?: string
  /** この画面を実装する予定の段階（15 v02 §8）。準備中表示で使う。 */
  plannedStep: string
}

export const navAreas: NavArea[] = [
  { path: '/overview', label: 'Overview', subtitle: '現在の公開状態と次の作業', plannedStep: 'Step 3以降' },
  { path: '/events', label: 'Events', plannedStep: 'Step 2' },
  { path: '/spots', label: 'Spots', subtitle: '地点・会場の公開版と下書きを管理', plannedStep: 'Step 3以降' },
  { path: '/open-campus', label: 'Open Campus', plannedStep: 'Step 3以降' },
  { path: '/map-data', label: 'Map Data', plannedStep: 'Step 3以降' },
  { path: '/validation', label: 'Validation', plannedStep: 'Step 4' },
  { path: '/releases', label: 'Releases', subtitle: '公開・取り下げ・復旧の履歴', plannedStep: 'Step 4' },
  { path: '/logs', label: 'Logs', subtitle: '保存・公開・ログインの記録', plannedStep: 'Step 4' },
]
