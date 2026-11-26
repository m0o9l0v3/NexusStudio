import { useState } from 'react'
import type { EventDraft } from '../../../api/events'
import type { DraftIssue, ReferenceIndex } from '../../../events/model'
import { Button } from '../../../ui/Button'
import { Dialog, DialogActions } from '../../../ui/Dialog'
import { InputField, SelectField, TextAreaField } from '../../../ui/Field'
import { NoticeBanner } from '../../../ui/NoticeBanner'

type CommonInfoCardProps = {
  editorId: string
  draft: EventDraft
  index: ReferenceIndex
  referenceState: 'loading' | 'error' | 'ready'
  onRetryReference: () => void
  /** 保存済みの下書きで選ばれていたカテゴリ。新規選択停止でも既存参照として表示を維持する（08 CAT-05）。 */
  savedCategoryId: string | null
  issues: DraftIssue[]
  onChange: (patch: Partial<EventDraft>) => void
  onChangeOccurrence: (occurrenceId: string | null) => void
}

/** 基本情報（Figma v2 E02 `65:610`・E04 `78:1645`・E05 `79:1452`）：タイトル・説明・オープンキャンパス・カテゴリ。 */
export function CommonInfoCard({
  editorId,
  draft,
  index,
  referenceState,
  onRetryReference,
  savedCategoryId,
  issues,
  onChange,
  onChangeOccurrence,
}: CommonInfoCardProps) {
  const [pendingOccurrence, setPendingOccurrence] = useState<string | null | undefined>(undefined)
  const referenceReady = referenceState === 'ready'
  const currentCategory = draft.categoryId ? index.categories.get(draft.categoryId) : undefined

  const issueFor = (field: 'title' | 'occurrence' | 'category') => issues.find((issue) => issue.field === field)
  const titleIssue = issueFor('title')
  const occurrenceIssue = issueFor('occurrence')
  const categoryIssue = issueFor('category')

  function requestOccurrence(next: string | null) {
    // 開催日を選んだ日時があるなら、オープンキャンパスを変える前に影響を確認する（E26）。
    const hasDays = draft.slots.some((slot) => slot.ocDayId)
    if (hasDays && next !== draft.occurrenceId) setPendingOccurrence(next)
    else onChangeOccurrence(next)
  }

  return (
    <section aria-labelledby="common-info-heading" className="flex flex-col gap-3">
      <h2 id="common-info-heading" className="text-[13px] leading-[18px] font-bold text-text-primary">
        基本情報
      </h2>

      <InputField
        id={`${editorId}-title`}
        label="タイトル"
        value={draft.title ?? ''}
        placeholder="イベント名を入力"
        invalid={Boolean(titleIssue)}
        message={titleIssue?.message}
        onChange={(event) => onChange({ title: event.target.value || null })}
      />

      <TextAreaField
        id={`${editorId}-description`}
        label="説明"
        rows={3}
        value={draft.description ?? ''}
        placeholder="参加者向けアプリに表示する説明文"
        onChange={(event) => onChange({ description: event.target.value || null })}
      />

      {referenceState === 'error' && (
        <NoticeBanner tone="blocking">
          オープンキャンパス・カテゴリの一覧を取得できませんでした。保存済みの選択は保持しています。
          <Button variant="secondary" size="sm" className="ml-3" onClick={onRetryReference}>
            再試行
          </Button>
        </NoticeBanner>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField
          id={`${editorId}-occurrence`}
          label="オープンキャンパス"
          value={draft.occurrenceId ?? ''}
          disabled={!referenceReady}
          invalid={Boolean(occurrenceIssue)}
          message={occurrenceIssue?.message}
          onChange={(event) => requestOccurrence(event.target.value || null)}
        >
          <option value="">{referenceState === 'loading' ? '読み込み中…' : '選んでください'}</option>
          {draft.occurrenceId && !index.occurrences.some((item) => item.id === draft.occurrenceId) && (
            <option value={draft.occurrenceId}>{referenceReady ? '（見つからないオープンキャンパス）' : '（取得できません）'}</option>
          )}
          {index.occurrences.map((occurrence) => (
            <option key={occurrence.id} value={occurrence.id}>
              {occurrence.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          id={`${editorId}-category`}
          label="カテゴリ"
          value={draft.categoryId ?? ''}
          disabled={!referenceReady}
          invalid={Boolean(categoryIssue)}
          message={
            categoryIssue
              ? categoryIssue.message
              : currentCategory && !currentCategory.selectable
                ? '新規選択停止のカテゴリです。既存の参照は表示を維持します。'
                : undefined
          }
          messageTone={categoryIssue ? 'danger' : 'warning'}
          onChange={(event) => onChange({ categoryId: event.target.value || null })}
        >
          <option value="">{referenceState === 'loading' ? '読み込み中…' : '選んでください'}</option>
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

      <Dialog
        open={pendingOccurrence !== undefined}
        onOpenChange={(open) => !open && setPendingOccurrence(undefined)}
        title="オープンキャンパスを変更しますか"
        description="このイベントの日時で選んでいる日付は、新しいオープンキャンパスに含まれない場合があります。変更後は各日時の日付を選び直し、下書きを保存してください。公開中の内容は変わりません。"
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
