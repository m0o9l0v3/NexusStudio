import { useState } from 'react'
import type { EventDraft } from '../../../api/events'
import type { ReferenceIndex } from '../../../events/model'
import { Button } from '../../../ui/Button'
import { Dialog, DialogActions } from '../../../ui/Dialog'
import { InputField, SelectField, TextAreaField } from '../../../ui/Field'
import { NoticeBanner } from '../../../ui/NoticeBanner'

type CommonInfoCardProps = {
  draft: EventDraft
  index: ReferenceIndex
  referenceState: 'loading' | 'error' | 'ready'
  onRetryReference: () => void
  /** 保存済みの下書きで選ばれていたカテゴリ。新規選択停止でも既存参照として表示を維持する（08 CAT-05）。 */
  savedCategoryId: string | null
  onChange: (patch: Partial<EventDraft>) => void
  onChangeOccurrence: (occurrenceId: string | null) => void
}

/** 共通情報（Figma E04 `2:2`・E23 `89:1097`）：タイトル・対象の開催・カテゴリ・説明。 */
export function CommonInfoCard({ draft, index, referenceState, onRetryReference, savedCategoryId, onChange, onChangeOccurrence }: CommonInfoCardProps) {
  const [pendingOccurrence, setPendingOccurrence] = useState<string | null | undefined>(undefined)
  const referenceReady = referenceState === 'ready'
  const currentCategory = draft.categoryId ? index.categories.get(draft.categoryId) : undefined

  function requestOccurrence(next: string | null) {
    // 開催日を選んだ枠があるなら、開催回を変える前に影響を確認する（E26）。
    const hasDays = draft.slots.some((slot) => slot.ocDayId)
    if (hasDays && next !== draft.occurrenceId) setPendingOccurrence(next)
    else onChangeOccurrence(next)
  }

  return (
    <section aria-labelledby="common-info-heading" className="flex flex-col gap-3">
      <h3 id="common-info-heading" className="text-[15px] leading-[23px] font-bold text-text-primary">
        共通情報
      </h3>
      <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-3.5">
        <InputField label="タイトル" value={draft.title ?? ''} placeholder="（未入力）" onChange={(event) => onChange({ title: event.target.value || null })} />

        {referenceState === 'error' && (
          <NoticeBanner tone="blocking">
            開催回・カテゴリの一覧を取得できません。保存済みの選択は保持しています。未分類として扱いません。
            <Button variant="secondary" className="ml-3" onClick={onRetryReference}>
              再試行
            </Button>
          </NoticeBanner>
        )}

        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="対象の開催"
            value={draft.occurrenceId ?? ''}
            disabled={!referenceReady}
            onChange={(event) => requestOccurrence(event.target.value || null)}
          >
            <option value="">{referenceState === 'loading' ? '読み込み中…' : '開催回を選択'}</option>
            {draft.occurrenceId && !index.occurrences.some((item) => item.id === draft.occurrenceId) && (
              <option value={draft.occurrenceId}>{referenceReady ? '（見つからない開催回）' : '（取得できません）'}</option>
            )}
            {index.occurrences.map((occurrence) => (
              <option key={occurrence.id} value={occurrence.id}>
                {occurrence.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="カテゴリ"
            value={draft.categoryId ?? ''}
            disabled={!referenceReady}
            onChange={(event) => onChange({ categoryId: event.target.value || null })}
            message={currentCategory && !currentCategory.selectable ? '新規選択停止のカテゴリです。既存の参照は表示を維持します。' : undefined}
            messageTone="warning"
          >
            <option value="">{referenceState === 'loading' ? '読み込み中…' : 'カテゴリを選択'}</option>
            {draft.categoryId && !currentCategory && (
              <option value={draft.categoryId}>{referenceReady ? '（見つからないカテゴリ）' : '（取得できません）'}</option>
            )}
            {[...index.categories.values()].map((category) => {
              const keepsExisting = !category.selectable && category.id === savedCategoryId
              return (
                <option key={category.id} value={category.id} disabled={!category.selectable && !keepsExisting}>
                  {category.name}
                  {!category.selectable && (keepsExisting ? '（既存参照）' : '（新規選択停止）')}
                </option>
              )
            })}
          </SelectField>
        </div>

        <TextAreaField label="説明" rows={2} value={draft.description ?? ''} onChange={(event) => onChange({ description: event.target.value || null })} />
      </div>

      <Dialog
        open={pendingOccurrence !== undefined}
        onOpenChange={(open) => !open && setPendingOccurrence(undefined)}
        title="開催回を変更しますか"
        description="このイベントの開催枠が参照する開催日は、新しい開催回に属しない場合があります。変更後は各枠の日付を選び直し、下書きを保存してください。公開中の内容は変わりません。"
      >
        <DialogActions>
          <Button variant="secondary" onClick={() => setPendingOccurrence(undefined)}>
            戻る
          </Button>
          <Button
            onClick={() => {
              onChangeOccurrence(pendingOccurrence ?? null)
              setPendingOccurrence(undefined)
            }}
          >
            変更する
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  )
}
