import type { EventDraft, EventSlot } from '../api/events'
import type { CategoryDraft } from '../api/categories'
import type { OccurrenceDraft, OcDayDraft } from '../api/occurrences'
import type { PreviewItem, PreviewReferences } from '../api/releases'
import type { SpotDraft } from '../api/spots'
import { formatDateLong, participationLabels } from '../events/model'

/** 差分の種類（Figma R01 のバッジ）。 */
export type DiffKind = '追加' | '変更' | '削除' | '参照' | '取り下げ'

/** 公開確認の差分1行。公開中と公開候補を横に並べる（17 §3）。 */
export type DiffRow = { kind: DiffKind; label: string; published: string; candidate: string }

type Names = { occurrences: Map<string, string> }

const none = 'なし'

/** 差分の元になる2つの内容（公開確認の対象、または履歴の1件）。 */
export type DiffSource = Pick<PreviewItem, 'action' | 'targetKind' | 'event' | 'occurrence' | 'categories' | 'spot'>

/** 公開確認・履歴に出す差分。取り下げでは「公開を終了する」ことだけを示す。 */
export function diffRows(item: DiffSource, published: PreviewReferences, candidate: PreviewReferences, names: Names): DiffRow[] {
  if (item.action === 'withdraw') {
    return [{ kind: '取り下げ', label: '公開', published: '公開中', candidate: '公開を終了（下書きと履歴は残ります）' }]
  }

  switch (item.targetKind) {
    case 'event':
      return eventRows(item.event?.published ?? null, item.event?.candidate ?? null, published, candidate, names)
    case 'occurrence':
      return occurrenceRows(item.occurrence?.published ?? null, item.occurrence?.candidate ?? null)
    case 'categories':
      return categoryRows(item.categories?.published ?? null, item.categories?.candidate ?? null)
    case 'spot':
      return spotRows(item.spot?.published ?? null, item.spot?.candidate ?? null)
    default:
      return []
  }
}

function compare(rows: DiffRow[], label: string, before: string | null, after: string | null) {
  if (before === after) return
  rows.push({
    kind: before === null ? '追加' : after === null ? '削除' : '変更',
    label,
    published: before ?? none,
    candidate: after ?? none,
  })
}

function text(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null
}

// ---- イベント ----

function dayOf(refs: PreviewReferences, dayId: string | null) {
  return dayId ? refs.days.find((day) => day.id === dayId) : undefined
}

function slotTime(slot: EventSlot, refs: PreviewReferences): string {
  const day = dayOf(refs, slot.ocDayId)
  const date = day?.date ? formatDateLong(day.date) : '開催日不明'
  if (slot.timeMode === 'allDay') return `${date} 終日`
  if (slot.timeMode === 'fixed') return `${date} ${slot.fixed?.start ?? '--:--'}–${slot.fixed?.end ?? '--:--'}`
  return `${date}（時間方式未選択）`
}

function venues(slot: EventSlot, refs: PreviewReferences): string {
  if (slot.venues.length === 0) return '会場なし'
  return slot.venues.map((venue) => refs.spots.find((spot) => spot.canonicalId === venue.canonicalSpotId)?.name ?? venue.canonicalSpotId).join('／')
}

function slotSummary(slot: EventSlot, refs: PreviewReferences): string {
  const participation = slot.participation ? participationLabels[slot.participation as keyof typeof participationLabels] : '参加案内未選択'
  const cancelled = slot.status === 'cancelled' ? `・中止${slot.cancelNote ? `（${slot.cancelNote}）` : ''}` : ''
  return `${slotTime(slot, refs)}・${participation}・${venues(slot, refs)}${cancelled}`
}

/** 終日の実時間。公開版には時刻を書かず、開催日の一般公開時間から解決する（28 S4-3）。 */
function allDayHours(slot: EventSlot, refs: PreviewReferences): string | null {
  if (slot.timeMode !== 'allDay') return null
  const day = dayOf(refs, slot.ocDayId)
  if (!day?.date) return null
  return `${formatDateLong(day.date)} ${day.publicStart && day.publicEnd ? `${day.publicStart}–${day.publicEnd}` : '時間未登録'}`
}

function eventRows(before: EventDraft | null, after: EventDraft | null, beforeRefs: PreviewReferences, afterRefs: PreviewReferences, names: Names): DiffRow[] {
  const rows: DiffRow[] = []
  if (!after) return rows
  compare(rows, 'タイトル', before ? (text(before.title) ?? '（未入力）') : null, text(after.title) ?? '（未入力）')
  compare(rows, '説明', before ? (text(before.description) ?? '（未入力）') : null, text(after.description) ?? '（未入力）')
  const category = (refs: PreviewReferences, id: string | null) => (id ? (refs.categories.find((c) => c.id === id)?.name ?? '公開されていないカテゴリ') : '未選択')
  compare(rows, 'カテゴリ', before ? category(beforeRefs, before.categoryId) : null, category(afterRefs, after.categoryId))
  const occurrence = (id: string | null) => (id ? (names.occurrences.get(id) ?? '開催回') : '未選択')
  compare(rows, '開催回', before ? occurrence(before.occurrenceId) : null, occurrence(after.occurrenceId))

  const oldSlots = new Map((before?.slots ?? []).map((slot) => [slot.slotId, slot]))
  after.slots.forEach((slot, index) => {
    const old = oldSlots.get(slot.slotId)
    const label = `開催枠${index + 1}`
    compare(rows, label, old ? slotSummary(old, beforeRefs) : null, slotSummary(slot, afterRefs))
    const oldHours = old ? allDayHours(old, beforeRefs) : null
    const newHours = allDayHours(slot, afterRefs)
    if (newHours && newHours !== oldHours) {
      rows.push({ kind: '参照', label: `${label}の終日の実時間`, published: oldHours ?? none, candidate: `${newHours}（開催情報）` })
    }
    oldSlots.delete(slot.slotId)
  })
  for (const removed of oldSlots.values()) {
    rows.push({ kind: '削除', label: '開催枠', published: slotSummary(removed, beforeRefs), candidate: none })
  }
  return rows
}

// ---- 開催回 ----

function daySummary(day: OcDayDraft): string {
  const hours = day.publicStart && day.publicEnd ? `${day.publicStart}–${day.publicEnd}` : '一般公開時間未登録'
  const cancelled = day.status === 'cancelled' ? `・中止${day.cancelNote ? `（${day.cancelNote}）` : ''}` : ''
  return `${day.date ? formatDateLong(day.date) : '日付なし'} ${hours}${cancelled}`
}

function occurrenceRows(before: OccurrenceDraft | null, after: OccurrenceDraft | null): DiffRow[] {
  const rows: DiffRow[] = []
  if (!after) return rows
  compare(rows, '名称', before ? (text(before.name) ?? '（未入力）') : null, text(after.name) ?? '（未入力）')
  compare(rows, '出典', before ? (text(before.sourceNote) ?? none) : null, text(after.sourceNote) ?? none)
  const oldDays = new Map((before?.days ?? []).map((day) => [day.id, day]))
  for (const day of after.days) {
    const old = oldDays.get(day.id)
    compare(rows, '開催日', old ? daySummary(old) : null, daySummary(day))
    oldDays.delete(day.id)
  }
  for (const removed of oldDays.values()) compare(rows, '開催日', daySummary(removed), null)
  return rows
}

// ---- カテゴリ一覧 ----

function categorySummary(category: CategoryDraft, position: number): string {
  return `${position + 1}. ${category.name?.trim() || '（名称未入力）'}${category.selectable ? '' : '（新規選択停止）'}`
}

function categoryRows(before: CategoryDraft[] | null, after: CategoryDraft[] | null): DiffRow[] {
  const rows: DiffRow[] = []
  if (!after) return rows
  const oldPositions = new Map((before ?? []).map((category, position) => [category.id, { category, position }]))
  after.forEach((category, position) => {
    const old = oldPositions.get(category.id)
    compare(rows, 'カテゴリ', old ? categorySummary(old.category, old.position) : null, categorySummary(category, position))
    oldPositions.delete(category.id)
  })
  for (const removed of oldPositions.values()) compare(rows, 'カテゴリ', categorySummary(removed.category, removed.position), null)
  return rows
}

// ---- Spot ----

const utilizationLabels: Record<string, string> = { available: '選択できる', noNewSelection: '新規選択停止', withdrawn: '取り下げ済み' }

function spotRows(before: SpotDraft | null, after: SpotDraft | null): DiffRow[] {
  const rows: DiffRow[] = []
  if (!after) return rows
  compare(rows, '名称', before ? (text(before.name) ?? '（未入力）') : null, text(after.name) ?? '（未入力）')
  compare(rows, '別名', before ? before.aliases.join('、') || none : null, after.aliases.join('、') || none)
  compare(rows, '会場としての利用', before ? (utilizationLabels[before.utilization] ?? before.utilization) : null, utilizationLabels[after.utilization] ?? after.utilization)
  return rows
}
