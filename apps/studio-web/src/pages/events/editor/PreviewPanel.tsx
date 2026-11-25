import { MapPin, Pencil } from 'lucide-react'
import type { EventDraft } from '../../../api/events'
import type { SpotItem } from '../../../api/reference'
import { cancellationOf, formatSlotHeading, sortSlotsForDisplay, type ReferenceIndex } from '../../../events/model'
import { Button } from '../../../ui/Button'
import { cn } from '../../../ui/cn'
import { IPHONE_LOGICAL_VIEWPORT, IPhoneFrame } from '../../../ui/IPhoneFrame'
import { StatusLabel } from '../../../ui/StatusLabel'

type PreviewPanelProps = {
  draft: EventDraft
  index: ReferenceIndex
  spots: Map<string, SpotItem>
  /** 下書きが公開中の内容と一致しているか。 */
  syncedWithPublished: boolean
  /** プレビュー内で表示中の日時ID。 */
  selectedSlotId: string | null
  onSelectSlot: (slotId: string) => void
  /** PC幅でパネルを隠す操作。狭幅（SidePanel 内）では渡さない。 */
  onHide?: () => void
}

/**
 * Figma v2「アプリでの見え方」（E02 `65:610`・E04 `78:1645`・E05 `79:1452` の右側）。
 * 編集中の内容を近似表示する（12 §5、07 EV-20）。実機・SwiftUI の表示を代替するものではない。
 */
export function PreviewPanel({
  draft,
  index,
  spots,
  syncedWithPublished,
  selectedSlotId,
  onSelectSlot,
  onHide,
}: PreviewPanelProps) {
  const category = draft.categoryId ? index.categories.get(draft.categoryId)?.name : undefined
  const sortedSlots = sortSlotsForDisplay(draft.slots, index)
  const activeSlot = sortedSlots.find((slot) => slot.slotId === selectedSlotId) ?? sortedSlots[0] ?? null
  const hasCancelled = draft.slots.some((slot) => cancellationOf(slot, index) !== null)

  return (
    <aside
      aria-label="アプリでの見え方"
      className="flex w-[368px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-surface p-5 xl:w-[384px]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[16px] leading-6 font-bold text-text-primary">アプリでの見え方</h2>
        {onHide && (
          <Button variant="soft" size="sm" onClick={onHide}>
            隠す
          </Button>
        )}
      </div>

      {syncedWithPublished ? (
        <StatusLabel tone="success" className="items-start text-[12px] leading-[18px] whitespace-normal">
          公開中と同じ内容を表示しています
        </StatusLabel>
      ) : (
        <StatusLabel
          tone="warning"
          icon={<Pencil size={14} strokeWidth={1.75} className="mt-0.5" />}
          className="items-start text-[12px] leading-[18px] whitespace-normal"
        >
          編集中の内容を表示しています（まだ公開されていません）
        </StatusLabel>
      )}

      <IPhoneFrame className="max-w-[300px] self-center">
        <div className="flex flex-col gap-3">
          <div>
            <p className={cn('text-[17px] leading-6 font-bold break-words', draft.title?.trim() ? 'text-text-primary' : 'text-text-secondary')}>
              {draft.title?.trim() || '（タイトル未入力）'}
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-text-secondary">{category ?? '（カテゴリ未選択）'}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] leading-4 font-bold text-text-primary">日時</p>
            {sortedSlots.length === 0 ? (
              <p className="text-[12px] leading-5 text-text-secondary">（日時なし）</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sortedSlots.map((slot) => {
                  const selected = activeSlot?.slotId === slot.slotId
                  const cancelled = cancellationOf(slot, index)
                  const label = !slot.ocDayId && !slot.timeMode ? '（日付未選択）' : formatSlotHeading(slot, index)
                  const cancelReason =
                    cancelled === 'slot' ? slot.cancelNote?.trim() || '中止' : cancelled === 'day' ? '開催日の中止' : null
                  return (
                    <button
                      key={slot.slotId}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelectSlot(slot.slotId)}
                      className={cn(
                        'flex flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
                        selected
                          ? 'bg-brand-subtle text-brand'
                          : 'border border-border bg-surface text-text-primary hover:bg-surface-subtle',
                      )}
                    >
                      <span className={cn('text-[11px] leading-4', selected ? 'font-bold' : 'font-medium', !slot.ocDayId && !slot.timeMode && 'font-normal text-text-secondary')}>
                        {label}
                      </span>
                      {cancelled ? (
                        <span className="text-[10px] leading-3.5 font-medium text-danger">
                          中止{cancelReason && cancelReason !== '中止' ? `・${cancelReason}` : ''}
                        </span>
                      ) : (
                        slot.participation === 'anytime' && (
                          <span className={cn('text-[10px] leading-3.5', selected ? 'text-brand/90' : 'text-text-secondary')}>
                            随時参加可
                          </span>
                        )
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] leading-4 font-bold text-text-primary">会場</p>
            {!activeSlot || activeSlot.venues.length === 0 ? (
              <p className="text-[12px] leading-5 text-text-secondary">（会場なし）</p>
            ) : (
              <div className="flex flex-col gap-2">
                {activeSlot.venues.map((venue) => {
                  const spot = spots.get(venue.canonicalSpotId)
                  return (
                    <div key={venue.canonicalSpotId} className="flex items-center gap-2">
                      <MapPin aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-text-secondary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] leading-4 font-medium text-text-primary">
                          {spot?.name ?? venue.canonicalSpotId}
                        </p>
                        {venue.note && <p className="truncate text-[10px] leading-3.5 text-text-secondary">{venue.note}</p>}
                      </div>
                      <span className="shrink-0 text-[11px] leading-4 font-medium text-brand">案内</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <p className={cn('text-[11px] leading-[17px] break-words whitespace-pre-line', draft.description?.trim() ? 'text-text-primary' : 'text-text-secondary')}>
            {draft.description?.trim() || '（説明未入力）'}
          </p>

          {hasCancelled && <p className="text-[10px] leading-4 font-medium text-danger">中止枠の案内を確認してください</p>}
        </div>
      </IPhoneFrame>

      <p className="text-[11px] leading-[17px] text-text-secondary">
        アプリの画面を近い形で表示しています。実際の見え方と少し違うことがあります。（iPhone 17 / {IPHONE_LOGICAL_VIEWPORT}）
      </p>
    </aside>
  )
}
