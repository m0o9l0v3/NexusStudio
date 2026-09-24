import { forwardRef, useEffect, useRef, useState } from 'react'
import type { EventSlot, Participation, SlotVenue, TimeMode } from '../../../api/events'
import type { OccurrenceItem, SpotItem } from '../../../api/reference'
import { cancellationOf, formatDateLong, formatDayOption, formatHours, formatSlotHeading, moveVenue, participationLabels, timeModeLabels, type DraftIssue, type ReferenceIndex } from '../../../events/model'
import { Button } from '../../../ui/Button'
import { ChoiceGroup } from '../../../ui/ChoiceGroup'
import { cn } from '../../../ui/cn'
import { Dialog, DialogActions } from '../../../ui/Dialog'
import { InputField, SelectField, TextAreaField } from '../../../ui/Field'
import { NoticeBanner } from '../../../ui/NoticeBanner'
import { StatusBadge } from '../../../ui/StatusBadge'
import { VenuePickerDialog, VenueRowContent } from './VenuePickerDialog'

type SlotCardProps = {
  slot: EventSlot
  index: ReferenceIndex
  occurrence: OccurrenceItem | undefined
  spots: Map<string, SpotItem>
  issues: DraftIssue[]
  expanded: boolean
  onExpand: () => void
  onChange: (slot: EventSlot) => void
  onDuplicate: () => void
  onDelete: () => void
}

/**
 * 開催枠1件。閉じた状態は Figma `Slot Summary`（122:3671）、開いた状態は E08（73:243）の入力欄。
 * 1つのイベント編集画面の中で、選んだ枠だけを開いて編集する。
 */
export const SlotCard = forwardRef<HTMLButtonElement, SlotCardProps>(function SlotCard(
  { slot, index, occurrence, spots, issues, expanded, onExpand, onChange, onDuplicate, onDelete },
  summaryRef,
) {
  const heading = formatSlotHeading(slot, index)
  const blocking = issues.filter((issue) => issue.level === 'blocking')
  const warnings = issues.filter((issue) => issue.level === 'warning')
  const venueCount = `${slot.venues.length}会場`

  if (!expanded) {
    return (
      <button
        ref={summaryRef}
        type="button"
        onClick={onExpand}
        aria-expanded={false}
        className="relative flex h-16 w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-left hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="w-[270px] shrink-0 truncate text-[13px] leading-[21px] font-medium text-text-primary">{heading}</span>
        <StatusBadge>{venueCount}</StatusBadge>
        <StatusBadge>{slot.participation ? participationLabels[slot.participation as Participation].replace('時間内は', '') : '参加案内未選択'}</StatusBadge>
        {slot.status === 'cancelled' && <StatusBadge tone="danger">中止</StatusBadge>}
        {cancellationOf(slot, index) === 'day' && <StatusBadge tone="danger">開催日中止</StatusBadge>}
        {blocking.length > 0 ? (
          <StatusBadge tone="danger">公開阻止 {blocking.length}件</StatusBadge>
        ) : warnings.length > 0 ? (
          <StatusBadge tone="warning">要確認</StatusBadge>
        ) : (
          <StatusBadge tone="success">問題なし</StatusBadge>
        )}
        <span className="sr-only">。開いて編集する</span>
      </button>
    )
  }

  return <ExpandedSlot {...{ slot, index, occurrence, spots, issues, heading, venueCount, onChange, onDuplicate, onDelete }} />
})

type ExpandedSlotProps = Omit<SlotCardProps, 'expanded' | 'onExpand'> & { heading: string; venueCount: string }

function ExpandedSlot({ slot, index, occurrence, spots, issues, heading, venueCount, onChange, onDuplicate, onDelete }: ExpandedSlotProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const addButton = useRef<HTMLButtonElement>(null)
  const day = slot.ocDayId ? index.days.get(slot.ocDayId) : undefined
  const days = occurrence?.days ?? []
  const issueFor = (field: DraftIssue['field']) => issues.find((issue) => issue.field === field)

  const update = (patch: Partial<EventSlot>) => onChange({ ...slot, ...patch })
  const updateVenues = (venues: SlotVenue[]) => update({ venues })

  const dayIssue = issueFor('day')
  const timeIssue = issueFor('time')

  return (
    <section aria-label={`開催枠 ${heading}`} className="flex w-full flex-col gap-3 rounded-[10px] border border-brand bg-surface px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <h3 className="text-[16px] leading-6 font-bold text-text-primary">{heading}</h3>
        <StatusBadge>{venueCount}</StatusBadge>
      </div>

      <SelectField
        label="開催日"
        value={slot.ocDayId ?? ''}
        onChange={(event) => update({ ocDayId: event.target.value || null })}
        disabled={!occurrence}
        invalid={Boolean(dayIssue)}
        message={!occurrence ? '対象の開催を選ぶと、所属する開催日を選べます。' : dayIssue?.message}
        messageTone={!occurrence ? 'secondary' : 'danger'}
        className="w-[320px]"
      >
        <option value="">{occurrence ? '開催日を選択' : '開催日を選択（対象の開催が未選択）'}</option>
        {slot.ocDayId && !days.some((candidate) => candidate.id === slot.ocDayId) && (
          <option value={slot.ocDayId}>（対象の開催に属さない開催日）</option>
        )}
        {days.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {formatDayOption(candidate)}
          </option>
        ))}
      </SelectField>
      {days.length > 0 && (
        <p className="-mt-1 text-[11px] leading-[19px] text-text-secondary">候補：{days.map(formatDayOption).join('／')}</p>
      )}

      <ChoiceGroup<TimeMode>
        label="時間方式"
        name={`time-mode-${slot.slotId}`}
        value={slot.timeMode as TimeMode | null}
        choices={[
          { value: 'fixed', label: timeModeLabels.fixed },
          { value: 'allDay', label: timeModeLabels.allDay },
        ]}
        // 終日へ切り替えても参加案内は変えない（07 EV-42）。時刻はpayloadに持たせない（15 v01 §4.2）。
        onChange={(timeMode) => update({ timeMode, fixed: timeMode === 'fixed' ? slot.fixed ?? { start: null, end: null } : null })}
        optionWidthClass="w-[168px]"
        invalid={Boolean(issueFor('timeMode'))}
        message={issueFor('timeMode')?.message}
      />

      {slot.timeMode === 'fixed' && (
        <div className="flex gap-4">
          <InputField
            label="開始"
            type="time"
            value={slot.fixed?.start ?? ''}
            onChange={(event) => update({ fixed: { start: event.target.value || null, end: slot.fixed?.end ?? null } })}
            invalid={timeIssue?.level === 'blocking'}
            className="w-[320px]"
          />
          <InputField
            label="終了"
            type="time"
            value={slot.fixed?.end ?? ''}
            onChange={(event) => update({ fixed: { start: slot.fixed?.start ?? null, end: event.target.value || null } })}
            invalid={timeIssue?.level === 'blocking'}
            className="w-[320px]"
          />
        </div>
      )}
      {slot.timeMode === 'allDay' && day && formatHours(day) && (
        <NoticeBanner>
          {formatDateLong(day.date)} {formatHours(day)}（Open Campus）を参照。時刻は変更できません。
        </NoticeBanner>
      )}
      {timeIssue && <NoticeBanner tone={timeIssue.level === 'blocking' ? 'blocking' : 'warning'}>{timeIssue.message}</NoticeBanner>}

      <ChoiceGroup<Participation>
        label="参加案内"
        name={`participation-${slot.slotId}`}
        value={slot.participation as Participation | null}
        choices={[
          { value: 'atStart', label: participationLabels.atStart },
          { value: 'anytime', label: participationLabels.anytime },
        ]}
        onChange={(participation) => update({ participation })}
        optionWidthClass="w-[270px]"
        invalid={Boolean(issueFor('participation'))}
        message={issueFor('participation')?.message}
      />

      <ChoiceGroup<'normal' | 'cancelled'>
        label="開催状況（この枠）"
        name={`slot-status-${slot.slotId}`}
        value={slot.status as 'normal' | 'cancelled'}
        choices={[
          { value: 'normal', label: '通常' },
          { value: 'cancelled', label: 'この枠を中止' },
        ]}
        // 通常へ戻しても、入力した中止案内は下書きに残す（誤操作で消さない）。
        onChange={(status) => update({ status })}
        optionWidthClass="w-[168px]"
      />
      {slot.status === 'cancelled' && (
        <TextAreaField
          label="中止案内"
          rows={2}
          value={slot.cancelNote ?? ''}
          onChange={(event) => update({ cancelNote: event.target.value || null })}
          message={issueFor('cancel')?.message}
        />
      )}
      {day?.status === 'cancelled' && (
        <NoticeBanner tone="warning">
          {formatDateLong(day.date)}は開催日として中止されています（Open Campus）。この日に属する枠へ親由来の中止を反映します。枠独自の中止理由は別に保持し、開催日の中止を解除しても枠独自の中止は解除しません。
        </NoticeBanner>
      )}

      <div className="flex items-center gap-3">
        <h4 className="text-[13px] leading-[21px] font-medium text-text-primary">会場 {slot.venues.length}件</h4>
        <Button ref={addButton} variant="secondary" onClick={() => setPickerOpen(true)}>
          会場を追加
        </Button>
      </div>
      {issueFor('venues') && <NoticeBanner tone="blocking">{issueFor('venues')!.message}</NoticeBanner>}

      <ol className="flex flex-col gap-3" aria-label="会場（表示順）">
        {slot.venues.map((venue, position) => (
          <VenueItem
            key={venue.canonicalSpotId}
            venue={venue}
            spot={spots.get(venue.canonicalSpotId)}
            position={position}
            count={slot.venues.length}
            issue={issues.find((issue) => issue.field === 'venue' && issue.canonicalSpotId === venue.canonicalSpotId)}
            onNote={(note) => updateVenues(slot.venues.map((item, i) => (i === position ? { ...item, note } : item)))}
            onMove={(to) => updateVenues(moveVenue(slot.venues, position, to))}
            onRemove={() => {
              updateVenues(slot.venues.filter((_, i) => i !== position))
              addButton.current?.focus()
            }}
          />
        ))}
      </ol>
      {slot.venues.length > 0 && <p className="text-[11px] leading-[19px] text-text-secondary">会場順は上へ／下へで変更。キーボードでも操作できます。</p>}

      <div className="flex gap-2 border-t border-border pt-3">
        <Button variant="secondary" onClick={onDuplicate}>
          この枠を複製
        </Button>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          枠を削除
        </Button>
      </div>

      <VenuePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        returnFocusTo={addButton}
        addedIds={slot.venues.map((venue) => venue.canonicalSpotId)}
        onSelect={(spot) => updateVenues([...slot.venues, { canonicalSpotId: spot.canonicalId, note: null }])}
      />

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="この枠を削除しますか"
        description="削除した枠は、下書き保存するまで保存済みの内容には反映されません。保存前であれば［変更を破棄］で元に戻せます。"
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
  venue: SlotVenue
  spot: SpotItem | undefined
  position: number
  count: number
  issue: DraftIssue | undefined
  onNote: (note: string | null) => void
  onMove: (to: number) => void
  onRemove: () => void
}

function VenueItem({ venue, spot, position, count, issue, onNote, onMove, onRemove }: VenueItemProps) {
  const name = spot?.name ?? venue.canonicalSpotId
  const upButton = useRef<HTMLButtonElement>(null)
  const downButton = useRef<HTMLButtonElement>(null)

  // 端まで移動して押したボタンが無効になったら、反対側のボタンへフォーカスを移す（キーボード操作を途切れさせない）。
  useEffect(() => {
    if (position === 0 && document.activeElement === upButton.current) downButton.current?.focus()
    if (position === count - 1 && document.activeElement === downButton.current) upButton.current?.focus()
  }, [position, count])
  return (
    <li className="flex flex-col gap-3">
      <div className={cn('flex h-16 w-[680px] max-w-full items-center gap-2 rounded-lg border bg-surface px-3', issue ? 'border-danger' : 'border-border')}>
        <VenueRowContent spot={spot} canonicalId={venue.canonicalSpotId} />
        {!spot ? (
          <StatusBadge tone="danger">見つかりません</StatusBadge>
        ) : spot.isPublished ? (
          <StatusBadge tone="success">公開中</StatusBadge>
        ) : (
          <StatusBadge tone="warning">未公開：このままでは公開できません</StatusBadge>
        )}
      </div>
      {issue && <NoticeBanner tone="blocking">{issue.message}</NoticeBanner>}
      <InputField
        label={`会場補足（${name}）`}
        value={venue.note ?? ''}
        placeholder="例：受付"
        onChange={(event) => onNote(event.target.value || null)}
        className="w-[320px]"
      />
      <div className="flex gap-2">
        <Button ref={upButton} variant="secondary" disabled={position === 0} onClick={() => onMove(position - 1)} aria-label={`${name}を上へ`}>
          上へ
        </Button>
        <Button ref={downButton} variant="secondary" disabled={position === count - 1} onClick={() => onMove(position + 1)} aria-label={`${name}を下へ`}>
          下へ
        </Button>
        <Button variant="danger" onClick={onRemove} aria-label={`${name}をこの枠から解除`}>
          解除
        </Button>
      </div>
    </li>
  )
}
