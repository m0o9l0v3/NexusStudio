import type { StatusTone } from '../ui/StatusBadge'
import type { PublishAction, TargetKind } from '../api/releases'

/** 公開状態の表示（07 §5）。状態はAPIが Release から算出する。 */
export function publicationBadge(state: string): { label: string; tone: StatusTone } {
  switch (state) {
    case 'published':
      return { label: '公開中', tone: 'success' }
    case 'publishedWithChanges':
      return { label: '公開中・未公開変更あり', tone: 'warning' }
    case 'withdrawn':
      return { label: '取り下げ済み', tone: 'neutral' }
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
  spot: 'Spot',
}

export const actionVerbs: Record<PublishAction, string> = { publish: '公開', withdraw: '取り下げ', restore: '復旧' }

/** 最終ボタンの文言。実際の操作と対象を示す（11 §5）。 */
export function actionLabel(kind: TargetKind, action: PublishAction): string {
  const target = kind === 'categories' ? 'カテゴリ一覧' : `この${kindNouns[kind]}`
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
    default:
      return `/spots?id=${encodeURIComponent(id)}`
  }
}

/** 公開確認画面。復旧では戻す版（revisionId）を指定する。 */
export function reviewPath(kind: TargetKind, id: string, action: PublishAction = 'publish', revisionId?: string): string {
  const params = new URLSearchParams()
  if (kind === 'spot') params.set('id', id)
  if (action !== 'publish') params.set('action', action)
  if (action === 'restore' && revisionId) params.set('revision', revisionId)
  const query = params.size > 0 ? `?${params.toString()}` : ''
  switch (kind) {
    case 'event':
      return `/events/${id}/publish${query}`
    case 'occurrence':
      return `/open-campus/${id}/publish${query}`
    case 'categories':
      return `/events/categories/publish${query}`
    default:
      return `/spots/publish${query}`
  }
}
