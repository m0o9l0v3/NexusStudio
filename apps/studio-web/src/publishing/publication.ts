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

/** API の所見テンプレートに含まれる旧表記だけを変換する。登録名や ID を含む部分はそのまま表示する。 */
export function formatFindingMessage({ code, message }: Pick<ValidationFinding, 'code' | 'message'>): string {
  switch (code) {
    case 'slots_required':
      return '日時を1つ以上追加してください。'
    case 'occurrence_no_days':
      return '開催日がありません。イベントはこの開催回の日時を公開できません。'
    case 'restore_stashes_draft':
      return '未公開の下書きがあります。復旧の前に退避し、公開履歴から内容を確認できます。'
    case 'not_published':
      return '公開中ではないため公開をやめられません。'
    case 'withdraw_not_supported':
      return 'カテゴリ一覧は公開をやめられません。使わないカテゴリは「新規選択停止」にしてください。'
    case 'spot_map_unpublished':
      return '地図が公開されていません。地点は地図を公開してから公開できます。'
    case 'spot_id_kind_conflict':
      return 'この ID は地点の目的地にならない地図要素として公開されています。'
    case 'bundle_too_large':
      return message.replace(/地図や Spot の内容を見直してください。$/, '地図や地点の内容を見直してください。')
    case 'restore_all_day_time_differs':
      return message.replace(/^(\d+月\d+日)の終日枠は、/, '$1の終日の日時は、')
    case 'occurrence_in_use':
      return message.replace(/）がこの開催回を使っています。先にイベントを取り下げるか、別の開催回へ変更して公開してください。$/, '）がこの開催回を使っています。先にイベントの公開をやめるか、別の開催回へ変更して公開してください。')
    case 'spot_in_use':
      return message.replace(/）がこのSpotを会場にしています。先にイベントの会場を変更して公開してください。$/, '）がこの地点を会場にしています。先にイベントの会場を変更して公開してください。')
    case 'map_in_use':
      return message.replace(/^公開中のSpot（/, '公開中の地点（').replace(/先にSpotを取り下げてください。$/, '先に地点の公開をやめてください。')
    case 'venue_spot_missing':
    case 'venue_spot_not_selectable':
      return message.replace(/^Spot「/, '地点「')
    case 'venue_spot_unpublished':
      return message.replace(/^Spot「/, '地点「').replace(/」が公開されていません。Spotを公開するか、会場を変更してください。$/, '」が公開されていません。地点を公開するか、会場を変更してください。')
    case 'venue_spot_withdrawn':
      return message.replace(/^Spot「/, '地点「').replace(/」は取り下げ済みです。会場を変更してください。$/, '」は公開停止です。会場を変更してください。')
    case 'slot_in_past':
      return message.replace(/過去の枠を追加・変更して公開してよいか確認してください。$/, '過去の日時を追加・変更して公開してよいか確認してください。')
    case 'day_in_use_by_published_event':
      return message.replace(/」の枠が使っている開催日を削除しようとしています。$/, '」の日時が使っている開催日を削除しようとしています。')
    case 'all_day_hours_removed':
      return message.replace(/」の終日枠（(\d+月\d+日)）が参照する一般公開時間がなくなります。$/, '」の終日の日時（$1）が参照する一般公開時間がなくなります。')
    case 'all_day_times_change':
      return message.replace(/^終日枠（/, '終日の日時（')
    case 'slot_outside_public_hours':
      return message.replace(/^(\d+月\d+日)の枠（/, '$1の日時（')
    case 'day_cancelled':
      return message.replace(/の中止により、この枠も中止として表示されます。$/, 'の中止により、この日時も中止として表示されます。')
    case 'spot_withdrawn_in_use':
      return message.replace(/）がこのSpotを会場にしています。取り下げ済みにする前に、イベントの会場を変更して公開してください。$/, '）がこの地点を会場にしています。公開停止にする前に、イベントの会場を変更して公開してください。')
    case 'building_name_differs':
      return message.replace(
        /^([^：「\n]+：)?Spot の名称「([\s\S]*)」と地図の建物名「([\s\S]*)」が異なります。この建物を目的地として示すときは Spot の名称、(ほかの地点の所在（例「\3・2F」）には地図の建物名が使われます。意図した違いか確認してください。)$/,
        '$1地点の名称「$2」と地図の建物名「$3」が異なります。この建物を目的地として示すときは地点の名称、$4',
      )
    default:
      return message
  }
}
