import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CircleDashed, Copy, MapPin, OctagonX, Plus, Search, Trash2, TriangleAlert } from 'lucide-react'
import { useDeferredValue, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
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
import { Checkbox } from '../../../ui/Checkbox'
import { cn } from '../../../ui/cn'
import { Dialog, DialogActions } from '../../../ui/Dialog'
import { SelectField, TextAreaField } from '../../../ui/Field'
import { NoticeBanner } from '../../../ui/NoticeBanner'
import { StatusLabel } from '../../../ui/StatusLabel'

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
  const Icon = level === 'blocking' ? OctagonX : TriangleAlert
  return (
    <p className={cn('inline-flex items-start gap-1 text-[11px] leading-[19px]', level === 'blocking' ? 'text-danger' : 'text-warning')}>
      <Icon aria-hidden size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </p>
  )
}

function RadioOption({
  id,
  name,
  checked,
  invalid,
  label,
  onChange,
}: {
  id?: string
  name: string
  checked: boolean
  invalid?: boolean
  label: string
  onChange: () => void
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] leading-5 text-text-primary">
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className={cn(
          'size-4 shrink-0 cursor-pointer appearance-none rounded-full border bg-surface',
          'checked:border-[5px] checked:border-brand',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          invalid ? 'border-danger' : 'border-border-input',
        )}
      />
      <span>{label}</span>
    </label>
  )
}

/**
 * 日時1件（Figma v2 E02 `65:610`・E03 `77:1042`・E04 `78:1645`・E05 `79:1452`）。
 * 開閉どちらでもヘッダーに日時・会場数・状態と［この日時を複製］［削除］を並べる。
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    // 追加・複製で開いたときだけ見出しボタンへフォーカスを移す（07 §4.4、検証記録 A-3 D4）。
    if (expanded && focusOnOpen) headerButtonRef.current?.focus()
  }, [expanded, focusOnOpen])

  const heading = formatSlotHeading(slot, index)
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

  const allDayLabel = day
    ? formatHours(day)
      ? `${timeModeLabels.allDay}（この日は ${formatHours(day)}）`
      : `${timeModeLabels.allDay}（開催時間未登録）`
    : `${timeModeLabels.allDay}（日付を選ぶと開催時間が出ます）`

  const slotPrefix = `${editorId}-slot-${slot.slotId}`
  const timeInputClass = (invalid: boolean) =>
    cn(
      'h-8 rounded-md border bg-surface px-2.5 text-sm leading-[19px] text-text-primary',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
      'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-55',
      invalid ? 'border-danger' : 'border-border-input',
    )

  return (
    <section aria-label={`日時 ${heading}`} className="rounded-[10px] border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button
          ref={headerButtonRef}
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            if (expanded) setPickerOpen(false)
            onToggle()
          }}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {expanded ? (
            <ChevronDown aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-text-secondary" />
          ) : (
            <ChevronRight aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-text-secondary" />
          )}
          <span className="text-[14px] leading-5 font-bold text-text-primary">{heading}</span>
          <span className="text-[12px] leading-5 text-text-secondary">
            {slot.venues.length === 0 ? '会場なし' : `会場 ${slot.venues.length}か所`}
          </span>
          {slot.status === 'cancelled' && (
            <StatusLabel tone="danger" className="text-[12px]">
              中止
            </StatusLabel>
          )}
          {cancelledByDay && (
            <StatusLabel tone="danger" className="text-[12px]">
              開催日中止
            </StatusLabel>
          )}
          {blocking.length > 0 ? (
            <StatusLabel tone="danger" className="text-[12px]">
              直すこと {blocking.length}件
            </StatusLabel>
          ) : warnings.length > 0 ? (
            <StatusLabel tone="warning" className="text-[12px]">
              要確認
            </StatusLabel>
          ) : null}
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onDuplicate}>
            <Copy aria-hidden size={14} strokeWidth={1.75} />
            この日時を複製
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden size={14} strokeWidth={1.75} />
            削除
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-border p-4">
          {/* 日付・時間 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(180px,220px)_1fr]">
            <SelectField
              id={`${slotPrefix}-day`}
              label="日付"
              value={slot.ocDayId ?? ''}
              onChange={(event) => update({ ocDayId: event.target.value || null })}
              disabled={!occurrence}
              invalid={Boolean(dayIssue)}
              message={
                !occurrence ? (
                  'オープンキャンパスを選ぶと、日付を選べます。'
                ) : dayIssue ? (
                  <span className="inline-flex items-start gap-1">
                    <OctagonX aria-hidden size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
                    <span>{dayIssue.message}</span>
                  </span>
                ) : undefined
              }
              messageTone={!occurrence ? 'secondary' : 'danger'}
            >
              <option value="">選んでください</option>
              {slot.ocDayId && !days.some((candidate) => candidate.id === slot.ocDayId) && (
                <option value={slot.ocDayId}>（選択中のオープンキャンパスにない日付）</option>
              )}
              {days.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {formatDayOption(candidate)}
                </option>
              ))}
            </SelectField>

            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className={cn('text-[12px] leading-5 font-medium', timeModeIssue ? 'text-danger' : 'text-text-secondary')}>
                時間
              </legend>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5">
                <RadioOption
                  id={`${slotPrefix}-timeMode`}
                  name={`time-mode-${slot.slotId}`}
                  checked={slot.timeMode === 'fixed'}
                  invalid={Boolean(timeModeIssue)}
                  label={timeModeLabels.fixed}
                  // 終日へ切り替えても参加について・未選択は自動で変えない（07 EV-42）。
                  onChange={() => update({ timeMode: 'fixed' satisfies TimeMode, fixed: slot.fixed ?? { start: null, end: null } })}
                />
                <RadioOption
                  id={slot.timeMode === 'allDay' ? `${slotPrefix}-time` : undefined}
                  name={`time-mode-${slot.slotId}`}
                  checked={slot.timeMode === 'allDay'}
                  invalid={Boolean(timeModeIssue)}
                  label={allDayLabel}
                  onChange={() => update({ timeMode: 'allDay' satisfies TimeMode, fixed: null })}
                />
              </div>

              {slot.timeMode !== 'allDay' && (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <label htmlFor={`${slotPrefix}-time`} className="text-[12px] leading-5 text-text-secondary">
                    開始
                  </label>
                  <input
                    id={`${slotPrefix}-time`}
                    type="time"
                    value={slot.fixed?.start ?? ''}
                    disabled={slot.timeMode !== 'fixed'}
                    aria-invalid={timeIssue?.level === 'blocking' || undefined}
                    onChange={(event) => update({ fixed: { start: event.target.value || null, end: slot.fixed?.end ?? null } })}
                    className={timeInputClass(timeIssue?.level === 'blocking')}
                  />
                  <span aria-hidden className="text-[12px] text-text-secondary">
                    〜
                  </span>
                  <label htmlFor={`${slotPrefix}-time-end`} className="text-[12px] leading-5 text-text-secondary">
                    終了
                  </label>
                  <input
                    id={`${slotPrefix}-time-end`}
                    type="time"
                    value={slot.fixed?.end ?? ''}
                    disabled={slot.timeMode !== 'fixed'}
                    aria-invalid={timeIssue?.level === 'blocking' || undefined}
                    onChange={(event) => update({ fixed: { start: slot.fixed?.start ?? null, end: event.target.value || null } })}
                    className={timeInputClass(timeIssue?.level === 'blocking')}
                  />
                </div>
              )}

              {timeModeIssue && <InlineIssue level={timeModeIssue.level} message={timeModeIssue.message} />}
              {timeIssue && <InlineIssue level={timeIssue.level} message={timeIssue.message} />}
            </fieldset>
          </div>

          {/* 参加について */}
          <fieldset className="flex flex-col gap-2">
            <legend className={cn('text-[12px] leading-5 font-medium', participationIssue ? 'text-danger' : 'text-text-secondary')}>
              参加について
            </legend>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <RadioOption
                id={`${slotPrefix}-participation`}
                name={`participation-${slot.slotId}`}
                checked={slot.participation === 'atStart'}
                invalid={Boolean(participationIssue)}
                label={participationLabels.atStart}
                onChange={() => update({ participation: 'atStart' satisfies Participation })}
              />
              <RadioOption
                name={`participation-${slot.slotId}`}
                checked={slot.participation === 'anytime'}
                invalid={Boolean(participationIssue)}
                label={participationLabels.anytime}
                onChange={() => update({ participation: 'anytime' satisfies Participation })}
              />
            </div>
            {participationIssue && <InlineIssue level={participationIssue.level} message={participationIssue.message} />}
          </fieldset>

          {/* 会場 */}
          <div className="flex flex-col gap-2">
            <h3 className="text-[12px] leading-5 font-medium text-text-secondary">会場</h3>
            <p className="text-[12px] leading-5 text-text-secondary">
              「会場の説明」はアプリに表示されます（例：受付、体験会場）
            </p>

            {slot.venues.length > 0 && (
              <ol className="divide-y divide-border rounded-lg border border-border bg-surface" aria-label="会場（表示順）">
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
            {venueIssues.map((issue) => (
              <InlineIssue key={issue.canonicalSpotId} level={issue.level} message={issue.message} />
            ))}

            {pickerOpen ? (
              <InlineVenuePicker
                inputId={`${slotPrefix}-add-venue`}
                addedIds={slot.venues.map((venue) => venue.canonicalSpotId)}
                returnFocusTo={addButtonRef}
                onSelect={(spot) => {
                  updateVenues([...slot.venues, { canonicalSpotId: spot.canonicalId, note: null }])
                  setPickerOpen(false)
                }}
                onClose={() => setPickerOpen(false)}
              />
            ) : (
              <Button
                ref={addButtonRef}
                id={`${slotPrefix}-add-venue`}
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => setPickerOpen(true)}
              >
                <Plus aria-hidden size={14} strokeWidth={1.75} />
                会場を追加
              </Button>
            )}
          </div>

          {/* この日時を中止にする */}
          <div className="flex flex-col gap-2.5 pt-1">
            <Checkbox
              label="この日時を中止にする"
              checked={slot.status === 'cancelled'}
              // チェックを外しても入力した中止の案内は下書きに残す（誤操作で消さない）。
              onChange={(event) => update({ status: event.target.checked ? 'cancelled' : 'normal' })}
            />
            {slot.status === 'cancelled' && (
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
            )}
            {day?.status === 'cancelled' && (
              <NoticeBanner tone="warning">
                {formatDateWithWeekday(day.date)}は開催日として中止されています（オープンキャンパス）。この日に属する日時へ中止が反映されます。日時独自の中止理由は別に保持し、開催日の中止を解除しても日時独自の中止は解除しません。
              </NoticeBanner>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="この日時を削除しますか"
        description="削除した日時は、「下書きを保存」するまで保存済みの内容には反映されません。保存前であれば「保存していない変更を取り消す」で元に戻せます。"
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

/** Figma v2 `イベント / 会場の行`。 */
function VenueItem({ rowId, venue, spot, position, count, issue, onNote, onMove, onRemove }: VenueItemProps) {
  const noteId = useId()
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
      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <MapPin
          aria-hidden
          size={16}
          strokeWidth={1.5}
          className={cn('mt-0.5 shrink-0', issue ? 'text-danger' : 'text-text-secondary')}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-5 font-medium text-text-primary">{spot?.name ?? '（不明な地点）'}</p>
          <p className="truncate text-[11px] leading-4 text-text-secondary" title={venue.canonicalSpotId}>
            {location ? `${location} · ${venue.canonicalSpotId}` : venue.canonicalSpotId}
            {!spot ? (
              <span className="font-medium text-danger"> · 見つかりません</span>
            ) : !spot.isPublished ? (
              <span className="font-medium text-danger"> · 未公開</span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={noteId} className="text-[12px] leading-5 text-text-secondary">
          会場の説明
        </label>
        <input
          id={noteId}
          type="text"
          value={venue.note ?? ''}
          placeholder="例：受付"
          onChange={(event) => onNote(event.target.value || null)}
          className="h-7 w-[140px] rounded-md border border-border-input bg-surface px-2 text-[12px] leading-5 text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
        />
        <Button
          ref={upButton}
          variant="secondary"
          size="sm"
          className="w-7 px-0"
          disabled={position === 0}
          onClick={() => onMove(position - 1)}
          aria-label={`${name}を上へ`}
        >
          <ArrowUp aria-hidden size={14} strokeWidth={1.75} />
        </Button>
        <Button
          ref={downButton}
          variant="secondary"
          size="sm"
          className="w-7 px-0"
          disabled={position === count - 1}
          onClick={() => onMove(position + 1)}
          aria-label={`${name}を下へ`}
        >
          <ArrowDown aria-hidden size={14} strokeWidth={1.75} />
        </Button>
        <Button variant="secondary" size="sm" onClick={onRemove} aria-label={`${name}をこの日時から外す`}>
          外す
        </Button>
      </div>
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
  returnFocusTo: RefObject<HTMLButtonElement | null>
  onSelect: (spot: SpotItem) => void
  onClose: () => void
}

/**
 * インライン会場追加（Figma v2 E03 `77:1042`、決定事項36 V2-6）。
 * ↑↓で候補を移動、Enterで追加、Escまたは［やめる］で閉じて［会場を追加］へフォーカスを戻す（07 AC19）。
 */
function InlineVenuePicker({ inputId, addedIds, returnFocusTo, onSelect, onClose }: InlineVenuePickerProps) {
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

  function closeAndReturnFocus() {
    onClose()
    queueMicrotask(() => returnFocusTo.current?.focus())
  }

  function choose(spot: SpotItem | undefined) {
    if (!spot || availabilityOf(spot, added) !== 'available') return
    onSelect(spot)
    queueMicrotask(() => returnFocusTo.current?.focus())
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeAndReturnFocus()
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search aria-hidden size={15} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-secondary" />
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="名前・建物・階・地点IDで検索"
            aria-label="会場を検索"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeSpot ? `${listId}-${active}` : undefined}
            autoComplete="off"
            className="h-8 w-full rounded-md border border-border-input bg-surface pr-2.5 pl-8 text-sm leading-[19px] text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          />
        </div>
        <Button variant="secondary" size="sm" onClick={closeAndReturnFocus}>
          やめる
        </Button>
      </div>

      <p className="text-[12px] leading-5 text-text-secondary">
        名前・建物・地点IDで探せます。押すと、この日時の会場に追加します。
      </p>

      {result.isPending ? (
        <p role="status" className="rounded-lg border border-border bg-surface-subtle px-3 py-2.5 text-[12px] leading-5 text-text-secondary">
          会場候補を読み込んでいます…
        </p>
      ) : failed ? (
        <NoticeBanner tone="blocking">
          会場候補を取得できませんでした。選択済みの会場は保持されています。
          <Button variant="secondary" size="sm" className="ml-3" onClick={() => void result.refetch()}>
            再試行
          </Button>
        </NoticeBanner>
      ) : items.length === 0 ? (
        q.trim() ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-2.5 text-[12px] leading-5 text-text-secondary">
            <span>一致する地点はありません。</span>
            <Button variant="secondary" size="sm" onClick={() => setQ('')}>
              条件を解除
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-surface-subtle px-3 py-2.5 text-[12px] leading-5 text-text-secondary">
            登録されている地点はまだありません。
          </p>
        )
      ) : (
        <>
          {(result.isPlaceholderData || result.data.totalCount > items.length) && (
            <p className="text-[11px] leading-[18px] text-text-secondary" aria-live="polite">
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
            className="max-h-[280px] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface"
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
                    availability === 'available' ? 'cursor-pointer hover:bg-surface-subtle' : 'cursor-not-allowed opacity-60',
                    // 枠線は行の内側に描き、スクロール領域の端で切れないようにする。
                    isActive && 'bg-brand-subtle/40 outline-2 -outline-offset-2 outline-brand',
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <MapPin aria-hidden size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-secondary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] leading-5 font-medium text-text-primary">{spot.name}</p>
                      <p className="truncate text-[11px] leading-4 text-text-secondary" title={spot.canonicalId}>
                        {location ? `${location} · ${spot.canonicalId}` : spot.canonicalId}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {availability === 'added' ? (
                      <span className="text-[12px] leading-5 text-text-secondary">この日時で選択済み</span>
                    ) : availability === 'stopped' ? (
                      <span className="text-[12px] leading-5 text-text-secondary">新規選択停止</span>
                    ) : spot.isPublished ? (
                      <StatusLabel tone="success" className="text-[12px]">
                        公開中
                      </StatusLabel>
                    ) : (
                      <StatusLabel tone="warning" icon={<CircleDashed size={15} strokeWidth={1.5} />} className="text-[12px]">
                        未公開
                      </StatusLabel>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {stoppedActive && (
            <p className="text-[11px] leading-[18px] text-text-secondary">新規選択停止の地点は選べません。</p>
          )}
        </>
      )}

      <p className="text-[11px] leading-[18px] text-text-secondary">
        「未公開」の地点も選べますが、その地点が公開されるまで、このイベントは公開できません。
      </p>
    </div>
  )
}
