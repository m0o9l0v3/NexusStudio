import type { EventDraft } from '../../../api/events'
import type { SpotItem } from '../../../api/reference'
import { previewLines, type ReferenceIndex } from '../../../events/model'
import { StatusBadge } from '../../../ui/StatusBadge'

/**
 * Figma「iOS Preview Inspector」（E04 `2:2` の右側）。編集中の内容を近似表示する（12 §5、07 EV-20）。
 * 実機・SwiftUIの表示を代替するものではない。
 */
export function PreviewPanel({ draft, index, spots, saved }: { draft: EventDraft; index: ReferenceIndex; spots: Map<string, SpotItem>; saved: boolean }) {
  const category = draft.categoryId ? index.categories.get(draft.categoryId)?.name : undefined
  const lines = previewLines(draft, index, spots)
  const empty = !draft.title?.trim() && !draft.description?.trim() && draft.slots.every((slot) => !slot.ocDayId && slot.venues.length === 0)
  const allVenuesShown = draft.slots.every((slot) => slot.venues.length > 0)

  return (
    <aside aria-label="iOS Preview" className="flex w-[400px] shrink-0 flex-col gap-3 overflow-auto border-l border-border bg-surface p-[18px]">
      <h2 className="text-[16px] leading-6 font-bold text-text-primary">iOS Preview</h2>
      <div className="flex gap-2">
        <StatusBadge tone="info">{saved ? '保存済み下書き' : '編集中'}</StatusBadge>
        <StatusBadge>近似表示</StatusBadge>
      </div>
      <div className="flex h-[692px] w-[328px] shrink-0 flex-col rounded-[38px] bg-[#1f2126] px-2.5 py-3.5">
        <div className="flex h-full flex-col gap-3 overflow-auto rounded-[29px] bg-surface px-4 pt-5 pb-[18px]">
          {empty ? (
            <p className="text-[12px] leading-5 text-text-secondary">イベントを入力すると、ここに近似Previewを表示します。</p>
          ) : (
            <>
              <p className="text-[19px] leading-[27px] font-bold break-words text-text-primary">{draft.title?.trim() || '無題のイベント'}</p>
              {category && <StatusBadge className="self-start">{category}</StatusBadge>}
              {draft.description?.trim() && <p className="text-[12px] leading-5 whitespace-pre-line text-text-secondary">{draft.description}</p>}
              {lines.map((line, position) => (
                <div key={position} className="flex flex-col gap-3">
                  <p className="text-[11px] leading-[19px] font-medium whitespace-pre-wrap text-text-primary">{line.heading}</p>
                  <p className="pl-1 text-[11px] leading-[19px] text-text-secondary">{line.detail}</p>
                </div>
              ))}
              {lines.length > 0 && allVenuesShown && <p className="text-[10px] leading-[18px] text-success">すべての会場を表示しています</p>}
            </>
          )}
        </div>
      </div>
      <p className="text-[10px] leading-[18px] text-text-secondary">Generic iPhone Frame / 論理Viewport 393×852を縮小表示</p>
    </aside>
  )
}
