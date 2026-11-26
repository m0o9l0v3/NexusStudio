import type { EventDraft, EventSlot, Participation, SlotVenue, TimeMode } from '../api/events'
import { EVENT_SCHEMA_VERSION } from '../api/events'
import type { CategoryItem, OcDayItem, ReferenceData, SpotItem } from '../api/reference'

export const timeModeLabels: Record<TimeMode, string> = { fixed: '時間を決める', allDay: '終日' }
export const participationLabels: Record<Participation, string> = {
  atStart: '始まる時間に集合',
  anytime: '時間内ならいつでも参加できる',
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

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

function parseDate(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

/** 9月20日（他画面互換のため形式を変更しない）。 */
export function formatDateLong(date: string): string {
  const { month, day } = parseDate(date)
  return `${month}月${day}日`
}

/** 9月20日（土） */
export function formatDateWithWeekday(date: string): string {
  const { year, month, day } = parseDate(date)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return formatDateLong(date)
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${month}月${day}日（${weekday}）`
}

/** 9/20 */
export function formatDateShort(date: string): string {
  const { month, day } = parseDate(date)
  return `${month}/${day}`
}

export function formatHours(day: Pick<OcDayItem, 'publicStart' | 'publicEnd'>): string | null {
  return day.publicStart && day.publicEnd ? `${day.publicStart}–${day.publicEnd}` : null
}

/** 開催日の選択肢：9月20日（土）。未登録の時間・開催日中止は必要に応じて併記する。 */
export function formatDayOption(day: OcDayItem): string {
  const notes = [
    !formatHours(day) ? '開催時間未登録' : null,
    day.status === 'cancelled' ? '開催日中止' : null,
  ].filter(Boolean)
  return `${formatDateWithWeekday(day.date)}${notes.length > 0 ? `（${notes.join('・')}）` : ''}`
}

/** 日時の見出し：9月20日（土） 10:00–11:00／9月21日（日） 終日 10:00–16:00／日付未選択 */
export function formatSlotHeading(slot: EventSlot, index: ReferenceIndex): string {
  const day = slot.ocDayId ? index.days.get(slot.ocDayId) : undefined
  const date = day ? formatDateWithWeekday(day.date) : slot.ocDayId ? '日付不明' : '日付未選択'
  if (slot.timeMode === 'allDay') {
    const hours = day ? formatHours(day) : null
    return `${date} 終日${hours ? ` ${hours}` : '（開催時間未登録）'}`
  }
  if (slot.timeMode === 'fixed') {
    return `${date} ${slot.fixed?.start ?? '--:--'}–${slot.fixed?.end ?? '--:--'}`
  }
  if (!slot.ocDayId) return '日付未選択'
  return `${date} 時間未選択`
}

/** 上部エラーサマリー用の日時ラベル：9月20日（土） 10:00の回／9月21日（日） 終日の回／日時1 */
export function formatSlotReference(slot: EventSlot, slotIndex: number, index: ReferenceIndex): string {
  const day = slot.ocDayId ? index.days.get(slot.ocDayId) : undefined
  if (!day) return `日時${slotIndex + 1}`
  const date = formatDateWithWeekday(day.date)
  if (slot.timeMode === 'fixed' && slot.fixed?.start) return `${date} ${slot.fixed.start}の回`
  if (slot.timeMode === 'allDay') return `${date} 終日の回`
  return `${date}の回`
}

export function formatSpotLocation(spot: SpotItem | undefined): string {
  if (!spot) return ''
  return [spot.buildingName, spot.floorName].filter(Boolean).join('・')
}

// ---- 公開前の確認（07 §6 のうち、編集画面で判定できるもの） ----
// 下書き保存は妨げない。最終的な公開可否は公開候補の検証（Step 4）で判定する。

export type IssueLevel = 'blocking' | 'warning'
export type IssueKind = 'missing' | 'invalid'

export type DraftIssue = {
  level: IssueLevel
  /** 新規作成の初期未保存状態で抑止する「未入力」か、入力・選択済みの値に対する問題か。 */
  kind: IssueKind
  /** 対象の日時。基本情報の問題ではnull。 */
  slotId: string | null
  field: 'title' | 'occurrence' | 'category' | 'slots' | 'day' | 'timeMode' | 'time' | 'participation' | 'venues' | 'venue' | 'cancel'
  canonicalSpotId?: string
  /** 上部サマリー向けの平易なメッセージ。 */
  summary: string
  /** 各入力欄の直下に出すメッセージ。 */
  message: string
}

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

  if (!draft.title?.trim()) {
    push({
      level: 'blocking',
      kind: 'missing',
      slotId: null,
      field: 'title',
      summary: 'タイトルが入力されていません',
      message: '公開するにはタイトルが必要です',
    })
  }
  if (!draft.occurrenceId) {
    push({
      level: 'blocking',
      kind: 'missing',
      slotId: null,
      field: 'occurrence',
      summary: 'オープンキャンパスが選ばれていません',
      message: '公開するにはオープンキャンパスが必要です',
    })
  }
  if (!draft.categoryId) {
    push({
      level: 'blocking',
      kind: 'missing',
      slotId: null,
      field: 'category',
      summary: 'カテゴリが選ばれていません',
      message: '公開するにはカテゴリが必要です',
    })
  } else if (options.referenceLoaded) {
    const category = index.categories.get(draft.categoryId)
    if (!category) {
      push({
        level: 'blocking',
        kind: 'invalid',
        slotId: null,
        field: 'category',
        summary: '選ばれているカテゴリが見つかりません',
        message: '選ばれているカテゴリが見つかりません。別のカテゴリを選んでください。',
      })
    } else if (!category.selectable && draft.categoryId !== options.savedCategoryId) {
      push({
        level: 'blocking',
        kind: 'invalid',
        slotId: null,
        field: 'category',
        summary: '新規選択停止のカテゴリが選ばれています',
        message: '新規選択停止のカテゴリは新たに選べません。',
      })
    }
  }
  if (draft.slots.length === 0) {
    push({
      level: 'blocking',
      kind: 'missing',
      slotId: null,
      field: 'slots',
      summary: '日時がありません',
      message: '公開するには日時が1回以上必要です',
    })
  }

  draft.slots.forEach((slot, slotIndex) => {
    const day = slot.ocDayId ? index.days.get(slot.ocDayId) : undefined
    const prefix = formatSlotReference(slot, slotIndex, index)

    if (!slot.ocDayId) {
      push({
        level: 'blocking',
        kind: 'missing',
        slotId: slot.slotId,
        field: 'day',
        summary: `${prefix}：日付が選ばれていません`,
        message: '公開するには日付が必要です',
      })
    } else if (options.referenceLoaded && (!day || day.occurrenceId !== draft.occurrenceId)) {
      push({
        level: 'blocking',
        kind: 'invalid',
        slotId: slot.slotId,
        field: 'day',
        summary: `${prefix}：選択中のオープンキャンパスにない日付です`,
        message: 'この日付は選択中のオープンキャンパスに含まれていません。日付を選び直してください。',
      })
    }

    if (!slot.timeMode) {
      push({
        level: 'blocking',
        kind: 'missing',
        slotId: slot.slotId,
        field: 'timeMode',
        summary: `${prefix}：時間の決め方が選ばれていません`,
        message: '「時間を決める」か「終日」を選んでください',
      })
    } else if (slot.timeMode === 'fixed') {
      const start = slot.fixed?.start
      const end = slot.fixed?.end
      if (!start || !end) {
        push({
          level: 'blocking',
          kind: 'missing',
          slotId: slot.slotId,
          field: 'time',
          summary: `${prefix}：開始・終了の時刻が入力されていません`,
          message: '公開するには開始時刻と終了時刻が必要です',
        })
      } else if (toMinutes(end) <= toMinutes(start)) {
        push({
          level: 'blocking',
          kind: 'invalid',
          slotId: slot.slotId,
          field: 'time',
          summary: `${prefix}：終了時刻が開始時刻より前か同じです`,
          message: '終了時刻は開始時刻より後にしてください',
        })
      } else if (day?.publicStart && day.publicEnd) {
        if (toMinutes(start) < toMinutes(day.publicStart)) {
          push({
            level: 'warning',
            kind: 'invalid',
            slotId: slot.slotId,
            field: 'time',
            summary: `${prefix}：一般公開時間（${day.publicStart}–${day.publicEnd}）より前に始まります`,
            message: `一般公開時間（${day.publicStart}–${day.publicEnd}）より前に始まります。時刻を確認してください。`,
          })
        } else if (toMinutes(end) > toMinutes(day.publicEnd)) {
          push({
            level: 'warning',
            kind: 'invalid',
            slotId: slot.slotId,
            field: 'time',
            summary: `${prefix}：一般公開時間（${day.publicStart}–${day.publicEnd}）より後に終わります`,
            message: `一般公開時間（${day.publicStart}–${day.publicEnd}）より後に終わります。時刻を確認してください。`,
          })
        }
      }
    } else if (day && !formatHours(day)) {
      push({
        level: 'blocking',
        kind: 'invalid',
        slotId: slot.slotId,
        field: 'time',
        summary: `${prefix}：開催日の開催時間が登録されていません`,
        message: 'この日の開催時間が未登録のため公開できません。「オープンキャンパス」の画面で時間を登録するか、時間を決めて入力してください。',
      })
    }

    if (!slot.participation) {
      push({
        level: 'blocking',
        kind: 'missing',
        slotId: slot.slotId,
        field: 'participation',
        summary: `${prefix}：参加についてが選ばれていません`,
        message: '公開するには「参加について」を選んでください',
      })
    }

    if (slot.status === 'cancelled' && !slot.cancelNote?.trim()) {
      push({
        level: 'warning',
        kind: 'invalid',
        slotId: slot.slotId,
        field: 'cancel',
        summary: `${prefix}：中止の案内が入力されていません`,
        message: '中止の案内がありません。来場者向けの案内を確認してください。',
      })
    }

    if (slot.venues.length === 0) {
      push({
        level: 'blocking',
        kind: 'missing',
        slotId: slot.slotId,
        field: 'venues',
        summary: `${prefix}：会場がありません`,
        message: '公開するには会場が1か所以上必要です',
      })
    }

    if (options.spotsLoaded) {
      for (const venue of slot.venues) {
        const spot = spots.get(venue.canonicalSpotId)
        if (!spot) {
          push({
            level: 'blocking',
            kind: 'invalid',
            slotId: slot.slotId,
            field: 'venue',
            canonicalSpotId: venue.canonicalSpotId,
            summary: `${prefix}：「${venue.canonicalSpotId}」が見つかりません`,
            message: `「${venue.canonicalSpotId}」は見つかりません。別の地点に自動で置き換えず、会場を選び直してください。`,
          })
        } else if (!spot.isPublished) {
          push({
            level: 'blocking',
            kind: 'invalid',
            slotId: slot.slotId,
            field: 'venue',
            canonicalSpotId: venue.canonicalSpotId,
            summary: `${prefix}：「${spot.name}」はまだ公開されていない地点です`,
            message: `「${spot.name}」はまだ公開されていない地点です。「地点」の画面で公開するか、別の会場を選んでください。`,
          })
        }
      }
    }
  })

  return issues
}

// ---- iOS Preview（近似表示） ----

export type PreviewLine = { heading: string; detail: string }

/** 枠独自の中止か、所属する開催日の中止（親由来）か。どちらでもなければnull（07 §5）。 */
export function cancellationOf(slot: EventSlot, index: ReferenceIndex): 'slot' | 'day' | null {
  if (slot.status === 'cancelled') return 'slot'
  const day = slot.ocDayId ? index.days.get(slot.ocDayId) : undefined
  return day?.status === 'cancelled' ? 'day' : null
}

export function previewLines(draft: EventDraft, index: ReferenceIndex, spots: Map<string, SpotItem>): PreviewLine[] {
  return sortSlotsForDisplay(draft.slots, index).map((slot) => {
    const day = slot.ocDayId ? index.days.get(slot.ocDayId) : undefined
    const date = day ? formatDateShort(day.date) : '日付未選択'
    const participation = slot.participation === 'atStart' ? '始まる時間に集合' : slot.participation === 'anytime' ? '随時参加可' : '参加について未選択'
    const venueNames = slot.venues.map((venue) => spots.get(venue.canonicalSpotId)?.name ?? venue.canonicalSpotId)
    const cancelled = cancellationOf(slot, index)
    if (cancelled) {
      const note = cancelled === 'slot' ? slot.cancelNote?.trim() : day?.status === 'cancelled' ? '開催日の中止' : ''
      const time = slot.timeMode === 'allDay' ? '終日' : slot.timeMode === 'fixed' ? `${slot.fixed?.start ?? '--:--'}–${slot.fixed?.end ?? '--:--'}` : '時間未選択'
      return { heading: `${date} ${time}`, detail: `中止・${venueNames.length}会場${note ? `（${note}）` : ''}` }
    }

    if (slot.timeMode === 'allDay') {
      const hours = day ? formatHours(day) : null
      return {
        heading: `${date} 終日${hours ? ` ${hours}` : '・開催時間未登録'}`,
        detail: `${participation}・${venueNames.length === 0 ? '会場なし' : `${venueNames.length}会場`}`,
      }
    }

    const time = slot.timeMode === 'fixed' ? `${slot.fixed?.start ?? '--:--'}–${slot.fixed?.end ?? '--:--'}` : '時間未選択'
    let detail = '会場なし'
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
