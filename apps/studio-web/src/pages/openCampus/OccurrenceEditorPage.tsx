import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ApiError } from '../../api/client'
import {
  createOccurrence,
  getOccurrence,
  updateOccurrence,
  type OccurrenceConflict,
  type OccurrenceDetail,
  type OccurrenceDraft,
  type OcDayDraft,
  type SlotReference,
} from '../../api/occurrences'
import { CompareRows, type CompareRow } from '../../editing/CompareRows'
import { LeaveGuard } from '../../editing/LeaveGuard'
import { useDraftEditor } from '../../editing/useDraftEditor'
import { formatDateLong } from '../../events/model'
import { isLive, publicationBadge, reviewPath } from '../../publishing/publication'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { ChoiceGroup } from '../../ui/ChoiceGroup'
import { cn } from '../../ui/cn'
import { Dialog, DialogActions } from '../../ui/Dialog'
import { InputField, TextAreaField } from '../../ui/Field'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusBadge } from '../../ui/StatusBadge'

/** `/open-campus/new` と `/open-campus/:id`。 */
export function OccurrenceEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const occurrence = useQuery({
    queryKey: ['occurrence', id],
    queryFn: () => getOccurrence(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  if (!id) return <OccurrenceEditor key="new" initial={null} />
  if (occurrence.data) return <OccurrenceEditor key={id} initial={occurrence.data} />

  const notFound = occurrence.error instanceof ApiError && occurrence.error.status === 404
  return (
    <>
      <Toolbar title="Open Campus / 編集対象を読み込み中" />
      <main className="min-h-0 flex-1 overflow-auto px-5 pt-[18px] pb-6">
        <div className="flex w-[784px] max-w-full flex-col items-start gap-3">
          {occurrence.isPending ? (
            <NoticeBanner>選択した開催回を読み込んでいます。取得できるまで編集欄は表示しません。</NoticeBanner>
          ) : notFound ? (
            <NoticeBanner tone="blocking">この開催回は見つかりません。一覧から選び直してください。</NoticeBanner>
          ) : (
            <NoticeBanner tone="blocking">
              開催回を取得できませんでした。編集欄は表示しません。接続を確認して再試行してください。
              <Button variant="secondary" className="ml-3" onClick={() => void occurrence.refetch()}>
                再試行
              </Button>
            </NoticeBanner>
          )}
          <Button variant="secondary" onClick={() => void navigate('/open-campus')}>
            一覧へ戻る
          </Button>
        </div>
      </main>
    </>
  )
}

type DayIssue = { level: 'blocking' | 'warning'; message: string }

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** 公開前の確認（08 OV-01・OV-05）。下書き保存は妨げない。最終判定は公開候補の検証（Step 4）。 */
function dayIssues(day: OcDayDraft, duplicate: boolean): DayIssue[] {
  const issues: DayIssue[] = []
  if (!day.date) issues.push({ level: 'blocking', message: '日付を入力してください。日付が無い開催日は保存できません。' })
  if (duplicate) issues.push({ level: 'blocking', message: '同じ日付の開催日があります。保存できません。' })
  if (!day.publicStart && !day.publicEnd) {
    issues.push({ level: 'blocking', message: '一般公開時間が未登録です。終日の開催枠は時刻を決められないため公開できません。下書き保存はできます。' })
  } else if (!day.publicStart || !day.publicEnd) {
    issues.push({ level: 'blocking', message: '一般公開の開始・終了の片方が未入力です。下書き保存はできます。' })
  } else if (toMinutes(day.publicEnd) <= toMinutes(day.publicStart)) {
    issues.push({ level: 'blocking', message: '終了時刻は開始時刻より後にしてください。下書き保存はできます。' })
  }
  if (day.status === 'cancelled' && !day.cancelNote?.trim()) {
    issues.push({ level: 'warning', message: '中止案内がありません。来場者向けの案内文を確認してください。' })
  }
  return issues
}

function formatDayHeading(day: OcDayDraft): string {
  const date = day.date ? formatDateLong(day.date) : '日付未入力'
  const hours = day.publicStart || day.publicEnd ? `${day.publicStart ?? '--:--'}–${day.publicEnd ?? '--:--'}` : '開催時間未登録'
  return `${date} ${hours}`
}

function OccurrenceEditor({ initial }: { initial: OccurrenceDetail | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const editor = useDraftEditor<OccurrenceDetail, OccurrenceDraft>({
    initial,
    newDraft: () => ({ name: '', sourceNote: null, days: [] }),
    draftOf: (detail) => detail.draft,
    persist: ({ operationId, base, draft }) =>
      base ? updateOccurrence(base.id, operationId, base.rowVersion, draft) : createOccurrence(operationId, draft),
    // 409では常に最新内容が返る（OpenAPIではジェネリック型のためnull許容になっている）。
    latestFromConflict: (body) => (body as OccurrenceConflict).latest!,
  })
  const { draft, base } = editor
  const [expandedDayId, setExpandedDayId] = useState<string | null>(() => draft.days[0]?.id ?? null)
  const [confirmDelete, setConfirmDelete] = useState<OcDayDraft | null>(null)
  const addDayButton = useRef<HTMLButtonElement>(null)

  const references = useMemo(() => {
    const byDay = new Map<string, SlotReference[]>()
    for (const reference of base?.references ?? []) {
      if (!reference.ocDayId) continue
      byDay.set(reference.ocDayId, [...(byDay.get(reference.ocDayId) ?? []), reference])
    }
    return byDay
  }, [base])
  const savedDays = useMemo(() => new Map((base?.draft.days ?? []).map((day) => [day.id, day])), [base])
  const duplicateDates = useMemo(() => {
    const counts = new Map<string, number>()
    for (const day of draft.days) if (day.date) counts.set(day.date, (counts.get(day.date) ?? 0) + 1)
    return new Set([...counts].filter(([, count]) => count > 1).map(([date]) => date))
  }, [draft.days])
  const issues = useMemo(() => new Map(draft.days.map((day) => [day.id, dayIssues(day, Boolean(day.date && duplicateDates.has(day.date)))])), [draft.days, duplicateDates])
  const blockingCount =
    [...issues.values()].flat().filter((issue) => issue.level === 'blocking').length + (draft.name?.trim() ? 0 : 1) + (draft.days.length === 0 ? 1 : 0)

  function updateDay(dayId: string, patch: Partial<OcDayDraft>) {
    editor.update((current) => ({ ...current, days: current.days.map((day) => (day.id === dayId ? { ...day, ...patch } : day)) }))
  }

  function addDay() {
    const day: OcDayDraft = { id: crypto.randomUUID(), date: null, publicStart: null, publicEnd: null, status: 'normal', cancelNote: null }
    editor.update((current) => ({ ...current, days: [...current.days, day] }))
    setExpandedDayId(day.id)
  }

  async function save(): Promise<boolean> {
    return (await saveDetail({ openCreated: true })) !== null
  }

  async function saveDetail({ openCreated }: { openCreated: boolean }): Promise<OccurrenceDetail | null> {
    const detail = await editor.save()
    if (!detail) return null
    queryClient.setQueryData(['occurrence', detail.id], detail)
    void queryClient.invalidateQueries({ queryKey: ['occurrences'] })
    void queryClient.invalidateQueries({ queryKey: ['reference'] })
    if (!base && openCreated) void navigate(`/open-campus/${detail.id}`, { replace: true, state: { skipUnsavedGuard: true } })
    return detail
  }

  /** 公開確認へ。未保存の変更があれば先に保存する（11 §5）。 */
  async function review() {
    const saved = editor.dirty || !base ? await saveDetail({ openCreated: false }) : base
    if (saved) void navigate(reviewPath('occurrence', saved.id), { state: { skipUnsavedGuard: true } })
  }

  const publication = publicationBadge(base?.publication.state ?? 'unpublished')

  const title = draft.name?.trim() || (base ? '無題の開催回' : '新規開催回')
  const compareRows: CompareRow[] = editor.conflict
    ? [
        { label: '名称', mine: editor.conflict.mine.name || '（未入力）', latest: editor.conflict.latest.draft.name || '（未入力）' },
        {
          label: '開催日',
          mine: editor.conflict.mine.days.map((day) => `${formatDayHeading(day)}${day.status === 'cancelled' ? '・中止' : ''}`).join('\n') || '開催日なし',
          latest: editor.conflict.latest.draft.days.map((day) => `${formatDayHeading(day)}${day.status === 'cancelled' ? '・中止' : ''}`).join('\n') || '開催日なし',
        },
      ]
    : []

  return (
    <>
      <Toolbar title={`Open Campus / ${title}`}>
        <StatusBadge tone={publication.tone}>{publication.label}</StatusBadge>
        <StatusBadge tone={editor.statusBadge.tone}>
          <span role="status">{editor.statusBadge.label}</span>
        </StatusBadge>
        {blockingCount > 0 && <StatusBadge tone="danger">公開阻止 {blockingCount}件</StatusBadge>}
        <Button className="min-w-[93px]" onClick={() => void save()} disabled={editor.saveState === 'saving' || editor.conflictOpen}>
          {editor.saveState === 'saving' ? '保存中…' : editor.conflictOpen ? '保存不可' : '下書き保存'}
        </Button>
        <Button variant="secondary" className="min-w-[93px]" onClick={() => void navigate('/open-campus')}>
          一覧へ戻る
        </Button>
        <Button variant="secondary" onClick={() => void review()} disabled={editor.saveState === 'saving' || editor.conflictOpen}>
          {editor.dirty || !base ? '保存して確認' : '公開内容を確認'}
        </Button>
        {base && isLive(base.publication.state) && (
          <Button variant="danger" className="min-w-[93px]" onClick={() => void navigate(reviewPath('occurrence', base.id, 'withdraw'))}>
            取り下げ
          </Button>
        )}
      </Toolbar>

      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 flex-1 overflow-auto px-5 pt-[18px] pb-10">
          <div className="flex w-[784px] max-w-full flex-col gap-3">
            <h2 className="text-[22px] leading-[30px] font-bold text-text-primary">{base ? '開催回を編集' : '新規開催回'}</h2>
            {editor.failure && <NoticeBanner tone="blocking">{editor.failure}</NoticeBanner>}
            {editor.conflictOpen && (
              <NoticeBanner tone="warning">
                他の管理者が先に保存しました。あなたの入力は保持されています。右の比較で最新の内容を確認してから読み込み、必要な変更を反映してください。
              </NoticeBanner>
            )}

            <section aria-labelledby="occurrence-basic" className="flex flex-col gap-3">
              <h3 id="occurrence-basic" className="text-[15px] leading-[23px] font-bold text-text-primary">
                基本情報
              </h3>
              <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-3.5">
                <InputField
                  label="名称"
                  value={draft.name ?? ''}
                  placeholder="（未入力）"
                  onChange={(event) => editor.update((current) => ({ ...current, name: event.target.value }))}
                  message={draft.name?.trim() ? undefined : '名称が未入力です。下書き保存はできます。'}
                  invalid={!draft.name?.trim()}
                />
                <TextAreaField
                  label="出典（任意）"
                  rows={2}
                  value={draft.sourceNote ?? ''}
                  onChange={(event) => editor.update((current) => ({ ...current, sourceNote: event.target.value || null }))}
                />
              </div>
            </section>

            <section aria-labelledby="occurrence-days" className="mt-2 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <h3 id="occurrence-days" className="text-[15px] leading-[23px] font-bold text-text-primary">
                  開催日
                </h3>
                <StatusBadge>{draft.days.length}日</StatusBadge>
                <Button ref={addDayButton} variant="secondary" onClick={addDay}>
                  開催日を追加
                </Button>
              </div>
              {draft.days.length === 0 && <NoticeBanner tone="blocking">開催日がありません。公開には開催日が必要です。下書き保存はできます。</NoticeBanner>}

              {draft.days.map((day) => {
                const dayReferences = references.get(day.id) ?? []
                const locked = dayReferences.length > 0 && savedDays.has(day.id)
                const savedDate = savedDays.get(day.id)?.date
                const dayProblems = issues.get(day.id) ?? []
                const blocking = dayProblems.filter((issue) => issue.level === 'blocking')

                if (expandedDayId !== day.id) {
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => setExpandedDayId(day.id)}
                      aria-expanded={false}
                      className="relative flex h-16 w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-left hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <span className="w-[270px] shrink-0 truncate text-[13px] leading-[21px] font-medium text-text-primary">{formatDayHeading(day)}</span>
                      <StatusBadge tone={day.status === 'cancelled' ? 'danger' : 'neutral'}>{day.status === 'cancelled' ? '中止' : '通常'}</StatusBadge>
                      <StatusBadge>関連 {dayReferences.length}枠</StatusBadge>
                      {blocking.length > 0 ? (
                        <StatusBadge tone="danger">公開阻止 {blocking.length}件</StatusBadge>
                      ) : dayProblems.length > 0 ? (
                        <StatusBadge tone="warning">要確認</StatusBadge>
                      ) : (
                        <StatusBadge tone="success">問題なし</StatusBadge>
                      )}
                      <span className="sr-only">。開いて編集する</span>
                    </button>
                  )
                }

                return (
                  <section key={day.id} aria-label={`開催日 ${formatDayHeading(day)}`} className="flex w-full flex-col gap-3 rounded-[10px] border border-brand bg-surface px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <h4 className="text-[16px] leading-6 font-bold text-text-primary">{formatDayHeading(day)}</h4>
                      <StatusBadge>関連 {dayReferences.length}枠</StatusBadge>
                    </div>
                    <InputField
                      label="日付"
                      type="date"
                      value={day.date ?? ''}
                      disabled={locked}
                      onChange={(event) => updateDay(day.id, { date: event.target.value || null })}
                      message={
                        locked
                          ? `イベントの開催枠（${dayReferences.length}枠）が参照しているため、日付は変更できません。`
                          : savedDate && day.date !== savedDate
                            ? '参照しているイベントが無いため変更できます。'
                            : undefined
                      }
                      messageTone="secondary"
                      invalid={!day.date || duplicateDates.has(day.date)}
                      className="w-[320px]"
                    />
                    <div className="flex gap-4">
                      <InputField
                        label="一般公開の開始"
                        type="time"
                        value={day.publicStart ?? ''}
                        onChange={(event) => updateDay(day.id, { publicStart: event.target.value || null })}
                        className="w-[320px]"
                      />
                      <InputField
                        label="一般公開の終了"
                        type="time"
                        value={day.publicEnd ?? ''}
                        onChange={(event) => updateDay(day.id, { publicEnd: event.target.value || null })}
                        className="w-[320px]"
                      />
                    </div>
                    <ChoiceGroup<'normal' | 'cancelled'>
                      label="開催状況"
                      name={`day-status-${day.id}`}
                      value={day.status as 'normal' | 'cancelled'}
                      choices={[
                        { value: 'normal', label: '通常' },
                        { value: 'cancelled', label: '開催日を中止' },
                      ]}
                      onChange={(status) => updateDay(day.id, { status })}
                      optionWidthClass="w-[168px]"
                    />
                    {day.status === 'cancelled' && (
                      <>
                        <TextAreaField
                          label="中止案内"
                          rows={2}
                          value={day.cancelNote ?? ''}
                          onChange={(event) => updateDay(day.id, { cancelNote: event.target.value || null })}
                        />
                        <NoticeBanner>この日に属する枠へ親由来の中止を反映します。枠独自の中止理由は別に保持し、開催日の中止を解除しても枠独自の中止は解除しません。</NoticeBanner>
                      </>
                    )}
                    {dayProblems.map((issue) => (
                      <NoticeBanner key={issue.message} tone={issue.level === 'blocking' ? 'blocking' : 'warning'}>
                        {issue.message}
                      </NoticeBanner>
                    ))}
                    <div className="flex items-center gap-3 border-t border-border pt-3">
                      <Button variant="danger" disabled={locked} onClick={() => setConfirmDelete(day)}>
                        この日を削除
                      </Button>
                      {locked && <p className="text-[11px] leading-[19px] text-text-secondary">参照しているイベントの開催枠があるため削除できません。</p>}
                    </div>
                  </section>
                )
              })}
            </section>
          </div>
        </main>

        <aside aria-label={editor.conflict ? '最新の保存内容と比較' : '影響を受けるイベント'} className="flex w-[400px] shrink-0 flex-col gap-3 overflow-auto border-l border-border bg-surface p-[18px]">
          {editor.conflict ? (
            <CompareRows
              rows={compareRows}
              latestBy={editor.conflict.latest.updatedBy?.displayName ?? '取り込み'}
              resolved={editor.conflict.resolved}
              onLoadLatest={editor.loadLatest}
              onClose={editor.closeConflict}
            />
          ) : (
            <ImpactPanel days={draft.days} references={references} />
          )}
        </aside>
      </div>

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="この開催日を削除しますか"
        description="削除した開催日は、下書き保存するまで保存済みの内容には反映されません。開催を取りやめる場合は、削除ではなく「開催日を中止」を選んでください。"
      >
        <DialogActions>
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
            戻る
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const target = confirmDelete
              setConfirmDelete(null)
              if (target) editor.update((current) => ({ ...current, days: current.days.filter((day) => day.id !== target.id) }))
              setExpandedDayId(null)
              addDayButton.current?.focus()
            }}
          >
            削除する
          </Button>
        </DialogActions>
      </Dialog>

      <LeaveGuard id="occurrence-editor" dirty={editor.dirty} saving={editor.saveState === 'saving'} canSave={!editor.conflictOpen} onSave={save} />
    </>
  )
}

/**
 * 開催時間・中止の変更が影響するイベントの開催枠（08 OC-07・OC-08）。
 * 保存済みのイベント下書きを対象に、編集中の開催時間で判定する。公開版への影響は公開確認（Step 4）で示す。
 */
function ImpactPanel({ days, references }: { days: OcDayDraft[]; references: Map<string, SlotReference[]> }) {
  const entries = days.filter((day) => (references.get(day.id) ?? []).length > 0)
  return (
    <>
      <h2 className="text-[16px] leading-6 font-bold text-text-primary">影響を受けるイベント</h2>
      <p className="text-[11px] leading-[19px] text-text-secondary">保存済みのイベント下書きのうち、各開催日を参照している開催枠です。</p>
      {entries.length === 0 ? (
        <p className="text-[12px] leading-5 text-text-secondary">この開催回の開催日を参照している開催枠はありません。</p>
      ) : (
        entries.map((day) => {
          const slots = references.get(day.id) ?? []
          const allDay = slots.filter((slot) => slot.timeMode === 'allDay')
          const fixed = slots.filter((slot) => slot.timeMode === 'fixed')
          const outside = fixed.filter(
            (slot) =>
              day.publicStart && day.publicEnd && slot.start && slot.end && (toMinutes(slot.start) < toMinutes(day.publicStart) || toMinutes(slot.end) > toMinutes(day.publicEnd)),
          )
          return (
            <section key={day.id} className="flex flex-col gap-2 rounded-lg bg-surface-subtle p-3">
              <h3 className="text-[13px] leading-[21px] font-medium text-text-primary">{formatDayHeading(day)}</h3>
              {day.status === 'cancelled' && <p className="text-[11px] leading-[19px] text-danger">開催日の中止が {slots.length}枠 に反映されます。</p>}
              <ImpactList label={`終日の枠：${allDay.length}件（開催時間の変更がそのまま反映）`} slots={allDay} />
              <ImpactList label={`時間指定の枠：${fixed.length}件`} slots={fixed} />
              {outside.length > 0 && <ImpactList label={`一般公開時間外になる枠：${outside.length}件（時刻は自動で変えません）`} slots={outside} tone="warning" />}
            </section>
          )
        })
      )}
    </>
  )
}

function ImpactList({ label, slots, tone }: { label: string; slots: SlotReference[]; tone?: 'warning' }) {
  if (slots.length === 0) return null
  return (
    <div>
      <p className={cn('text-[11px] leading-[19px] font-medium', tone === 'warning' ? 'text-warning' : 'text-text-primary')}>{label}</p>
      <ul className="text-[11px] leading-[19px] text-text-secondary">
        {slots.map((slot) => (
          <li key={slot.slotId}>
            ・{slot.eventTitle?.trim() || '無題のイベント'}
            {slot.timeMode === 'fixed' && ` ${slot.start ?? '--:--'}–${slot.end ?? '--:--'}`}
            {slot.slotStatus === 'cancelled' && '（枠独自の中止）'}
          </li>
        ))}
      </ul>
    </div>
  )
}
