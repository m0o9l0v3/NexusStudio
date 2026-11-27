import type { StatusTone } from '../ui/StatusLabel'
import type { PublishAction, TargetKind, ValidationFinding } from '../api/releases'

/** 公開状態の表示（07 §5）。状態はAPIが Release から算出する。 */
export function publicationBadge(state: string): { label: string; tone: StatusTone } {
  switch (state) {
    case 'published':
      return { label: '公開中', tone: 'success' }
    case 'publishedWithChanges':
      return { label: '公開中・変更あり', tone: 'warning' }
    case 'withdrawn':
      return { label: '公開停止', tone: 'neutral' }
    default:
      return { label: '未公開', tone: 'neutral' }
  }
}

/** 参加者向けに提供されているか（取り下げの対象になるか）。 */
export function isLive(state: string): boolean {
  return state === 'published' || state === 'publishedWithChanges'
}

export const kindNouns: Record<TargetKind, string> = {
  event: 'イベント',
  occurrence: '開催回',
  categories: 'カテゴリ一覧',
  spot: '地点',
  map: '地図',
}

export const actionVerbs: Record<PublishAction, string> = { publish: '公開', withdraw: '公開をやめる', restore: '復旧' }

/** 最終ボタンの文言。実際の操作と対象を示す（11 §5）。 */
export function actionLabel(kind: TargetKind, action: PublishAction): string {
  const target = kind === 'categories' ? 'カテゴリ一覧' : `この${kindNouns[kind]}`
  if (action === 'withdraw') return `${target}の${actionVerbs[action]}`
  if (action === 'restore') return `${target}をこの版に戻して公開`
  return `${target}を${actionVerbs[action]}`
}

/** 対象の編集画面。 */
export function editorPath(kind: string, id: string): string {
  switch (kind) {
    case 'event':
      return `/events/${id}`
    case 'occurrence':
      return `/open-campus/${id}`
    case 'categories':
      return '/events/categories'
    case 'map':
      // 地図は Studio で編集しない（取り込みは管理コマンド。決定事項31 D1）。Map Data 画面は構成の確定後に作る。
      return '/map-data'
    default:
      return `/spots?id=${encodeURIComponent(id)}`
  }
}

/** 公開確認画面。復旧では戻す版（revisionId）を指定する。 */
export function reviewPath(kind: TargetKind, id: string, action: PublishAction = 'publish', revisionId?: string): string {
  const params = new URLSearchParams()
  if (kind === 'spot') params.set('id', id)
  if (action !== 'publish') params.set('action', action)
  // 地図は下書きを持たないため、公開でも公開する版（取り込んだ版）を指定する。
  if ((action === 'restore' || kind === 'map') && revisionId) params.set('revision', revisionId)
  const query = params.size > 0 ? `?${params.toString()}` : ''
  switch (kind) {
    case 'event':
      return `/events/${id}/publish${query}`
    case 'occurrence':
      return `/open-campus/${id}/publish${query}`
    case 'categories':
      return `/events/categories/publish${query}`
    case 'map':
      return `/map-data/publish${query}`
    default:
      return `/spots/publish${query}`
  }
}

/** slots[1].venues[0] → 日時2・会場1 */
export function describePath(path: string): string {
  const slot = /^slots\[(\d+)\](?:\.([\w]+)(?:\[(\d+)\])?)?/.exec(path)
  const item = /^items\[(\d+)\]/.exec(path)
  const day = /days\[(\d+)\]/.exec(path)
  if (slot) {
    const [, index, field, venueIndex] = slot
    const slotFields: Record<string, string> = { ocDayId: '開催日', timeMode: '時間方式', fixed: '時刻', participation: '参加案内', venues: '会場' }
    const suffix = field && slotFields[field] ? `・${slotFields[field]}` : ''
    const venue = field === 'venues' && venueIndex !== undefined ? Number(venueIndex) + 1 : ''
    return `日時${Number(index) + 1}${suffix}${venue}`
  }
  if (item) return `カテゴリ${Number(item[1]) + 1}`
  if (day) return `開催日${Number(day[1]) + 1}`
  const labels: Record<string, string> = { title: 'タイトル', description: '説明', categoryId: 'カテゴリ', occurrenceId: '開催回', name: '名称', utilization: '利用状態', kind: '種別', items: 'カテゴリ', days: '開催日', slots: '日時' }
  return labels[path] ?? path
}

/** API や保存済みの所見・操作記録に含まれる旧表記を表示時にそろえる。 */
export function normalizePublicationTerms(message: string, withdraw = '公開停止'): string {
  return message
    .replaceAll('開催枠', '日時')
    .replaceAll('過去の枠', '過去の日時')
    .replaceAll('終日枠', '終日の日時')
    .replaceAll('の枠が', 'の日時が')
    .replaceAll('取り下げ済み', '公開停止')
    .replaceAll('取り下げられません', '公開をやめられません')
    .replaceAll('取り下げる', '公開をやめる')
    .replaceAll('取り下げて', '公開をやめて')
    .replaceAll('取り下げ', withdraw)
    .replaceAll(/公開阻止(?:の問題)?/g, '公開できない問題')
    .replaceAll(/\bReleases\b(?: の履歴)?/g, '公開履歴')
    .replaceAll('地図や Spot の', '地図や地点の')
    .replaceAll(/\bSpot (?=[はのを])/g, '地点')
    .replaceAll(/\bSpot\b/g, '地点')
}

export function formatFindingMessage(finding: Pick<ValidationFinding, 'code' | 'message'>): string {
  if (finding.code === 'slots_required') return '日時を1つ以上追加してください。'
  return normalizePublicationTerms(finding.message)
}
