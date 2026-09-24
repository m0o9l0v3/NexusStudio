import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams, type Location } from 'react-router'
import { ApiError } from '../../../api/client'
import { createEvent, getEvent, updateEvent, type DraftValidationProblem, type EventConflict, type EventDetail, type EventDraft, type EventSlot } from '../../../api/events'
import { getReference, lookupSpots } from '../../../api/reference'
import { draftKey, duplicateSlot, emptySlot, findDraftIssues, indexReference, newDraft, newId } from '../../../events/model'
import { Toolbar } from '../../../shell/Toolbar'
import { useRegisterUnsavedChanges } from '../../../shell/unsavedChanges'
import { Button } from '../../../ui/Button'
import { Dialog, DialogActions } from '../../../ui/Dialog'
import { NoticeBanner } from '../../../ui/NoticeBanner'
import { StatusBadge, type StatusTone } from '../../../ui/StatusBadge'
import { CommonInfoCard } from './CommonInfoCard'
import { ConflictPanel } from './ConflictPanel'
import { PreviewPanel } from './PreviewPanel'
import { SlotCard } from './SlotCard'

/** `/events/new` と `/events/:id`。編集対象を読み込んでから編集欄を表示する（E58）。 */
export function EventEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const event = useQuery({
    queryKey: ['event', id],
    queryFn: () => getEvent(id!),
    enabled: Boolean(id),
    // 編集中の入力を、裏での再取得で置き換えない。
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  if (!id) return <EventEditor key="new" initial={null} />
  if (event.data) return <EventEditor key={id} initial={event.data} />

  const notFound = event.error instanceof ApiError && event.error.status === 404
  return (
    <>
      <Toolbar title="Events / 編集対象を読み込み中" />
      <main className="min-h-0 flex-1 overflow-auto px-5 pt-[18px] pb-6">
        <div className="flex w-[784px] max-w-full flex-col items-start gap-3">
          {event.isPending ? (
            <NoticeBanner>選択したイベントを読み込んでいます。取得できるまで編集欄は表示しません。</NoticeBanner>
          ) : notFound ? (
            <NoticeBanner tone="blocking">このイベントは見つかりません。一覧から選び直してください。</NoticeBanner>
          ) : (
            <NoticeBanner tone="blocking">
              イベントを取得できませんでした。編集欄は表示しません。接続を確認して再試行してください。
              <Button variant="secondary" className="ml-3" onClick={() => void event.refetch()}>
                再試行
              </Button>
            </NoticeBanner>
          )}
          <Button variant="secondary" onClick={() => void navigate('/events')}>
            一覧へ戻る
          </Button>
        </div>
      </main>
    </>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'conflict'

type ConflictState = { latest: EventDetail; mine: EventDraft; resolved: boolean }

const SAVE_FAILED = '保存できませんでした。入力は保持されています。接続を確認して再試行してください。'

function EventEditor({ initial }: { initial: EventDetail | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [initialNew] = useState(() => (initial ? null : newDraft()))
  const [draft, setDraft] = useState<EventDraft>(() => initial?.draft ?? initialNew!)
  const [base, setBase] = useState<EventDetail | null>(initial)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(() => draft.slots[0]?.slotId ?? null)
  // 同じ内容の保存を再試行するときは同じ operationId を使い、応答が失われた保存を二重に作らない。
  const pendingOperation = useRef<{ id: string; key: string } | null>(null)
  const addSlotButton = useRef<HTMLButtonElement>(null)

  const reference = useQuery({ queryKey: ['reference'], queryFn: getReference })
  const index = useMemo(() => indexReference(reference.data), [reference.data])
  const referenceState = reference.data ? 'ready' : reference.isError ? 'error' : 'loading'

  const spotIds = useMemo(() => {
    const ids = new Set<string>()
    for (const slot of [...draft.slots, ...(conflict?.latest.draft.slots ?? []), ...(conflict?.mine.slots ?? [])]) {
      for (const venue of slot.venues) ids.add(venue.canonicalSpotId)
    }
    return [...ids].sort()
  }, [draft.slots, conflict])
  const spotLookup = useQuery({
    queryKey: ['spot-lookup', spotIds],
    queryFn: () => lookupSpots(spotIds),
    enabled: spotIds.length > 0,
    placeholderData: keepPreviousData,
  })
  const spots = useMemo(() => new Map((spotLookup.data ?? []).map((spot) => [spot.canonicalId, spot])), [spotLookup.data])

  const savedCategoryId = base?.draft.categoryId ?? null
  const issues = useMemo(
    () =>
      findDraftIssues(draft, index, spots, {
        referenceLoaded: Boolean(reference.data),
        spotsLoaded: spotIds.length === 0 || spotLookup.isSuccess,
        savedCategoryId,
      }),
    [draft, index, spots, reference.data, spotIds.length, spotLookup.isSuccess, savedCategoryId],
  )
  const blockingCount = issues.filter((issue) => issue.level === 'blocking').length

  const dirty = draftKey(draft) !== draftKey(base?.draft ?? initialNew!)
  const conflictOpen = conflict !== null && !conflict.resolved
  useRegisterUnsavedChanges('event-editor', dirty)

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const skip = (nextLocation as Location<{ skipUnsavedGuard?: boolean } | null>).state?.skipUnsavedGuard
    return dirty && !skip && nextLocation.pathname !== currentLocation.pathname
  })

  function updateDraft(patch: Partial<EventDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    if (saveState === 'saved') setSaveState('idle')
  }

  function updateSlot(slotId: string, next: EventSlot) {
    updateDraft({ slots: draft.slots.map((slot) => (slot.slotId === slotId ? next : slot)) })
  }

  /** @param openCreated 新規作成後に作成したイベントのURLへ移る（離脱確認から保存した場合は移動先を優先する）。 */
  async function save({ openCreated = true }: { openCreated?: boolean } = {}): Promise<boolean> {
    if (saveState === 'saving' || conflictOpen) return false
    const snapshot = draft
    const key = draftKey(snapshot)
    const operationId = pendingOperation.current?.key === key ? pendingOperation.current.id : newId()
    pendingOperation.current = { id: operationId, key }
    setSaveState('saving')
    setFailure(null)

    try {
      const detail = base ? await updateEvent(base.id, operationId, base.rowVersion, snapshot) : await createEvent(operationId, snapshot)
      pendingOperation.current = null
      setBase(detail)
      setSaveState('saved')
      queryClient.setQueryData(['event', detail.id], detail)
      void queryClient.invalidateQueries({ queryKey: ['events'] })
      if (!base && openCreated) void navigate(`/events/${detail.id}`, { replace: true, state: { skipUnsavedGuard: true } })
      return true
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        pendingOperation.current = null
        const latest = (error.body as EventConflict).latest
        setConflict({ latest, mine: snapshot, resolved: false })
        setSaveState('conflict')
      } else if (error instanceof ApiError && error.status === 401) {
        // 再ログインダイアログ（L05）は共通の仕組みで表示される。成功とは表示しない。
        setSaveState('failed')
        setFailure('ログインの有効期限が切れたため保存できませんでした。入力は保持されています。再ログイン後、あらためて保存してください。')
      } else if (error instanceof ApiError && error.status === 400) {
        pendingOperation.current = null
        setSaveState('failed')
        const problems = (error.body as DraftValidationProblem | undefined)?.problems ?? []
        setFailure(`保存できない入力があります。${problems.map((problem) => problem.message).join(' ')}`)
      } else if (error instanceof ApiError && error.status === 404) {
        setSaveState('failed')
        setFailure('このイベントは見つからないため保存できませんでした。入力は保持されています。')
      } else {
        setSaveState('failed')
        setFailure(SAVE_FAILED)
      }
      return false
    }
  }

  function loadLatest() {
    if (!conflict) return
    setBase(conflict.latest)
    setDraft(conflict.latest.draft)
    setConflict({ ...conflict, resolved: true })
    setSaveState('idle')
    setFailure(null)
    queryClient.setQueryData(['event', conflict.latest.id], conflict.latest)
  }

  function addSlot() {
    const slot = emptySlot()
    updateDraft({ slots: [...draft.slots, slot] })
    setExpandedSlotId(slot.slotId)
  }

  function duplicate(slotId: string) {
    const position = draft.slots.findIndex((slot) => slot.slotId === slotId)
    const copy = duplicateSlot(draft.slots[position])
    updateDraft({ slots: [...draft.slots.slice(0, position + 1), copy, ...draft.slots.slice(position + 1)] })
    // 複製後は新しい枠を開き、複製直後の重複が分かるようにする（07 §4.4）。
    setExpandedSlotId(copy.slotId)
  }

  function remove(slotId: string) {
    updateDraft({ slots: draft.slots.filter((slot) => slot.slotId !== slotId) })
    setExpandedSlotId(null)
    addSlotButton.current?.focus()
  }

  function changeOccurrence(occurrenceId: string | null) {
    const days = new Set(index.occurrences.find((item) => item.id === occurrenceId)?.days.map((day) => day.id) ?? [])
    // 新しい開催回に属さない開催日は外し、選び直してもらう（E26・E27）。
    updateDraft({ occurrenceId, slots: draft.slots.map((slot) => (slot.ocDayId && !days.has(slot.ocDayId) ? { ...slot, ocDayId: null } : slot)) })
  }

  const saveBadge: { label: string; tone: StatusTone } =
    saveState === 'saving'
      ? { label: '保存中', tone: 'neutral' }
      : saveState === 'conflict'
        ? { label: '保存競合', tone: 'warning' }
        : saveState === 'failed' && dirty
          ? { label: '保存失敗', tone: 'danger' }
          : dirty || !base
            ? { label: '未保存', tone: 'warning' }
            : { label: '保存済み', tone: 'success' }

  const titleText = draft.title?.trim() || (base ? '無題のイベント' : '新規イベント')

  return (
    <>
      <Toolbar title={`Events / ${titleText}`}>
        <StatusBadge>未公開</StatusBadge>
        <StatusBadge tone={saveBadge.tone}>
          <span role="status">{saveBadge.label}</span>
        </StatusBadge>
        {blockingCount > 0 && <StatusBadge tone="danger">公開阻止 {blockingCount}件</StatusBadge>}
        <Button className="min-w-[93px]" onClick={() => void save()} disabled={saveState === 'saving' || conflictOpen}>
          {saveState === 'saving' ? '保存中…' : conflictOpen ? '保存不可' : '下書き保存'}
        </Button>
        <Button variant="secondary" className="min-w-[93px]" onClick={() => void navigate('/events')}>
          一覧へ戻る
        </Button>
        <Button variant="secondary" disabled title="公開は Step 4 で実装します">
          公開内容を確認
        </Button>
      </Toolbar>

      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 flex-1 overflow-auto px-5 pt-[18px] pb-10">
          <div className="flex w-[784px] max-w-full flex-col gap-3">
            <h2 className="text-[22px] leading-[30px] font-bold text-text-primary">{base ? 'イベントを編集' : '新規イベント'}</h2>

            {failure && <NoticeBanner tone="blocking">{failure}</NoticeBanner>}
            {conflictOpen && (
              <NoticeBanner tone="warning">
                他の管理者が先に保存しました。あなたの入力は保持されています。右の比較で最新の内容を確認してから読み込み、必要な変更を反映してください。
              </NoticeBanner>
            )}

            <CommonInfoCard
              draft={draft}
              index={index}
              referenceState={referenceState}
              onRetryReference={() => void reference.refetch()}
              savedCategoryId={savedCategoryId}
              onChange={updateDraft}
              onChangeOccurrence={changeOccurrence}
            />
            {issues
              .filter((issue) => issue.slotId === null && issue.field !== 'category')
              .map((issue) => (
                <p key={issue.field} className="text-[11px] leading-[19px] text-danger">
                  {issue.message}
                </p>
              ))}

            <section aria-labelledby="slots-heading" className="mt-2 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <h3 id="slots-heading" className="text-[15px] leading-[23px] font-bold text-text-primary">
                  開催枠
                </h3>
                <StatusBadge>{draft.slots.length}枠</StatusBadge>
                <Button ref={addSlotButton} variant="secondary" onClick={addSlot}>
                  開催枠を追加
                </Button>
              </div>
              {draft.slots.map((slot) => (
                <SlotCard
                  key={slot.slotId}
                  slot={slot}
                  index={index}
                  occurrence={index.occurrences.find((item) => item.id === draft.occurrenceId)}
                  spots={spots}
                  issues={issues.filter((issue) => issue.slotId === slot.slotId)}
                  expanded={expandedSlotId === slot.slotId}
                  onExpand={() => setExpandedSlotId(slot.slotId)}
                  onChange={(next) => updateSlot(slot.slotId, next)}
                  onDuplicate={() => duplicate(slot.slotId)}
                  onDelete={() => remove(slot.slotId)}
                />
              ))}
            </section>
          </div>
        </main>

        {conflict ? (
          <ConflictPanel
            mine={conflict.mine}
            latest={conflict.latest.draft}
            latestBy={conflict.latest.updatedBy.displayName}
            index={index}
            spots={spots}
            resolved={conflict.resolved}
            onLoadLatest={loadLatest}
            onClose={() => setConflict(null)}
          />
        ) : (
          <PreviewPanel draft={draft} index={index} spots={spots} saved={Boolean(base) && !dirty} />
        )}
      </div>

      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.reset?.()}
        dismissible={saveState !== 'saving'}
        title="未保存の変更があります"
        description="この画面を離れる前に、変更を保存するか破棄するか選択してください。保存に失敗した場合はこの画面に留まります。"
      >
        <DialogActions>
          <Button variant="secondary" onClick={() => blocker.reset?.()} disabled={saveState === 'saving'}>
            編集へ戻る
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()} disabled={saveState === 'saving'}>
            変更を破棄
          </Button>
          <Button
            disabled={saveState === 'saving' || conflictOpen}
            onClick={async () => {
              if (await save({ openCreated: false })) blocker.proceed?.()
              else blocker.reset?.()
            }}
          >
            {saveState === 'saving' ? '保存中…' : '保存して移動'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
