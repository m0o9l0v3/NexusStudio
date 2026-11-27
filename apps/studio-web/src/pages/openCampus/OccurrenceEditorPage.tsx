import { ChevronDown, ChevronLeft, ChevronRight, Plus, TriangleAlert } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
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
import { ConflictNotice } from '../../editing/ConflictNotice'
import { DraftSaveStatus } from '../../editing/DraftSaveStatus'
import { LeaveGuard } from '../../editing/LeaveGuard'
import { useDraftEditor } from '../../editing/useDraftEditor'
import { formatDateWithWeekday } from '../../events/model'
import { isLive, publicationBadge, reviewPath } from '../../publishing/publication'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { cn } from '../../ui/cn'
import { Dialog, DialogActions } from '../../ui/Dialog'
import { InputField, TextAreaField } from '../../ui/Field'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusLabel } from '../../ui/StatusLabel'

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
      <Toolbar title="オープンキャンパス" leading={<OccurrenceBreadcrumb />} className="flex-wrap" headingClassName="basis-48" />
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
    issues.push({ level: 'blocking', message: '一般公開時間が未登録です。終日の日時は時刻を決められないため公開できません。下書き保存はできます。' })
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

function formatDayHeading(day: OcDayDraft, includeYear = false): string {
  const date = day.date ? `${includeYear ? `${day.date.slice(0, 4)}年` : ''}${formatDateWithWeekday(day.date)}` : '日付未入力'
  const hours = day.publicStart || day.publicEnd ? `${day.publicStart ?? '--:--'}–${day.publicEnd ?? '--:--'}` : '開催時間未登録'
  return `${date} ${hours}`
}

function describeNote(note: string | null | undefined): string {
  return note == null ? '未入力（未設定）' : note === '' ? '空文字' : `「${note}」`
}

function describeDays(days: OcDayDraft[]): string {
  return days.map((day) =>
    `${formatDayHeading(day, true)}・${day.status === 'cancelled' ? '開催日を中止' : '通常'}\n中止案内：${describeNote(day.cancelNote)}`,
  ).join('\n\n') || '開催日なし'
}

function compareOccurrence(mine: OccurrenceDraft, latest: OccurrenceDraft): CompareRow[] {
  return [
    { label: '名称', mine: mine.name || '（未入力）', latest: latest.name || '（未入力）' },
    {
      label: '出典メモ',
      mine: describeNote(mine.sourceNote),
      latest: describeNote(latest.sourceNote),
      changed: (mine.sourceNote ?? null) !== (latest.sourceNote ?? null),
    },
    {
      label: '開催日',
      mine: describeDays(mine.days),
      latest: describeDays(latest.days),
      changed: mine.days.length !== latest.days.length || mine.days.some((day, index) => {
        const other = latest.days[index]
        return day.date !== other.date || day.publicStart !== other.publicStart || day.publicEnd !== other.publicEnd
          || day.status !== other.status || (day.cancelNote ?? null) !== (other.cancelNote ?? null)
      }),
    },
  ]
}

function OccurrenceBreadcrumb() {
  return (
    <nav aria-label="パンくず" className="flex items-center gap-2">
      <Link to="/open-campus" className="inline-flex items-center text-[12px] text-text-secondary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <ChevronLeft aria-hidden size={16} />
        オープンキャンパス
      </Link>
      <span aria-hidden className="text-[12px] text-text-muted">/</span>
    </nav>
  )
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
  const [managementOpen, setManagementOpen] = useState(false)
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
  const compareRows = editor.conflict
    ? compareOccurrence(editor.conflict.mine, editor.conflict.latest.draft)
    : []

  return (
    <>
      <Toolbar
        title={title}
        leading={<OccurrenceBreadcrumb />}
        className="min-w-0 flex-wrap"
        headingClassName="basis-48"
        titleNode={
          <span className="flex flex-wrap items-center gap-2 wrap-anywhere tabular-nums">
            <span>{title}</span>
            <StatusLabel tone={publication.tone}>{publication.label === '取り下げ済み' ? '公開停止' : publication.label}</StatusLabel>
          </span>
        }
      >
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2 tabular-nums">
          <DraftSaveStatus label={editor.statusBadge.label} dirty={editor.dirty} updatedAt={base?.updatedAt} />
          {blockingCount > 0 && <StatusLabel tone="danger">公開できない問題 {blockingCount}件</StatusLabel>}
          <Button variant="secondary" onClick={() => void save()} disabled={editor.saveState === 'saving' || editor.conflictOpen}>{editor.saveState === 'saving' ? '保存中…' : '下書き保存'}</Button>
          <Button onClick={() => void review()} disabled={editor.saveState === 'saving' || editor.conflictOpen}>{editor.dirty || !base ? '保存して確認' : '公開内容を確認'}</Button>
        </div>
      </Toolbar>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-canvas tabular-nums lg:flex-row lg:overflow-hidden">
        <main className="min-w-0 flex-1 px-6 pt-[18px] pb-10 lg:min-h-0 lg:overflow-y-auto">
          <div className="flex w-[784px] max-w-full flex-col gap-3">

            {editor.failure && <NoticeBanner tone="blocking">{editor.failure}</NoticeBanner>}
            {editor.conflictOpen && editor.conflict && (
              <ConflictNotice
                latestById={editor.conflict.latest.updatedBy?.id}
                next="比較欄で最新の内容を確認してから読み込み、必要な変更を反映してください。"
              />
            )}

            <section aria-labelledby="occurrence-basic" className="flex flex-col gap-3">
              <h2 id="occurrence-basic" className="text-[15px] leading-[23px] font-bold text-text-primary">
                基本情報
              </h2>
              <div className="flex flex-col gap-3">
                <InputField
                  label="名称"
                  value={draft.name ?? ''}
                  placeholder="（未入力）"
                  onChange={(event) => editor.update((current) => ({ ...current, name: event.target.value }))}
                  message={draft.name?.trim() ? undefined : '名称が未入力です。下書き保存はできます。'}
                  invalid={!draft.name?.trim()}
                />
                <TextAreaField
                  label="出典メモ（任意）"
                  rows={2}
                  value={draft.sourceNote ?? ''}
                  onChange={(event) => editor.update((current) => ({ ...current, sourceNote: event.target.value || null }))}
                />
              </div>
            </section>

            <section aria-labelledby="occurrence-days" className="mt-2 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="occurrence-days" className="text-[15px] leading-[23px] font-bold text-text-primary">
                  開催日
                </h2>
                <span className="text-[12px] text-text-muted tabular-nums">{draft.days.length}日</span>
                <Button ref={addDayButton} variant="ghost" className="ml-auto" onClick={addDay}><Plus aria-hidden size={15} />
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

                const expanded = expandedDayId === day.id
                const panelId = `occurrence-day-${day.id}`
                const Chevron = expanded ? ChevronDown : ChevronRight

                return (
                  <div key={day.id} className={cn(
                    'min-w-0',
                    expanded ? 'rounded-lg border border-border bg-canvas px-4 py-3.5' : 'border-b border-border-subtle',
                  )}>
                    <h3>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => setExpandedDayId(expanded ? null : day.id)}
                        className={cn(
                          'flex w-full min-w-0 flex-wrap items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                          !expanded && 'min-h-11 py-3 hover:bg-surface-subtle',
                        )}
                      >
                        <Chevron aria-hidden size={14} className="shrink-0" />
                        <span className={cn('text-[13px] leading-[21px] text-text-primary', expanded && 'font-bold')}>{formatDayHeading(day)}</span>
                        <span className="text-[12px] font-normal text-text-muted">関連する日時 {dayReferences.length}件</span>
                        {day.status === 'cancelled' && <StatusLabel tone="danger">開催日を中止</StatusLabel>}
                        {!expanded && (blocking.length > 0 ? (
                          <StatusLabel tone="danger">公開できない問題 {blocking.length}件</StatusLabel>
                        ) : dayProblems.length > 0 ? (
                          <StatusLabel tone="warning">要確認</StatusLabel>
                        ) : null)}
                      </button>
                    </h3>
                    <div id={panelId}>
                      {expanded && (
                        <div className="mt-3 flex min-w-0 flex-col gap-3">
                          <InputField
                            label="日付"
                            type="date"
                            value={day.date ?? ''}
                            disabled={locked}
                            onChange={(event) => updateDay(day.id, { date: event.target.value || null })}
                            message={
                              locked
                                ? `イベントの日時（${dayReferences.length}件）がこの開催日を参照しているため、日付は変更できません。`
                                : savedDate && day.date !== savedDate
                                  ? '参照しているイベントが無いため変更できます。'
                                  : undefined
                            }
                            messageTone="secondary"
                            invalid={!day.date || duplicateDates.has(day.date)}
                            className={cn(
                              'w-full min-w-0 [&_input]:min-w-0 [&_input:disabled]:bg-surface-subtle',
                              locked
                                ? 'sm:grid sm:grid-cols-[minmax(0,min(45%,220px))_minmax(0,1fr)] sm:gap-x-3 sm:[&>label]:col-span-2 sm:[&>p]:self-center'
                                : 'max-w-[220px]',
                            )}
                          />
                          <div className="grid gap-3 sm:grid-cols-[repeat(2,minmax(0,220px))]">
                            <InputField
                              label="一般公開の開始"
                              type="time"
                              value={day.publicStart ?? ''}
                              onChange={(event) => updateDay(day.id, { publicStart: event.target.value || null })}
                              className="w-full min-w-0 max-w-[220px] [&_input]:min-w-0"
                            />
                            <InputField
                              label="一般公開の終了"
                              type="time"
                              value={day.publicEnd ?? ''}
                              onChange={(event) => updateDay(day.id, { publicEnd: event.target.value || null })}
                              className="w-full min-w-0 max-w-[220px] [&_input]:min-w-0"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[12px] text-text-secondary">開催状況</span>
                            <SegmentedControl<'normal' | 'cancelled'>
                              aria-label="開催状況"
                              name={`day-status-${day.id}`}
                              value={day.status as 'normal' | 'cancelled'}
                              options={[
                                { value: 'normal', label: '通常' },
                                { value: 'cancelled', label: '開催日を中止' },
                              ]}
                              onChange={(status) => updateDay(day.id, { status })}
                            />
                          </div>
                          {day.status === 'cancelled' && (
                            <>
                              <TextAreaField
                                label="中止案内"
                                rows={2}
                                value={day.cancelNote ?? ''}
                                onChange={(event) => updateDay(day.id, { cancelNote: event.target.value || null })}
                              />
                              <NoticeBanner>この日に属するイベントの日時へ親由来の中止を反映します。日時独自の中止理由は別に保持し、開催日の中止を解除しても日時独自の中止は解除しません。</NoticeBanner>
                            </>
                          )}
                          {dayProblems.map((issue) => (
                            <NoticeBanner key={issue.message} tone={issue.level === 'blocking' ? 'blocking' : 'warning'}>
                              {issue.message}
                            </NoticeBanner>
                          ))}
                          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
                            <Button variant="danger" disabled={locked} onClick={() => setConfirmDelete(day)}>
                              この日を削除
                            </Button>
                            {locked && <p className="min-w-0 flex-[1_1_12rem] text-[11px] leading-[19px] text-text-secondary">関連する日時があるため削除できません。開催を取りやめる場合は「開催日を中止」を選んでください。</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </section>
            {base && (
              <div className="mt-4 border-t border-border-subtle pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link
                    className="text-[12px] text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    to={`/releases?targetKind=occurrence&targetId=${encodeURIComponent(base.id)}`}
                  >
                    公開履歴を見る ↗
                  </Link>
                  {isLive(base.publication.state) && (
                    <button
                      type="button"
                      aria-expanded={managementOpen}
                      onClick={() => setManagementOpen(!managementOpen)}
                      className="text-[12px] text-text-secondary hover:text-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      詳細管理（公開停止） {managementOpen ? '⌃' : '⌄'}
                    </button>
                  )}
                </div>
                {managementOpen && isLive(base.publication.state) && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded bg-surface-subtle p-3">
                    <p className="text-[12px] text-text-secondary">アプリでの表示を停止します。下書きは残ります。</p>
                    <Button variant="danger" onClick={() => void navigate(reviewPath('occurrence', base.id, 'withdraw'))}>公開をやめる</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        <aside aria-label={editor.conflict ? '最新の保存内容と比較' : '影響を受けるイベント'} className="flex w-full min-w-0 shrink-0 flex-col gap-3 border-t border-border-subtle bg-surface-subtle p-[18px] wrap-anywhere lg:w-[380px] lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
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
 * 開催時間・中止の変更が影響するイベントの日時（08 OC-07・OC-08）。
 * 保存済みのイベント下書きを対象に、編集中の開催時間で判定する。公開版への影響は公開確認（Step 4）で示す。
 */
function ImpactPanel({ days, references }: { days: OcDayDraft[]; references: Map<string, SlotReference[]> }) {
  const entries = days.filter((day) => (references.get(day.id) ?? []).length > 0)
  return (
    <>
      <h2 className="text-[16px] leading-6 font-bold text-text-primary">影響を受けるイベント</h2>
      <p className="text-[11px] leading-[19px] text-text-secondary">保存済みのイベント下書きのうち、各開催日を参照している日時です。公開中のイベントへの影響は公開確認で示します。</p>
      {entries.length === 0 ? (
        <p className="text-[12px] leading-5 text-text-secondary">この開催回の開催日を参照している日時はありません。</p>
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
            <section key={day.id} className="flex flex-col gap-2 border-t border-border-subtle py-3">
              <h3 className="flex flex-wrap items-center gap-2 text-[13px] leading-[21px] font-bold text-text-primary">{formatDayHeading(day)} {day.status === 'cancelled' && <StatusLabel tone="danger">開催日を中止</StatusLabel>}</h3>
              {day.status === 'cancelled' && <p className="text-[11px] leading-[19px] text-danger">開催日の中止が {slots.length}件の日時に反映されます。</p>}
              <ImpactList label={`終日の日時：${allDay.length}件（開催時間の変更がそのまま反映）`} slots={allDay} />
              <ImpactList label={`時間指定の日時：${fixed.length}件`} slots={fixed} />
              {outside.length > 0 && <ImpactList label={`一般公開時間外になる日時：${outside.length}件`} slots={outside} tone="warning" />}
              {day.status === 'cancelled' && <p className="text-[11px] text-text-secondary">「日時独自の中止」は、開催日の中止を解除しても残ります。</p>}
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
    <div className={tone === 'warning' ? 'rounded bg-warning-subtle p-2' : undefined}>
      <p className={cn('text-[11px] leading-[19px] font-bold', tone === 'warning' ? 'text-warning' : 'text-text-primary')}>{tone === 'warning' && <TriangleAlert aria-hidden size={14} className="mr-1 inline" />}{label}</p>
      <ul className="text-[11px] leading-[19px] text-text-secondary">
        {slots.map((slot) => (
          <li key={slot.slotId}>
            ・{slot.eventTitle?.trim() || '無題のイベント'}
            {slot.timeMode === 'fixed' && ` ${slot.start ?? '--:--'}–${slot.end ?? '--:--'}`}
            {slot.slotStatus === 'cancelled' && '（日時独自の中止）'}
          </li>
        ))}
      </ul>
      {tone === 'warning' && <p className="text-[11px] text-warning">時刻は自動で変えません。イベントの編集画面で日時を確認してください。</p>}
    </div>
  )
}
