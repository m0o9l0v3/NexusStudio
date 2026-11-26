import { MapPin } from 'lucide-react'
import type { EventDraft } from '../../../api/events'
import type { SpotItem } from '../../../api/reference'
import { cancellationOf, formatSlotHeading, sortSlotsForDisplay, type ReferenceIndex } from '../../../events/model'
import { cn } from '../../../ui/cn'
import { IPhoneFrame } from '../../../ui/IPhoneFrame'
import { StatusLabel } from '../../../ui/StatusLabel'

export type PreviewSyncState = 'published' | 'publishedWithChanges' | 'unpublished'

type PreviewPanelProps = {
  draft: EventDraft
  index: ReferenceIndex
  spots: Map<string, SpotItem>
  /** プレビューに表示している内容と公開状態の関係。 */
  previewState: PreviewSyncState
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
  previewState,
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
      className="flex w-[350px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border-subtle bg-surface-subtle p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] leading-[18px] font-bold text-text-primary">アプリでの見え方</h2>
        {onHide && (
          <button
            type="button"
            onClick={onHide}
            className="rounded-sm text-[12px] leading-[17px] text-text-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            隠す
          </button>
        )}
      </div>

      {previewState === 'published' ? (
        <StatusLabel tone="success">公開中と同じ内容を表示</StatusLabel>
      ) : previewState === 'publishedWithChanges' ? (
        <StatusLabel tone="warning">編集中（未公開）を表示</StatusLabel>
      ) : (
        <p className="text-[12px] leading-[17px] text-text-muted">未公開の下書きを表示</p>
      )}

      <IPhoneFrame className="max-w-[292px] self-center">
        <div className="flex flex-col gap-3">
          <div>
            <p className={cn('text-[16px] leading-6 font-bold break-words', draft.title?.trim() ? 'text-text-primary' : 'text-text-muted')}>
              {draft.title?.trim() || '（タイトル未入力）'}
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-text-muted">{category ?? '（カテゴリ未選択）'}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] leading-4 font-bold text-text-primary">日時</p>
            {sortedSlots.length === 0 ? (
              <p className="text-[12px] leading-5 text-text-muted">（日時なし）</p>
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
                          : 'border border-border-subtle bg-canvas text-text-primary hover:bg-surface-hover',
                      )}
                    >
                      <span
                        className={cn(
                          'text-[11px] leading-4 tabular-nums',
                          selected && (slot.ocDayId || slot.timeMode) ? 'font-bold' : 'font-normal',
                          !slot.ocDayId && !slot.timeMode && 'text-text-muted',
                        )}
                      >
                        {label}
                      </span>
                      {cancelled ? (
                        <span
                          className={cn(
                            'text-[10px] leading-3.5 font-bold text-danger',
                            selected && 'self-start rounded bg-canvas px-1.5 py-0.5',
                          )}
                        >
                          中止{cancelReason && cancelReason !== '中止' ? `・${cancelReason}` : ''}
                        </span>
                      ) : (
                        slot.participation === 'anytime' && (
                          <span className={cn('text-[10px] leading-3.5', selected ? 'text-brand' : 'text-text-muted')}>
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
              <p className="text-[12px] leading-5 text-text-muted">（会場なし）</p>
            ) : (
              <div className="flex flex-col gap-2">
                {activeSlot.venues.map((venue) => {
                  const spot = spots.get(venue.canonicalSpotId)
                  return (
                    <div key={venue.canonicalSpotId} className="flex items-center gap-2">
                      <MapPin aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] leading-4 font-bold text-text-primary">
                          {spot?.name ?? venue.canonicalSpotId}
                        </p>
                        {venue.note && <p className="truncate text-[10px] leading-3.5 text-text-muted">{venue.note}</p>}
                      </div>
                      <span className="shrink-0 text-[11px] leading-4 text-brand">案内</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <p className={cn('text-[11px] leading-[17px] break-words whitespace-pre-line', draft.description?.trim() ? 'text-text-primary' : 'text-text-muted')}>
            {draft.description?.trim() || '（説明未入力）'}
          </p>

          {hasCancelled && <p className="text-[10px] leading-4 font-bold text-danger">中止枠の案内を確認してください</p>}
        </div>
      </IPhoneFrame>

      <p className="text-[11px] leading-4 text-text-muted">実際の見え方と一部異なる場合があります。</p>
    </aside>
  )
}
