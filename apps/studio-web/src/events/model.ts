import type { EventDraft, EventSlot, Participation, SlotVenue, TimeMode } from '../api/events'
import { EVENT_SCHEMA_VERSION } from '../api/events'
import type { CategoryItem, OcDayItem, ReferenceData, SpotItem } from '../api/reference'

export const timeModeLabels: Record<TimeMode, string> = { fixed: '時間を指定', allDay: '終日' }
export const participationLabels: Record<Participation, string> = { atStart: '開始時刻に参加', anytime: '時間内は随時参加' }

export function newId(): string {
  return crypto.randomUUID()
}

export function emptySlot(): EventSlot {
  return { slotId: newId(), ocDayId: null, timeMode: null, fixed: null, participation: null, status: 'normal', cancelNote: null, venues: [] }
}

/** 新規イベント：共通情報と最初の開催枠1件（07 EV-16）。 */
export function newDraft(): EventDraft {
  return { schemaVersion: EVENT_SCHEMA_VERSION, title: null, description: null, categoryId: null, occurrenceId: null, slots: [emptySlot()] }
}

/** 枠の複製：新しいIDを発行し、通常開催に戻して中止案内は空にする（07 EV-32）。 */
export function duplicateSlot(slot: EventSlot): EventSlot {
  return {
    ...slot,
    slotId: newId(),
    status: 'normal',
    cancelNote: null,
    fixed: slot.fixed ? { ...slot.fixed } : null,
    venues: slot.venues.map((venue) => ({ ...venue })),
  }
}

/** 下書き同士を比べるための正規化（未保存の判定に使う）。 */
export function draftKey(draft: EventDraft): string {
  return JSON.stringify(draft)
}

// ---- 参照データの引き当て ----

export type ReferenceIndex = {
  days: Map<string, OcDayItem & { occurrenceId: string }>
  categories: Map<string, CategoryItem>
  occurrences: ReferenceData['occurrences']
}

export function indexReference(reference: ReferenceData | undefined): ReferenceIndex {
  const days = new Map<string, OcDayItem & { occurrenceId: string }>()
  for (const occurrence of reference?.occurrences ?? []) {
    for (const day of occurrence.days) days.set(day.id, { ...day, occurrenceId: occurrence.id })
  }
  return {
    days,
    categories: new Map((reference?.categories ?? []).map((category) => [category.id, category])),
    occurrences: reference?.occurrences ?? [],
  }
}

// ---- 表示用の書式 ----

function parseDate(date: string): { month: number; day: number } {
  const [, month, day] = date.split('-').map(Number)
  return { month, day }
}

/** 9月20日 */
export function formatDateLong(date: string): string {
  const { month, day } = parseDate(date)
  return `${month}月${day}日`
}

/** 9/20 */
export function formatDateShort(date: string): string {
  const { month, day } = parseDate(date)
  return `${month}/${day}`
}

export function formatHours(day: Pick<OcDayItem, 'publicStart' | 'publicEnd'>): string | null {
  return day.publicStart && day.publicEnd ? `${day.publicStart}–${day.publicEnd}` : null
}

/** 開催日の選択肢：9月20日（10:00–16:00）。未登録の時間は推定しない。 */
export function formatDayOption(day: OcDayItem): string {
  const hours = formatHours(day)
  const cancelled = day.status === 'cancelled' ? '・開催日中止' : ''
  return `${formatDateLong(day.date)}（${hours ?? '開催時間未登録'}${cancelled}）`
}

/** 枠の見出し：9月20日 10:00–11:00／9月21日 終日 10:00–15:00 */
export function formatSlotHeading(slot: EventSlot, index: ReferenceIndex): string {
  const day = slot.ocDayId ? index.days.get(slot.ocDayId) : undefined
  const date = day ? formatDateLong(day.date) : slot.ocDayId ? '開催日不明' : '開催日未選択'
  if (slot.timeMode === 'allDay') {
    const hours = day ? formatHours(day) : null
    return `${date} 終日${hours ? ` ${hours}` : '（時間未解決）'}`
  }
  if (slot.timeMode === 'fixed') {
    return `${date} ${slot.fixed?.start ?? '--:--'}–${slot.fixed?.end ?? '--:--'}`
  }
  return `${date}（時間方式未選択）`
}

export function formatSpotLocation(spot: SpotItem | undefined): string {
  if (!spot) return ''
  return [spot.buildingName, spot.floorName].filter(Boolean).join('・')
}

// ---- 公開前の確認（07 §6 のうち、編集画面で判定できるもの） ----
// 下書き保存は妨げない。最終的な公開可否は公開候補の検証（Step 4）で判定する。

export type IssueLevel = 'blocking' | 'warning'

export type DraftIssue = {
  level: IssueLevel
  /** 対象の枠。共通情報の問題ではnull。 */
  slotId: string | null
  field: 'title' | 'occurrence' | 'category' | 'slots' | 'day' | 'timeMode' | 'time' | 'participation' | 'venues' | 'venue'
  canonicalSpotId?: string
  message: string
}

const SAVE_OK = '下書き保存はできます。'

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function findDraftIssues(
  draft: EventDraft,
  index: ReferenceIndex,
  spots: Map<string, SpotItem>,
  options: { referenceLoaded: boolean; spotsLoaded: boolean; savedCategoryId: string | null },
): DraftIssue[] {
  const issues: DraftIssue[] = []
  const push = (issue: DraftIssue) => issues.push(issue)

  if (!draft.title?.trim()) push({ level: 'blocking', slotId: null, field: 'title', message: `タイトルが未入力です。${SAVE_OK}` })
  if (!draft.occurrenceId) push({ level: 'blocking', slotId: null, field: 'occurrence', message: `対象の開催が未選択です。${SAVE_OK}` })
  if (!draft.categoryId) {
    push({ level: 'blocking', slotId: null, field: 'category', message: `カテゴリが未選択です。${SAVE_OK}` })
  } else if (options.referenceLoaded) {
    const category = index.categories.get(draft.categoryId)
    if (!category) {
      push({ level: 'blocking', slotId: null, field: 'category', message: `選択中のカテゴリが見つかりません。${SAVE_OK}` })
    } else if (!category.selectable && draft.categoryId !== options.savedCategoryId) {
      push({ level: 'blocking', slotId: null, field: 'category', message: '新規選択停止のカテゴリは新たに選べません。' })
    }
  }
  if (draft.slots.length === 0) push({ level: 'blocking', slotId: null, field: 'slots', message: `開催枠がありません。${SAVE_OK}` })

  for (const slot of draft.slots) {
    const day = slot.ocDayId ? index.days.get(slot.ocDayId) : undefined
    if (!slot.ocDayId) {
      push({ level: 'blocking', slotId: slot.slotId, field: 'day', message: `開催日が未選択です。${SAVE_OK}` })
    } else if (options.referenceLoaded && (!day || day.occurrenceId !== draft.occurrenceId)) {
      push({ level: 'blocking', slotId: slot.slotId, field: 'day', message: `開催日が対象の開催に属していません。開催日を選び直してください。${SAVE_OK}` })
    }

    if (!slot.timeMode) {
      push({ level: 'blocking', slotId: slot.slotId, field: 'timeMode', message: `時間方式が未選択です。${SAVE_OK}` })
    } else if (slot.timeMode === 'fixed') {
      const start = slot.fixed?.start
      const end = slot.fixed?.end
      if (!start || !end) {
        push({ level: 'blocking', slotId: slot.slotId, field: 'time', message: `開始・終了の時刻が未入力です。${SAVE_OK}` })
      } else if (toMinutes(end) <= toMinutes(start)) {
        push({ level: 'blocking', slotId: slot.slotId, field: 'time', message: `終了時刻は開始時刻より後にしてください。${SAVE_OK}` })
      } else if (day?.publicStart && day.publicEnd) {
        if (toMinutes(start) < toMinutes(day.publicStart)) {
          push({ level: 'warning', slotId: slot.slotId, field: 'time', message: `一般公開時間 ${day.publicStart}–${day.publicEnd} より前に開始します。時刻を確認してください。` })
        } else if (toMinutes(end) > toMinutes(day.publicEnd)) {
          push({ level: 'warning', slotId: slot.slotId, field: 'time', message: `一般公開時間 ${day.publicStart}–${day.publicEnd} より後に終了します。時刻を確認してください。` })
        }
      }
    } else if (day && !formatHours(day)) {
      push({ level: 'blocking', slotId: slot.slotId, field: 'time', message: `開催時間が未登録のため公開できません。${SAVE_OK}` })
    }

    if (!slot.participation) {
      push({ level: 'blocking', slotId: slot.slotId, field: 'participation', message: `参加案内が未選択です。${SAVE_OK}` })
    }

    if (slot.venues.length === 0) {
      push({ level: 'blocking', slotId: slot.slotId, field: 'venues', message: `公開には会場が必要です。${SAVE_OK}` })
    }

    if (options.spotsLoaded) {
      for (const venue of slot.venues) {
        const spot = spots.get(venue.canonicalSpotId)
        if (!spot) {
          push({ level: 'blocking', slotId: slot.slotId, field: 'venue', canonicalSpotId: venue.canonicalSpotId, message: 'このIDのSpotが見つかりません。別のSpotに置き換えず、会場を選び直してください。' })
        } else if (!spot.isPublished) {
          push({ level: 'blocking', slotId: slot.slotId, field: 'venue', canonicalSpotId: venue.canonicalSpotId, message: '会場のSpotが未公開です。このイベントは公開できません。Spotを自動で公開対象へ追加しません。' })
        }
      }
    }
  }

  return issues
}

// ---- iOS Preview（近似表示） ----

export type PreviewLine = { heading: string; detail: string }

export function previewLines(draft: EventDraft, index: ReferenceIndex, spots: Map<string, SpotItem>): PreviewLine[] {
  return sortSlotsForDisplay(draft.slots, index).map((slot) => {
    const day = slot.ocDayId ? index.days.get(slot.ocDayId) : undefined
    const date = day ? formatDateShort(day.date) : '日付未選択'
    const participation = slot.participation === 'atStart' ? '開始時刻に参加' : slot.participation === 'anytime' ? '随時参加可' : '参加案内未選択'
    const venueNames = slot.venues.map((venue) => spots.get(venue.canonicalSpotId)?.name ?? venue.canonicalSpotId)

    if (slot.timeMode === 'allDay') {
      const hours = day ? formatHours(day) : null
      return {
        heading: `${date} 終日${hours ? ` ${hours}` : '・時間未解決'}`,
        detail: `${participation}・${venueNames.length === 0 ? '会場未選択' : `${venueNames.length}会場`}`,
      }
    }

    const time = slot.timeMode === 'fixed' ? `${slot.fixed?.start ?? '--:--'}–${slot.fixed?.end ?? '--:--'}` : '時間未選択'
    let detail = '会場未選択'
    if (venueNames.length === 1) {
      const spot = spots.get(slot.venues[0].canonicalSpotId)
      detail = [venueNames[0], spot ? [spot.buildingName, spot.floorName].filter(Boolean).join('') : ''].filter(Boolean).join('・')
    } else if (venueNames.length > 1) {
      detail = venueNames.join('／')
    }
    return { heading: `${date} ${time}  ${participation}`, detail }
  })
}

/** 表示用の並び：日付・開始時刻順（07 EV-34）。保存される配列の順序は変えない。 */
export function sortSlotsForDisplay(slots: EventSlot[], index: ReferenceIndex): EventSlot[] {
  const key = (slot: EventSlot) => {
    const date = slot.ocDayId ? index.days.get(slot.ocDayId)?.date ?? '9999-12-31' : '9999-12-31'
    const time = slot.timeMode === 'allDay' ? '00:00' : slot.fixed?.start ?? '99:99'
    return `${date} ${time}`
  }
  return [...slots].sort((a, b) => key(a).localeCompare(key(b)))
}

export function moveVenue(venues: SlotVenue[], from: number, to: number): SlotVenue[] {
  if (to < 0 || to >= venues.length) return venues
  const next = [...venues]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
