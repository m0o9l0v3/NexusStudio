import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, CalendarOff, ChevronDown, ChevronRight, Copy, Ellipsis, Plus, Search, Trash2, X } from 'lucide-react'
import { useDeferredValue, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { EventSlot, Participation, SlotVenue, TimeMode } from '../../../api/events'
import { searchSpots, type OccurrenceItem, type SpotItem } from '../../../api/reference'
import {
  cancellationOf,
  formatDateWithWeekday,
  formatDayOption,
  formatHours,
  formatSlotHeading,
  moveVenue,
  participationLabels,
  timeModeLabels,
  type DraftIssue,
  type ReferenceIndex,
} from '../../../events/model'
import { Button } from '../../../ui/Button'
import { cn } from '../../../ui/cn'
import { Dialog, DialogActions } from '../../../ui/Dialog'
import { TextAreaField } from '../../../ui/Field'
import { NoticeBanner } from '../../../ui/NoticeBanner'
import { SegmentedControl, type SegmentedControlOption } from '../../../ui/SegmentedControl'
import { StatusLabel } from '../../../ui/StatusLabel'

const timeModeOptions: ReadonlyArray<SegmentedControlOption<TimeMode>> = [
  { value: 'fixed', label: timeModeLabels.fixed },
  { value: 'allDay', label: timeModeLabels.allDay },
]

const participationOptions: ReadonlyArray<SegmentedControlOption<Participation>> = [
  { value: 'atStart', label: participationLabels.atStart },
  { value: 'anytime', label: participationLabels.anytime },
]

type SlotCardProps = {
  editorId: string
  slot: EventSlot
  index: ReferenceIndex
  occurrence: OccurrenceItem | undefined
  spots: Map<string, SpotItem>
  issues: DraftIssue[]
  expanded: boolean
  onToggle: () => void
  onChange: (slot: EventSlot) => void
  onDuplicate: () => void
  onDelete: () => void
  /** 開いたときに見出しへフォーカスを移す（追加・複製の直後。07 §4.4）。 */
  focusOnOpen?: boolean
}

function InlineIssue({ level, message }: { level: 'blocking' | 'warning'; message: string }) {
  return <p className={cn('text-[11px] leading-4', level === 'blocking' ? 'text-danger' : 'text-warning')}>{message}</p>
}

/**
 * 日時1件（Figma v2 E02 `65:610`・E03 `77:1042`・E04 `78:1645`・E05 `79:1452`、決定事項36 V2-13）。
 * 展開中のみ 1px 枠線・右端 `⋯` メニュー。閉じた枠は外枠なしの 1 行ヘアライン。
 */
export function SlotCard({
  editorId,
  slot,
  index,
  occurrence,
  spots,
  issues,
  expanded,
  onToggle,
  onChange,
  onDuplicate,
  onDelete,
  focusOnOpen,
}: SlotCardProps) {
  const headerButtonRef = useRef<HTMLButtonElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const restoreAddFocus = useRef(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    // 追加・複製で開いたときだけ見出しボタンへフォーカスを移す（07 §4.4、検証記録 A-3 D4）。
    if (expanded && focusOnOpen) headerButtonRef.current?.focus()
  }, [expanded, focusOnOpen])

  useEffect(() => {
    // インライン会場追加を閉じて［会場を追加］ボタンが再マウントされた後にフォーカスを戻す（07 AC19）。
    if (!pickerOpen && restoreAddFocus.current) {
      restoreAddFocus.current = false
      addButtonRef.current?.focus()
    }
  }, [pickerOpen])

  const heading = formatSlotHeading(slot, index)
  const unsetHeading = !slot.ocDayId && !slot.timeMode
  const blocking = issues.filter((issue) => issue.level === 'blocking')
  const warnings = issues.filter((issue) => issue.level === 'warning')
  const day = slot.ocDayId ? index.days.get(slot.ocDayId) : undefined
  const days = occurrence?.days ?? []
  const cancelledByDay = cancellationOf(slot, index) === 'day'

  const issueFor = (field: DraftIssue['field']) => issues.find((issue) => issue.field === field)
  const dayIssue = issueFor('day')
  const timeModeIssue = issueFor('timeMode')
  const timeIssue = issueFor('time')
  const participationIssue = issueFor('participation')
  const venuesIssue = issueFor('venues')
  const venueIssues = issues.filter((issue) => issue.field === 'venue')
  const cancelIssue = issueFor('cancel')

  const update = (patch: Partial<EventSlot>) => onChange({ ...slot, ...patch })
  const updateVenues = (venues: SlotVenue[]) => update({ venues })

  const hoursNote = day
    ? formatHours(day)
      ? `終日 ${formatHours(day)}`
      : '開催時間未登録'
    : '日付を選ぶと開催時間が出ます'

  const slotPrefix = `${editorId}-slot-${slot.slotId}`
  const timeInputClass = (invalid: boolean) =>
    cn(
      'h-[30px] rounded-md border bg-canvas px-2.5 text-[13px] leading-[19px] text-text-primary tabular-nums',
      'focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
      'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-55',
      invalid ? 'border-danger' : 'border-border-input',
    )

  const statusLabels = (
    <>
      {slot.status === 'cancelled' && <StatusLabel tone="danger">中止</StatusLabel>}
      {cancelledByDay && <StatusLabel tone="danger">開催日中止</StatusLabel>}
      {blocking.length > 0 ? (
        <StatusLabel tone="danger" className="tabular-nums">
          直すこと {blocking.length}件
        </StatusLabel>
      ) : warnings.length > 0 ? (
        <StatusLabel tone="warning" className="tabular-nums">
          要確認 {warnings.length}件
        </StatusLabel>
      ) : null}
    </>
  )

  const venueSummary = slot.venues.length === 0 ? '会場なし' : `会場 ${slot.venues.length}か所`

  if (!expanded) {
    return (
      <section aria-label={`日時 ${heading}`} className="border-b border-border-subtle">
        <button
          ref={headerButtonRef}
          type="button"
          aria-expanded={false}
          onClick={onToggle}
          className="flex min-h-11 w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-1 py-2.5 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        >
          <ChevronRight aria-hidden size={15} strokeWidth={1.75} className="shrink-0 text-text-secondary" />
          <span className={cn('text-[13px] leading-[18px] font-normal tabular-nums', unsetHeading ? 'text-text-secondary' : 'text-text-primary')}>
            {heading}
          </span>
          <span className="text-[12px] leading-[17px] text-text-muted tabular-nums">{venueSummary}</span>
          {statusLabels}
        </button>
      </section>
    )
  }

  return (
    <section aria-label={`日時 ${heading}`} className="rounded-lg border border-border bg-canvas p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          ref={headerButtonRef}
          type="button"
          aria-expanded
          onClick={() => {
            setPickerOpen(false)
            onToggle()
          }}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <ChevronDown aria-hidden size={15} strokeWidth={1.75} className="shrink-0 text-text-secondary" />
          <span className={cn('text-[13px] leading-[18px] tabular-nums', unsetHeading ? 'font-normal text-text-secondary' : 'font-bold text-text-primary')}>
            {heading}
          </span>
          <span className="text-[12px] leading-[17px] text-text-muted tabular-nums">{venueSummary}</span>
          {statusLabels}
        </button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="日時の操作"
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors',
                'hover:bg-surface-hover hover:text-text-primary data-[state=open]:bg-surface-hover',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              )}
            >
              <Ellipsis aria-hidden size={16} strokeWidth={1.75} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="z-30 min-w-[184px] rounded-lg border border-border bg-canvas p-1 shadow-menu"
            >
              <DropdownMenu.Item
                onSelect={onDuplicate}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[13px] leading-[19px] text-text-primary outline-none data-[highlighted]:bg-surface-hover"
              >
                <Copy aria-hidden size={15} strokeWidth={1.5} className="shrink-0 text-text-secondary" />
                この日時を複製
              </DropdownMenu.Item>
              <DropdownMenu.Item
                // 中止解除しても入力した中止の案内は下書きに残す（誤操作で消さない）。
                onSelect={() => update({ status: slot.status === 'cancelled' ? 'normal' : 'cancelled' })}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[13px] leading-[19px] text-text-primary outline-none data-[highlighted]:bg-surface-hover"
              >
                <CalendarOff aria-hidden size={15} strokeWidth={1.5} className="shrink-0 text-text-secondary" />
                {slot.status === 'cancelled' ? 'この日時の中止を解除する' : 'この日時を中止にする'}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => setConfirmDelete(true)}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[13px] leading-[19px] text-danger outline-none data-[highlighted]:bg-danger-subtle"
              >
                <Trash2 aria-hidden size={15} strokeWidth={1.5} className="shrink-0" />
                削除
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {/* 1行目：日付・時間方式・時刻 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                id={`${slotPrefix}-day`}
                aria-label="日付"
                value={slot.ocDayId ?? ''}
                onChange={(event) => update({ ocDayId: event.target.value || null })}
                disabled={!occurrence}
                aria-invalid={Boolean(dayIssue) || undefined}
                className={cn(
                  'h-[30px] appearance-none rounded-md border bg-canvas pr-7 pl-2.5 text-[13px] leading-[19px] text-text-primary',
                  'focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
                  'disabled:cursor-not-allowed disabled:opacity-55',
                  dayIssue ? 'border-danger' : 'border-border-input',
                )}
              >
                <option value="">日付を選ぶ</option>
                {slot.ocDayId && !days.some((candidate) => candidate.id === slot.ocDayId) && (
                  <option value={slot.ocDayId}>（選択中のオープンキャンパスにない日付）</option>
                )}
                {days.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {formatDayOption(candidate)}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden
                size={14}
                strokeWidth={1.75}
                className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-text-secondary"
              />
            </div>

            <div
              id={`${slotPrefix}-timeMode`}
              tabIndex={-1}
              className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <SegmentedControl
                name={`time-mode-${slot.slotId}`}
                aria-label="時間の決め方"
                value={(slot.timeMode as TimeMode | null) ?? null}
                options={timeModeOptions}
                invalid={Boolean(timeModeIssue)}
                // 終日へ切り替えても参加について・未選択は自動で変えない（07 EV-42）。
                onChange={(mode) =>
                  update(
                    mode === 'fixed'
                      ? { timeMode: 'fixed', fixed: slot.fixed ?? { start: null, end: null } }
                      : { timeMode: 'allDay', fixed: null },
                  )
                }
              />
            </div>

            {slot.timeMode === 'fixed' && (
              <div className="flex items-center gap-1.5">
                <input
                  id={`${slotPrefix}-time`}
                  type="time"
                  aria-label="開始時刻"
                  value={slot.fixed?.start ?? ''}
                  aria-invalid={timeIssue?.level === 'blocking' || undefined}
                  onChange={(event) => update({ fixed: { start: event.target.value || null, end: slot.fixed?.end ?? null } })}
                  className={timeInputClass(timeIssue?.level === 'blocking')}
                />
                <span aria-hidden className="text-[12px] text-text-muted">
                  –
                </span>
                <input
                  id={`${slotPrefix}-time-end`}
                  type="time"
                  aria-label="終了時刻"
                  value={slot.fixed?.end ?? ''}
                  aria-invalid={timeIssue?.level === 'blocking' || undefined}
                  onChange={(event) => update({ fixed: { start: slot.fixed?.start ?? null, end: event.target.value || null } })}
                  className={timeInputClass(timeIssue?.level === 'blocking')}
                />
              </div>
            )}

            <span
              id={slot.timeMode === 'allDay' ? `${slotPrefix}-time` : undefined}
              tabIndex={slot.timeMode === 'allDay' ? -1 : undefined}
              className="text-[12px] leading-[17px] text-text-muted tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {hoursNote}
            </span>
          </div>

          {!occurrence && (
            <p className="text-[11px] leading-4 text-text-secondary">オープンキャンパスを選ぶと、日付を選べます。</p>
          )}
          {dayIssue && <InlineIssue level={dayIssue.level} message={dayIssue.message} />}
          {timeModeIssue && <InlineIssue level={timeModeIssue.level} message={timeModeIssue.message} />}
          {timeIssue && <InlineIssue level={timeIssue.level} message={timeIssue.message} />}
        </div>

        {/* 2行目：参加について */}
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              id={`${slotPrefix}-participation-label`}
              className={cn('text-[12px] leading-[17px]', participationIssue ? 'text-danger' : 'text-text-secondary')}
            >
              参加について
            </span>
            <div
              id={`${slotPrefix}-participation`}
              tabIndex={-1}
              className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <SegmentedControl
                name={`participation-${slot.slotId}`}
                aria-labelledby={`${slotPrefix}-participation-label`}
                value={(slot.participation as Participation | null) ?? null}
                options={participationOptions}
                invalid={Boolean(participationIssue)}
                onChange={(next) => update({ participation: next })}
              />
            </div>
          </div>
          {participationIssue && <InlineIssue level={participationIssue.level} message={participationIssue.message} />}
        </div>

        {/* 中止案内（枠独自中止・開催日中止。07 EV-09・EV-37） */}
        {slot.status === 'cancelled' && (
          <div className="flex flex-col gap-2 rounded-md border border-danger-border bg-danger-subtle/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <StatusLabel tone="danger">この日時は中止に設定されています</StatusLabel>
              <button
                type="button"
                onClick={() => update({ status: 'normal' })}
                className="rounded-sm text-[12px] leading-[17px] text-text-secondary hover:text-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                中止を解除
              </button>
            </div>
            <TextAreaField
              id={`${slotPrefix}-cancel`}
              label="中止の案内"
              rows={2}
              value={slot.cancelNote ?? ''}
              placeholder="例：雨天のため中止します"
              onChange={(event) => update({ cancelNote: event.target.value || null })}
              message={cancelIssue?.message}
              messageTone="warning"
            />
          </div>
        )}
        {day?.status === 'cancelled' && (
          <NoticeBanner tone="warning">
            {formatDateWithWeekday(day.date)}は開催日として中止されています（オープンキャンパス）。この日に属する日時へ中止が反映されます。日時独自の中止理由は別に保持し、開催日の中止を解除しても日時独自の中止は解除しません。
          </NoticeBanner>
        )}

        {/* 会場 */}
        <div className="flex flex-col gap-1.5">
          {(slot.venues.length > 0 || pickerOpen || Boolean(venuesIssue)) && (
            <h3 className="text-[12px] leading-[17px] font-normal text-text-muted">会場</h3>
          )}

          {slot.venues.length > 0 && (
            <ol className="divide-y divide-border-subtle border-y border-border-subtle" aria-label="会場（表示順）">
              {slot.venues.map((venue, position) => (
                <VenueItem
                  key={venue.canonicalSpotId}
                  rowId={`${slotPrefix}-venue-${encodeURIComponent(venue.canonicalSpotId)}`}
                  venue={venue}
                  spot={spots.get(venue.canonicalSpotId)}
                  position={position}
                  count={slot.venues.length}
                  issue={venueIssues.find((issue) => issue.canonicalSpotId === venue.canonicalSpotId)}
                  onNote={(note) => updateVenues(slot.venues.map((item, i) => (i === position ? { ...item, note } : item)))}
                  onMove={(to) => updateVenues(moveVenue(slot.venues, position, to))}
                  onRemove={() => {
                    updateVenues(slot.venues.filter((_, i) => i !== position))
                    addButtonRef.current?.focus()
                  }}
                />
              ))}
            </ol>
          )}

          {venuesIssue && <InlineIssue level={venuesIssue.level} message={venuesIssue.message} />}

          {pickerOpen ? (
            <div className="pt-1">
              <InlineVenuePicker
                inputId={`${slotPrefix}-add-venue`}
                addedIds={slot.venues.map((venue) => venue.canonicalSpotId)}
                onSelect={(spot) => {
                  restoreAddFocus.current = true
                  updateVenues([...slot.venues, { canonicalSpotId: spot.canonicalId, note: null }])
                  setPickerOpen(false)
                }}
                onClose={() => {
                  restoreAddFocus.current = true
                  setPickerOpen(false)
                }}
              />
            </div>
          ) : (
            <Button
              ref={addButtonRef}
              id={`${slotPrefix}-add-venue`}
              variant="ghost"
              size="sm"
              className="-ml-2 self-start text-text-primary!"
              onClick={() => setPickerOpen(true)}
            >
              <Plus aria-hidden size={14} strokeWidth={1.75} />
              会場を追加
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="この日時を削除しますか"
        description="削除した日時は、「下書き保存」するまで保存済みの内容には反映されません。保存前であれば「保存していない変更を取り消す」で元に戻せます。"
      >
        <DialogActions>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            戻る
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmDelete(false)
              onDelete()
            }}
          >
            削除する
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  )
}

type VenueItemProps = {
  rowId: string
  venue: SlotVenue
  spot: SpotItem | undefined
  position: number
  count: number
  issue: DraftIssue | undefined
  onNote: (note: string | null) => void
  onMove: (to: number) => void
  onRemove: () => void
}

/** Figma v2 会場の行（`65:581`・E02・E05）。canonical ID は Geist Mono で厳密表示する。 */
function VenueItem({ rowId, venue, spot, position, count, issue, onNote, onMove, onRemove }: VenueItemProps) {
  const name = spot?.name ?? venue.canonicalSpotId
  const location = [spot?.buildingName, spot?.floorName].filter(Boolean).join(' ')
  const upButton = useRef<HTMLButtonElement>(null)
  const downButton = useRef<HTMLButtonElement>(null)

  // 端まで移動して押したボタンが無効になったら、反対側のボタンへフォーカスを移す（キーボード操作を途切れさせない。07 AC19）。
  useEffect(() => {
    if (position === 0 && document.activeElement === upButton.current) downButton.current?.focus()
    if (position === count - 1 && document.activeElement === downButton.current) upButton.current?.focus()
  }, [position, count])

  return (
    <li
      id={rowId}
      tabIndex={-1}
      className="py-2.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="truncate text-[13px] leading-[18px] font-bold text-text-primary">{spot?.name ?? '不明な地点'}</p>
            {!spot ? (
              <span className="text-[11px] leading-4 font-bold text-danger">見つかりません</span>
            ) : !spot.isPublished ? (
              <span className="text-[11px] leading-4 font-bold text-danger">未公開</span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] leading-4 text-text-muted" title={venue.canonicalSpotId}>
            {location ? (
              <>
                {location} · <span className="font-mono text-[11px]">{venue.canonicalSpotId}</span>
              </>
            ) : (
              <span className="font-mono text-[11px]">{venue.canonicalSpotId}</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <input
            type="text"
            value={venue.note ?? ''}
            aria-label={`${name}の会場メモ`}
            placeholder="受付・体験会場など"
            onChange={(event) => onNote(event.target.value || null)}
            className="h-[30px] w-[156px] rounded-md border border-border-input bg-canvas px-2.5 text-[13px] leading-[19px] text-text-primary placeholder:text-text-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          />
          <Button
            ref={upButton}
            variant="ghost"
            size="sm"
            className="size-[30px] px-0"
            disabled={position === 0}
            onClick={() => onMove(position - 1)}
            aria-label={`${name}を上へ`}
          >
            <ArrowUp aria-hidden size={14} strokeWidth={1.75} />
          </Button>
          <Button
            ref={downButton}
            variant="ghost"
            size="sm"
            className="size-[30px] px-0"
            disabled={position === count - 1}
            onClick={() => onMove(position + 1)}
            aria-label={`${name}を下へ`}
          >
            <ArrowDown aria-hidden size={14} strokeWidth={1.75} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-[30px] px-0"
            onClick={onRemove}
            aria-label={`${name}をこの日時から外す`}
          >
            <X aria-hidden size={14} strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      {issue && <p className="mt-1.5 text-[11px] leading-4 text-danger">{issue.message}</p>}
    </li>
  )
}

type Availability = 'available' | 'added' | 'stopped'

function availabilityOf(spot: SpotItem, added: Set<string>): Availability {
  if (added.has(spot.canonicalId)) return 'added'
  if (spot.utilization !== 'available') return 'stopped'
  return 'available'
}

type InlineVenuePickerProps = {
  inputId: string
  /** この日時に追加済みのcanonical ID。再選択させない（07 AC06）。 */
  addedIds: string[]
  onSelect: (spot: SpotItem) => void
  onClose: () => void
}

/**
 * インライン会場追加（Figma v2 E03 `77:1042`、決定事項36 V2-6・V2-13）。
 * ↑↓で候補を移動、Enterで追加、Escまたは［やめる］で閉じて［会場を追加］へフォーカスを戻す（07 AC19）。
 */
function InlineVenuePicker({ inputId, addedIds, onSelect, onClose }: InlineVenuePickerProps) {
  const [q, setQ] = useState('')
  const deferredQ = useDeferredValue(q)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const added = new Set(addedIds)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const result = useQuery({
    queryKey: ['spots', { q: deferredQ, building: '', floor: '' }],
    queryFn: () => searchSpots(deferredQ, '', ''),
    placeholderData: keepPreviousData,
  })
  // 前の条件の結果を表示したまま今の条件の取得に失敗したら、前の結果を今の結果として見せない（検証記録 A-5 B3）。
  const failed = result.isError && (!result.data || result.isPlaceholderData)
  const items = failed ? [] : (result.data?.items ?? [])

  // 最初は選べる候補を強調する。選べる候補が無ければ先頭（検証記録 A-3 D5）。
  const firstAvailable = Math.max(
    items.findIndex((spot) => availabilityOf(spot, added) === 'available'),
    0,
  )
  const [activeState, setActiveState] = useState<{ key: string; index: number } | null>(null)
  const active = activeState?.key === deferredQ ? Math.min(activeState.index, Math.max(items.length - 1, 0)) : firstAvailable
  const setActive = (next: number | ((current: number) => number)) =>
    setActiveState({ key: deferredQ, index: typeof next === 'function' ? next(active) : next })

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function choose(spot: SpotItem | undefined) {
    if (!spot || availabilityOf(spot, added) !== 'available') return
    onSelect(spot)
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (items.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => Math.min(current + 1, items.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(items[active])
    }
  }

  const activeSpot = items[active]
  const stoppedActive = activeSpot && availabilityOf(activeSpot, added) === 'stopped'
  const hasUnpublishedCandidate = items.some((spot) => availabilityOf(spot, added) === 'available' && !spot.isPublished)

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-canvas shadow-menu">
      <div className="flex items-center gap-2 border-b border-border-subtle px-2.5 py-2">
        <div className="relative flex-1">
          <Search aria-hidden size={14} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-muted" />
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="名前・建物・地点IDで検索"
            aria-label="会場を検索"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeSpot ? `${listId}-${active}` : undefined}
            autoComplete="off"
            className="h-[34px] w-full rounded-md border border-border-input bg-canvas pr-2.5 pl-8 text-[13px] leading-[19px] text-text-primary placeholder:text-text-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          やめる
        </Button>
      </div>

      {result.isPending ? (
        <p role="status" className="px-3 py-3 text-[12px] leading-5 text-text-muted">
          会場候補を読み込んでいます…
        </p>
      ) : failed ? (
        <div className="p-2.5">
          <NoticeBanner tone="blocking">
            会場候補を取得できませんでした。選択済みの会場は保持されています。
            <Button variant="secondary" size="sm" className="ml-3" onClick={() => void result.refetch()}>
              再試行
            </Button>
          </NoticeBanner>
        </div>
      ) : result.isPlaceholderData && items.length === 0 ? (
        <p role="status" className="px-3 py-3 text-[12px] leading-5 text-text-muted">
          会場候補を検索しています…
        </p>
      ) : items.length === 0 ? (
        q.trim() ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-3 text-[12px] leading-5 text-text-muted">
            <span>一致する地点はありません。</span>
            <Button variant="secondary" size="sm" onClick={() => setQ('')}>
              条件を解除
            </Button>
          </div>
        ) : (
          <p className="px-3 py-3 text-[12px] leading-5 text-text-muted">登録されている地点はまだありません。</p>
        )
      ) : (
        <>
          {(result.isPlaceholderData || result.data.totalCount > items.length) && (
            <p className="border-b border-border-subtle bg-surface-subtle px-3 py-1.5 text-[11px] leading-4 text-text-muted tabular-nums" aria-live="polite">
              {result.isPlaceholderData
                ? '検索中（前の条件の結果を表示しています）'
                : `${result.data.totalCount}件中、先頭の${items.length}件を表示しています。条件を絞り込んでください。`}
            </p>
          )}
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label="会場候補"
            className="max-h-[260px] divide-y divide-border-subtle overflow-y-auto"
          >
            {items.map((spot, itemIndex) => {
              const availability = availabilityOf(spot, added)
              const location = [spot.buildingName, spot.floorName].filter(Boolean).join(' ')
              const isActive = itemIndex === active
              return (
                <li
                  key={spot.canonicalId}
                  id={`${listId}-${itemIndex}`}
                  data-index={itemIndex}
                  role="option"
                  aria-selected={isActive}
                  aria-disabled={availability !== 'available' || undefined}
                  onMouseEnter={() => setActive(itemIndex)}
                  onClick={() => choose(spot)}
                  className={cn(
                    'flex items-center justify-between gap-3 px-3 py-2.5 transition-colors',
                    availability === 'available' ? 'cursor-pointer hover:bg-surface-hover' : 'cursor-not-allowed bg-surface-subtle/40',
                    // 枠線は行の内側に描き、スクロール領域の端で切れないようにする。
                    isActive && 'bg-surface-hover outline-2 -outline-offset-2 outline-brand',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-[13px] leading-[18px]', availability === 'available' ? 'font-bold text-text-primary' : 'font-normal text-text-muted')}>
                      {spot.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] leading-4 text-text-muted" title={spot.canonicalId}>
                      {location ? (
                        <>
                          {location} · <span className="font-mono text-[11px]">{spot.canonicalId}</span>
                        </>
                      ) : (
                        <span className="font-mono text-[11px]">{spot.canonicalId}</span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {availability === 'added' ? (
                      <span className="text-[12px] leading-[17px] text-text-muted">追加済み</span>
                    ) : availability === 'stopped' ? (
                      <span className="text-[12px] leading-[17px] text-text-muted">新規選択停止</span>
                    ) : spot.isPublished ? (
                      <StatusLabel tone="success">公開中</StatusLabel>
                    ) : (
                      <StatusLabel tone="warning">未公開</StatusLabel>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {stoppedActive && (
            <p className="border-t border-border-subtle px-3 py-1.5 text-[11px] leading-4 text-text-muted">新規選択停止の地点は選べません。</p>
          )}
          {hasUnpublishedCandidate && (
            <p className="border-t border-border-subtle bg-warning-subtle px-3 py-2 text-[12px] leading-[18px] text-warning">
              「未公開」の地点も選べますが、その地点が公開されるまで、このイベントは公開できません。
            </p>
          )}
        </>
      )}
    </div>
  )
}
