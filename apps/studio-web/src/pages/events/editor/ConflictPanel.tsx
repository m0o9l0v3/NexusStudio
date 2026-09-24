import type { EventDraft } from '../../../api/events'
import type { SpotItem } from '../../../api/reference'
import { formatSlotHeading, participationLabels, type ReferenceIndex } from '../../../events/model'
import { Button } from '../../../ui/Button'

type Row = { label: string; mine: string; latest: string }

function describeSlots(draft: EventDraft, index: ReferenceIndex, spots: Map<string, SpotItem>): string {
  if (draft.slots.length === 0) return '開催枠なし'
  return draft.slots
    .map((slot) => {
      const participation = slot.participation ? participationLabels[slot.participation as keyof typeof participationLabels] : '参加案内未選択'
      const venues = slot.venues.map((venue) => `${spots.get(venue.canonicalSpotId)?.name ?? venue.canonicalSpotId}${venue.note ? `（${venue.note}）` : ''}`).join('／') || '会場未選択'
      return `${formatSlotHeading(slot, index)}・${participation}・${venues}`
    })
    .join('\n')
}

function differences(mine: EventDraft, latest: EventDraft, index: ReferenceIndex, spots: Map<string, SpotItem>): Row[] {
  const text = (value: string | null | undefined) => value?.trim() || '（未入力）'
  const occurrence = (id: string | null | undefined) => index.occurrences.find((item) => item.id === id)?.name ?? (id ? '（不明な開催回）' : '（未選択）')
  const category = (id: string | null | undefined) => (id ? index.categories.get(id)?.name ?? '（不明なカテゴリ）' : '（未選択）')
  const rows: Row[] = [
    { label: 'タイトル', mine: text(mine.title), latest: text(latest.title) },
    { label: '説明', mine: text(mine.description), latest: text(latest.description) },
    { label: '対象の開催', mine: occurrence(mine.occurrenceId), latest: occurrence(latest.occurrenceId) },
    { label: 'カテゴリ', mine: category(mine.categoryId), latest: category(latest.categoryId) },
    { label: '開催枠', mine: describeSlots(mine, index, spots), latest: describeSlots(latest, index, spots) },
  ]
  return rows.filter((row) => row.mine !== row.latest)
}

type ConflictPanelProps = {
  mine: EventDraft
  latest: EventDraft
  latestBy: string
  index: ReferenceIndex
  spots: Map<string, SpotItem>
  /** 競合の解消前：最新の内容を読み込んで編集を再開する。解消後：自分の入力を参照し終えたら閉じる。 */
  resolved: boolean
  onLoadLatest: () => void
  onClose: () => void
}

/**
 * Figma E30「最新の保存内容と比較」（90:1497）。上書き保存の選択肢は出さない。
 * Figmaでは比較から抜け出す操作が無かったため、［最新の内容を読み込む］で最新版を基準に編集を再開し、
 * 自分の入力はこの欄に残して手動で反映できるようにする（docs/UI補完記録.md）。
 */
export function ConflictPanel({ mine, latest, latestBy, index, spots, resolved, onLoadLatest, onClose }: ConflictPanelProps) {
  const rows = differences(mine, latest, index, spots)
  return (
    <aside aria-label="最新の保存内容と比較" className="flex w-[400px] shrink-0 flex-col gap-3 overflow-auto border-l border-border bg-surface p-[18px]">
      <h2 className="text-[16px] leading-6 font-bold text-text-primary">最新の保存内容と比較</h2>
      <p className="text-[11px] leading-[19px] text-warning">
        {resolved ? '最新の内容を読み込みました。あなたの入力はこの欄にだけ残っています。' : `別の画面で先に保存されました（保存者：${latestBy}）。あなたの入力は保持しています。`}
      </p>
      {rows.length === 0 ? (
        <p className="text-[12px] leading-5 text-text-secondary">内容の違いはありません。</p>
      ) : (
        rows.map((row) => (
          <section key={row.label} className="flex flex-col gap-2">
            <h3 className="text-[12px] leading-5 font-medium text-text-primary">{row.label}</h3>
            <div className="rounded-lg bg-surface-subtle p-3">
              <p className="text-[12px] leading-5 font-bold text-text-primary">あなたの入力</p>
              <p className="text-[11px] leading-[19px] break-words whitespace-pre-line text-text-secondary">{row.mine}</p>
            </div>
            <div className="rounded-lg bg-surface-subtle p-3">
              <p className="text-[12px] leading-5 font-bold text-text-primary">最新の保存内容</p>
              <p className="text-[11px] leading-[19px] break-words whitespace-pre-line text-text-secondary">{row.latest}</p>
            </div>
          </section>
        ))
      )}
      <p className="text-[11px] leading-[19px] text-text-secondary">差分を確認し、必要な変更を編集欄へ手動で反映してください。上書き保存の操作はありません。</p>
      {resolved ? (
        <Button variant="secondary" className="self-start" onClick={onClose}>
          比較を閉じる
        </Button>
      ) : (
        <Button className="self-start" onClick={onLoadLatest}>
          最新の内容を読み込む
        </Button>
      )}
    </aside>
  )
}
