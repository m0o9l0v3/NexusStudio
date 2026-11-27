import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronLeft, ChevronUp, Plus } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, type Location } from 'react-router'
import { ApiError, NetworkError } from '../../../api/client'
import {
  createEvent,
  getEvent,
  revertEventToPublished,
  updateEvent,
  type DraftValidationProblem,
  type EventConflict,
  type EventDetail,
  type EventDraft,
  type EventSlot,
} from '../../../api/events'
import { getReference, lookupSpots } from '../../../api/reference'
import { ConflictNotice } from '../../../editing/ConflictNotice'
import { saveFailureMessage } from '../../../editing/saveMessages'
import {
  draftKey,
  duplicateSlot,
  emptySlot,
  findDraftIssues,
  indexReference,
  newDraft,
  newId,
  type DraftIssue,
} from '../../../events/model'
import { isLive, publicationBadge, reviewPath } from '../../../publishing/publication'
import { SidePanel } from '../../../shell/SidePanel'
import { Toolbar } from '../../../shell/Toolbar'
import { ToolbarMoreMenu } from '../../../shell/ToolbarMoreMenu'
import { useRegisterUnsavedChanges } from '../../../shell/unsavedChanges'
import { useWideLayout } from '../../../shell/useWideLayout'
import { Button } from '../../../ui/Button'
import { Dialog, DialogActions } from '../../../ui/Dialog'
import { NoticeBanner } from '../../../ui/NoticeBanner'
import { StatusLabel } from '../../../ui/StatusLabel'
import { CommonInfoCard } from './CommonInfoCard'
import { ConflictPanel } from './ConflictPanel'
import { PreviewPanel, type PreviewSyncState } from './PreviewPanel'
import { SlotCard } from './SlotCard'

const clock = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
})

function PublicationStatusLabel({ state }: { state: string }) {
  switch (state) {
    case 'published':
      return <StatusLabel tone="success">公開中</StatusLabel>
    case 'publishedWithChanges':
      return <StatusLabel tone="warning">公開中・変更あり</StatusLabel>
    case 'withdrawn':
      return <StatusLabel tone="neutral">公開停止</StatusLabel>
    default:
      return <StatusLabel tone="neutral">未公開</StatusLabel>
  }
}

function issueTargetId(editorId: string, issue: DraftIssue): string {
  if (issue.slotId === null) {
    if (issue.field === 'slots') return `${editorId}-add-slot`
    return `${editorId}-${issue.field}`
  }
  const prefix = `${editorId}-slot-${issue.slotId}`
  if (issue.field === 'venues') return `${prefix}-add-venue`
  if (issue.field === 'venue') return `${prefix}-venue-${encodeURIComponent(issue.canonicalSpotId ?? '')}`
  return `${prefix}-${issue.field}`
}

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
  const stateHeading = event.isPending ? '読み込み中' : notFound ? '見つかりません' : '取得できませんでした'
  return (
    <>
      <Toolbar
        title={stateHeading}
        leading={
          <div className="flex shrink-0 items-center gap-2.5">
            <Link
              to="/events"
              className="inline-flex items-center gap-1 rounded-sm text-[13px] leading-5 font-normal text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ChevronLeft aria-hidden size={15} strokeWidth={1.75} />
              イベント
            </Link>
            <span aria-hidden className="text-[13px] text-text-muted">
              /
            </span>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 overflow-hidden bg-canvas">
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6 max-[500px]:px-3">
          <div className="flex max-w-[784px] flex-col items-start gap-3">
            {event.isPending ? (
              <NoticeBanner>選択したイベントを読み込んでいます。取得できるまで編集欄は表示しません。</NoticeBanner>
            ) : notFound ? (
              <NoticeBanner tone="blocking">このイベントは見つかりません。イベント一覧から選び直してください。</NoticeBanner>
            ) : (
              <NoticeBanner tone="blocking">
                イベントを取得できませんでした。編集欄は表示しません。接続を確認して再試行してください。
                <Button variant="secondary" size="sm" className="ml-3" onClick={() => void event.refetch()}>
                  再試行
                </Button>
              </NoticeBanner>
            )}
            <Button variant="secondary" onClick={() => void navigate('/events')}>
              イベント一覧へ戻る
            </Button>
          </div>
        </main>
      </div>
    </>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'conflict'

type ConflictState = { latest: EventDetail; mine: EventDraft; resolved: boolean }

function EventEditor({ initial }: { initial: EventDetail | null }) {
  const editorId = useId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [initialNew, setInitialNew] = useState<EventDraft | null>(() => (initial ? null : newDraft()))
  const [draft, setDraft] = useState<EventDraft>(() => initial?.draft ?? initialNew!)
  const [occurrenceAutoApplied, setOccurrenceAutoApplied] = useState(false)

  const [base, setBase] = useState<EventDetail | null>(initial)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [attemptedValidation, setAttemptedValidation] = useState(false)

  // PC幅では右プレビューを表示/非表示できる。1280px未満では重ね表示を Toolbar ボタンで開閉する（検証記録 A-5 D9）。
  const wide = useWideLayout()
  const [previewVisible, setPreviewVisible] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const panelButton = useRef<HTMLButtonElement>(null)

  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(() => draft.slots[0]?.slotId ?? null)
  const [previewSlotId, setPreviewSlotId] = useState<string | null>(() => draft.slots[0]?.slotId ?? null)
  // 追加・複製した枠は開いた直後に見出しへフォーカスを移す（07 §4.4、検証記録 A-3 D4）。
  const [focusSlotId, setFocusSlotId] = useState<string | null>(null)
  // ［移動 →］の移動先。閉じていた日時を開いた直後の DOM マウント後にスクロール＆フォーカスする。
  const [jumpTarget, setJumpTarget] = useState<{ id: string; seq: number } | null>(null)

  // 同じ内容の保存・差し戻しを再試行するときは同じ operationId を使い、応答が失われた操作を二重に作らない。
  const pendingOperation = useRef<{ id: string; key: string } | null>(null)
  const pendingRevertOperation = useRef<{ id: string; eventId: string; rowVersion: number } | null>(null)
  const addSlotButton = useRef<HTMLButtonElement>(null)
  const failureRef = useRef<HTMLDivElement>(null)

  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmRevert, setConfirmRevert] = useState(false)
  const [reverting, setReverting] = useState(false)

  const reference = useQuery({ queryKey: ['reference'], queryFn: getReference })
  const index = useMemo(() => indexReference(reference.data), [reference.data])
  const referenceState = reference.data ? 'ready' : reference.isError ? 'error' : 'loading'

  // 新規作成時、開催回が1件だけなら自動選択する（決定事項36 V2-7）。初期スナップショットも合わせて dirty にしない。
  if (!base && !occurrenceAutoApplied && reference.data) {
    setOccurrenceAutoApplied(true)
    if (index.occurrences.length === 1) {
      const onlyId = index.occurrences[0].id
      setDraft((current) => (current.occurrenceId ? current : { ...current, occurrenceId: onlyId }))
      setInitialNew((current) => (current && !current.occurrenceId ? { ...current, occurrenceId: onlyId } : current))
    }
  }

  useEffect(() => {
    if (!jumpTarget) return
    const target = document.getElementById(jumpTarget.id)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.focus({ preventScroll: true })
    }
  }, [jumpTarget])

  useEffect(() => {
    if (failure) failureRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [failure])

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
  const allIssues = useMemo(
    () =>
      findDraftIssues(draft, index, spots, {
        referenceLoaded: Boolean(reference.data),
        spotsLoaded: spotIds.length === 0 || spotLookup.isSuccess,
        savedCategoryId,
      }),
    [draft, index, spots, reference.data, spotIds.length, spotLookup.isSuccess, savedCategoryId],
  )

  // 新規作成直後の初期未保存状態（E04）では未入力由来の赤表示を抑止する。
  // 保存済み・保存／確認試行後、および入力済みの不正値や警告はすべて表示する（docs/UI補完記録.md）。
  const showMissingIssues = Boolean(base) || attemptedValidation
  const displayedIssues = useMemo(
    () => (showMissingIssues ? allIssues : allIssues.filter((issue) => !(issue.level === 'blocking' && issue.kind === 'missing'))),
    [allIssues, showMissingIssues],
  )
  const displayedBlockingIssues = useMemo(
    () => displayedIssues.filter((issue) => issue.level === 'blocking'),
    [displayedIssues],
  )
  const displayedWarningIssues = useMemo(
    () => displayedIssues.filter((issue) => issue.level === 'warning'),
    [displayedIssues],
  )

  const dirty = draftKey(draft) !== draftKey(base?.draft ?? initialNew!)
  const conflictOpen = conflict !== null && !conflict.resolved
  const busy = saveState === 'saving' || reverting
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

  function jumpToIssue(issue: DraftIssue) {
    if (issue.slotId !== null) {
      setExpandedSlotId(issue.slotId)
      setPreviewSlotId(issue.slotId)
      setFocusSlotId(null)
    }
    setJumpTarget((current) => ({ id: issueTargetId(editorId, issue), seq: (current?.seq ?? 0) + 1 }))
  }

  /** @param openCreated 新規作成後に作成したイベントのURLへ移る（離脱確認から保存した場合は移動先を優先する）。 */
  /** @returns 保存したイベント。保存できなかった場合はnull。 */
  async function save({ openCreated = true }: { openCreated?: boolean } = {}): Promise<EventDetail | null> {
    if (busy || conflictOpen) return null
    setAttemptedValidation(true)
    const snapshot = draft
    const key = draftKey(snapshot)
    const operationId = pendingOperation.current?.key === key ? pendingOperation.current.id : newId()
    pendingOperation.current = { id: operationId, key }
    setSaveState('saving')
    setFailure(null)

    try {
      const detail = base ? await updateEvent(base.id, operationId, base.rowVersion, snapshot) : await createEvent(operationId, snapshot)
      pendingOperation.current = null
      pendingRevertOperation.current = null
      setBase(detail)
      // 保存中に入力が無ければサーバーが整えた内容を表示し、保存直後に「未保存」と出さない（docs/UI補完記録.md）。
      setDraft((current) => (draftKey(current) === key ? detail.draft : current))
      setSaveState('saved')
      queryClient.setQueryData(['event', detail.id], detail)
      void queryClient.invalidateQueries({ queryKey: ['events'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
      if (!base && openCreated) void navigate(`/events/${detail.id}`, { replace: true, state: { skipUnsavedGuard: true } })
      return detail
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        pendingOperation.current = null
        const latest = (error.body as EventConflict).latest
        setConflict({ latest, mine: snapshot, resolved: false })
        setSaveState('conflict')
        // 比較を見ないと解消できないため、重ねて表示する幅でも自動で開く。
        setPanelOpen(true)
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
        setFailure(saveFailureMessage(error))
      }
      return null
    }
  }

  /** 公開中の内容に戻す（決定事項36 V2-5）。operationId の冪等再利用と rowVersion 検証を行う。 */
  async function revertToPublished() {
    if (!base || busy || conflictOpen) return
    const currentBase = base
    const currentDraft = draft
    const reuse =
      pendingRevertOperation.current &&
      pendingRevertOperation.current.eventId === currentBase.id &&
      pendingRevertOperation.current.rowVersion === currentBase.rowVersion
    const operationId = reuse ? pendingRevertOperation.current!.id : newId()
    pendingRevertOperation.current = { id: operationId, eventId: currentBase.id, rowVersion: currentBase.rowVersion }
    setReverting(true)
    setFailure(null)

    try {
      const detail = await revertEventToPublished(currentBase.id, operationId, currentBase.rowVersion)
      pendingRevertOperation.current = null
      pendingOperation.current = null
      setConfirmRevert(false)
      setBase(detail)
      setDraft(detail.draft)
      setConflict(null)
      setSaveState('idle')
      setFailure(null)
      const nextSlotId = detail.draft.slots[0]?.slotId ?? null
      setExpandedSlotId((current) => (current && detail.draft.slots.some((slot) => slot.slotId === current) ? current : nextSlotId))
      setPreviewSlotId((current) => (current && detail.draft.slots.some((slot) => slot.slotId === current) ? current : nextSlotId))
      queryClient.setQueryData(['event', detail.id], detail)
      void queryClient.invalidateQueries({ queryKey: ['events'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
    } catch (error) {
      setConfirmRevert(false)
      if (error instanceof ApiError && error.status === 409) {
        pendingRevertOperation.current = null
        const latest = (error.body as EventConflict).latest
        setConflict({ latest, mine: currentDraft, resolved: false })
        setSaveState('conflict')
        setPanelOpen(true)
      } else if (error instanceof ApiError && error.status === 401) {
        setFailure('ログインの有効期限が切れたため公開中の内容に戻せませんでした。入力は保持されています。再ログイン後、あらためて実行してください。')
      } else if (error instanceof ApiError && error.status === 400) {
        pendingRevertOperation.current = null
        const body = error.body as DraftValidationProblem | undefined
        const detailMessage = body?.problems?.map((problem) => problem.message).join(' ') || body?.title
        setFailure(detailMessage || '公開中の内容に戻せませんでした。')
      } else if (error instanceof ApiError && error.status === 404) {
        pendingRevertOperation.current = null
        setFailure('このイベントは見つからないため公開中の内容に戻せませんでした。入力は保持されています。')
      } else {
        setFailure(
          error instanceof NetworkError
            ? '公開中の内容に戻せたか確認できませんでした。入力は保持されています。もう一度実行すると、重複せずに処理されます。'
            : '公開中の内容に戻せませんでした。入力は保持されています。接続を確認して再試行してください。',
        )
      }
    } finally {
      setReverting(false)
    }
  }

  function discardUnsavedChanges() {
    if (!base) return
    pendingOperation.current = null
    setDraft(base.draft)
    setSaveState('idle')
    setFailure(null)
    const nextSlotId = base.draft.slots[0]?.slotId ?? null
    setExpandedSlotId((current) => (current && base.draft.slots.some((slot) => slot.slotId === current) ? current : nextSlotId))
    setPreviewSlotId((current) => (current && base.draft.slots.some((slot) => slot.slotId === current) ? current : nextSlotId))
    setConfirmDiscard(false)
  }

  function loadLatest() {
    if (!conflict) return
    pendingOperation.current = null
    pendingRevertOperation.current = null
    setBase(conflict.latest)
    setDraft(conflict.latest.draft)
    setConflict({ ...conflict, resolved: true })
    setSaveState('idle')
    setFailure(null)
    const nextSlotId = conflict.latest.draft.slots[0]?.slotId ?? null
    setExpandedSlotId((current) => (current && conflict.latest.draft.slots.some((slot) => slot.slotId === current) ? current : nextSlotId))
    setPreviewSlotId((current) => (current && conflict.latest.draft.slots.some((slot) => slot.slotId === current) ? current : nextSlotId))
    queryClient.setQueryData(['event', conflict.latest.id], conflict.latest)
  }

  function addSlot() {
    const slot = emptySlot()
    updateDraft({ slots: [...draft.slots, slot] })
    setExpandedSlotId(slot.slotId)
    setPreviewSlotId(slot.slotId)
    setFocusSlotId(slot.slotId)
  }

  function duplicate(slotId: string) {
    const position = draft.slots.findIndex((slot) => slot.slotId === slotId)
    if (position < 0) return
    const copy = duplicateSlot(draft.slots[position])
    updateDraft({ slots: [...draft.slots.slice(0, position + 1), copy, ...draft.slots.slice(position + 1)] })
    // 複製後は新しい日時を開き、複製直後の重複が分かるようにする（07 §4.4）。
    setExpandedSlotId(copy.slotId)
    setPreviewSlotId(copy.slotId)
    setFocusSlotId(copy.slotId)
  }

  function remove(slotId: string) {
    const nextSlots = draft.slots.filter((slot) => slot.slotId !== slotId)
    updateDraft({ slots: nextSlots })
    if (expandedSlotId === slotId) setExpandedSlotId(null)
    if (previewSlotId === slotId) setPreviewSlotId(nextSlots[0]?.slotId ?? null)
    addSlotButton.current?.focus()
  }

  function changeOccurrence(occurrenceId: string | null) {
    const days = new Set(index.occurrences.find((item) => item.id === occurrenceId)?.days.map((day) => day.id) ?? [])
    // 新しい開催回に属さない開催日は外し、選び直してもらう（E26・E27）。
    updateDraft({
      occurrenceId,
      slots: draft.slots.map((slot) => (slot.ocDayId && !days.has(slot.ocDayId) ? { ...slot, ocDayId: null } : slot)),
    })
  }

  /** 公開確認へ。未保存の変更があれば先に保存し、画面と公開対象を食い違わせない（11 §5「保存して確認」）。 */
  async function review() {
    setAttemptedValidation(true)
    const saved = dirty || !base ? await save({ openCreated: false }) : base
    if (saved) void navigate(reviewPath('event', saved.id), { state: { skipUnsavedGuard: true } })
  }

  const titleText = draft.title?.trim() || (base ? '無題のイベント' : '新規イベント')
  const publicationState = base?.publication.state ?? 'unpublished'
  const publication = publicationBadge(publicationState)
  const live = Boolean(base && isLive(base.publication.state))
  const showSidePanel = !wide || Boolean(conflict) || previewVisible
  const previewState: PreviewSyncState =
    base && base.publication.state === 'published' && !dirty
      ? 'published'
      : live
        ? 'publishedWithChanges'
        : 'unpublished'

  const saveStatusNode = (() => {
    if (saveState === 'saving') {
      return <span className="text-[12px] leading-[17px] whitespace-nowrap text-text-muted tabular-nums">保存中…</span>
    }
    if (saveState === 'conflict') {
      return <StatusLabel tone="warning">保存競合</StatusLabel>
    }
    if (saveState === 'failed' && dirty) {
      return <StatusLabel tone="danger">保存失敗</StatusLabel>
    }
    if (!base) {
      return <span className="text-[12px] leading-[17px] whitespace-nowrap text-text-muted tabular-nums">まだ保存していません</span>
    }
    if (dirty) {
      return <StatusLabel tone="warning">未保存の変更あり</StatusLabel>
    }
    return (
      <span className="text-[12px] leading-[17px] whitespace-nowrap text-text-muted tabular-nums">
        <time dateTime={base.updatedAt}>{clock.format(new Date(base.updatedAt))}</time> 保存済み
      </span>
    )
  })()
  const saveStatus = <div role="status" className="shrink-0">{saveStatusNode}</div>

  return (
    <>
      <Toolbar
        title={titleText}
        className={wide ? undefined : 'flex-wrap gap-y-2 max-sm:px-4'}
        leading={
          <div className="flex shrink-0 items-center gap-2.5">
            <Link
              to="/events"
              className="inline-flex items-center gap-1 rounded-sm text-[13px] leading-5 font-normal text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ChevronLeft aria-hidden size={15} strokeWidth={1.75} />
              イベント
            </Link>
            <span aria-hidden className="text-[13px] text-text-muted">
              /
            </span>
          </div>
        }
        titleNode={
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="truncate">{titleText}</span>
            {wide && <PublicationStatusLabel state={publicationState} />}
          </span>
        }
      >
        {wide ? (
          <>
            {saveStatus}
            {!previewVisible && !conflict && (
              <Button variant="ghost" size="sm" onClick={() => setPreviewVisible(true)}>
                見え方を表示
              </Button>
            )}
            <Button variant="secondary" onClick={() => void save()} disabled={busy || conflictOpen}>
              {saveState === 'saving' ? '保存中…' : conflictOpen ? '保存不可' : '下書き保存'}
            </Button>
            <Button variant="primary" onClick={() => void review()} disabled={busy || conflictOpen}>
              {dirty || !base ? '保存して確認' : '公開内容を確認'}
            </Button>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2 max-sm:w-full sm:gap-x-3">
            {saveStatus}
            <Button variant="secondary" size="sm" onClick={() => void save()} disabled={busy || conflictOpen}>
              {saveState === 'saving' ? '保存中…' : conflictOpen ? '保存不可' : '下書き保存'}
            </Button>
            <Button
              ref={panelButton}
              variant="secondary"
              size="sm"
              aria-expanded={panelOpen}
              aria-controls="event-side-panel"
              onClick={() => setPanelOpen((open) => !open)}
            >
              {conflict ? '比較' : '見え方'}
            </Button>
            <ToolbarMoreMenu
              label="その他の操作"
              note={`公開状態：${publication.label}`}
              items={[
                { label: 'イベント一覧へ戻る', onSelect: () => void navigate('/events') },
                {
                  label: dirty || !base ? '保存して確認' : '公開内容を確認',
                  onSelect: () => void review(),
                  disabled: busy || conflictOpen,
                },
                ...(live && base
                  ? [{ label: '公開をやめる', danger: true, onSelect: () => void navigate(reviewPath('event', base.id, 'withdraw')) }]
                  : []),
              ]}
            />
          </div>
        )}
      </Toolbar>

      <div className="flex min-h-0 flex-1 overflow-hidden bg-canvas">
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6 max-[500px]:px-3">
          <div className="flex max-w-[820px] flex-col gap-6 pb-8">
            {failure && (
              <div ref={failureRef}>
                <NoticeBanner tone="blocking">{failure}</NoticeBanner>
              </div>
            )}
            {conflictOpen && conflict && (
              <ConflictNotice
                latestById={conflict.latest.updatedBy.id}
                next="右の比較で最新の内容を確認してから読み込み、必要な変更を反映してください。"
              />
            )}

            {/* E05：公開する前に直すこと */}
            {displayedBlockingIssues.length > 0 && (
              <section
                role="region"
                aria-label="公開する前に直すこと"
                className="rounded-md border border-danger-border border-l-[3px] border-l-danger bg-danger-subtle px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] leading-[18px] font-bold text-danger tabular-nums">
                    公開する前に直すこと（{displayedBlockingIssues.length}件）
                  </p>
                  <span className="text-[12px] leading-[17px] text-text-muted">下書き保存はできます</span>
                </div>
                <ul className="mt-2 flex flex-col gap-1">
                  {displayedBlockingIssues.map((issue, idx) => (
                    <li key={`${issue.slotId ?? 'common'}-${issue.field}-${issue.canonicalSpotId ?? idx}`}>
                      <button
                        type="button"
                        onClick={() => jumpToIssue(issue)}
                        className="group flex w-full items-center justify-between gap-3 rounded-sm py-1 text-left text-[13px] leading-5 text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        <span className="min-w-0 flex-1 group-hover:underline">{issue.summary}</span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-[12px] leading-[17px] text-danger group-hover:underline">
                          移動
                          <ArrowRight aria-hidden size={13} strokeWidth={1.75} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {displayedWarningIssues.length > 0 && (
              <NoticeBanner tone="warning">
                <span className="tabular-nums">公開前に確認したい項目が{displayedWarningIssues.length}件あります。</span>
                {displayedWarningIssues.map((issue, idx) => (
                  <button
                    key={`${issue.slotId ?? 'common'}-${issue.field}-${idx}`}
                    type="button"
                    onClick={() => jumpToIssue(issue)}
                    className="ml-2 inline rounded-sm underline underline-offset-2 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                  >
                    {issue.summary}
                  </button>
                ))}
              </NoticeBanner>
            )}

            {/* セクション 1：基本情報 */}
            <CommonInfoCard
              editorId={editorId}
              draft={draft}
              index={index}
              referenceState={referenceState}
              onRetryReference={() => void reference.refetch()}
              savedCategoryId={savedCategoryId}
              issues={displayedIssues.filter((issue) => issue.slotId === null)}
              onChange={updateDraft}
              onChangeOccurrence={changeOccurrence}
            />

            {/* セクション 2：日時と会場 */}
            <section aria-labelledby="slots-heading" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2">
                <div className="flex items-baseline gap-2">
                  <h2 id="slots-heading" className="text-[13px] leading-[18px] font-bold text-text-primary">
                    日時と会場
                  </h2>
                  <span className="text-[12px] leading-[17px] text-text-muted tabular-nums">{draft.slots.length}回</span>
                </div>
                <Button
                  ref={addSlotButton}
                  id={`${editorId}-add-slot`}
                  variant="ghost"
                  size="sm"
                  className="-mr-2 text-text-primary!"
                  onClick={addSlot}
                >
                  <Plus aria-hidden size={14} strokeWidth={1.75} />
                  日時を追加
                </Button>
              </div>

              {displayedIssues
                .filter((issue) => issue.slotId === null && issue.field === 'slots')
                .map((issue) => (
                  <p key={issue.field} className="text-[11px] leading-4 text-danger">
                    {issue.message}
                  </p>
                ))}

              <div className="flex flex-col gap-2">
                {draft.slots.map((slot) => (
                  <SlotCard
                    key={slot.slotId}
                    editorId={editorId}
                    slot={slot}
                    index={index}
                    occurrence={index.occurrences.find((item) => item.id === draft.occurrenceId)}
                    spots={spots}
                    issues={displayedIssues.filter((issue) => issue.slotId === slot.slotId)}
                    expanded={expandedSlotId === slot.slotId}
                    onToggle={() => {
                      if (expandedSlotId === slot.slotId) {
                        setExpandedSlotId(null)
                      } else {
                        setExpandedSlotId(slot.slotId)
                        setPreviewSlotId(slot.slotId)
                      }
                      setFocusSlotId(null)
                    }}
                    onChange={(next) => updateSlot(slot.slotId, next)}
                    onDuplicate={() => duplicate(slot.slotId)}
                    onDelete={() => remove(slot.slotId)}
                    focusOnOpen={focusSlotId === slot.slotId}
                  />
                ))}
              </div>
            </section>

            {/* セクション 3：下部管理エリア（新規作成 E04 では非表示。E02・E02-details `102:3553`） */}
            {base && (
              <section aria-label="このイベントの管理" className="border-t border-border-subtle pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link
                    to={`/releases?targetId=${encodeURIComponent(base.id)}`}
                    className="inline-flex items-center gap-1 rounded-sm text-[12px] leading-[17px] text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    公開履歴を見る
                    <ArrowUpRight aria-hidden size={14} strokeWidth={1.75} />
                  </Link>
                  <button
                    type="button"
                    aria-expanded={detailsOpen}
                    aria-controls={`${editorId}-details-panel`}
                    onClick={() => setDetailsOpen((open) => !open)}
                    className="inline-flex items-center gap-1.5 rounded-sm text-[12px] leading-[17px] text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    詳細管理（元に戻す・公開停止）
                    {detailsOpen ? (
                      <ChevronUp aria-hidden size={14} strokeWidth={1.75} />
                    ) : (
                      <ChevronDown aria-hidden size={14} strokeWidth={1.75} />
                    )}
                  </button>
                </div>

                {detailsOpen && (
                  <div
                    id={`${editorId}-details-panel`}
                    className="mt-3 divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-subtle"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <p className="min-w-0 flex-1 text-[12px] leading-[18px] text-text-muted">
                        最後に下書きを保存したときの内容に戻します。
                      </p>
                      <button
                        type="button"
                        disabled={!dirty || busy || conflictOpen}
                        onClick={() => setConfirmDiscard(true)}
                        className="shrink-0 rounded-sm text-[12px] leading-[18px] text-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-45 disabled:no-underline"
                      >
                        保存していない変更を取り消す
                      </button>
                    </div>

                    {live && (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <p className="min-w-0 flex-1 text-[12px] leading-[18px] text-text-muted">
                            下書きを、いまアプリに出ている内容に戻します。
                          </p>
                          <button
                            type="button"
                            disabled={base.publication.state !== 'publishedWithChanges' || busy || conflictOpen}
                            onClick={() => setConfirmRevert(true)}
                            className="shrink-0 rounded-sm text-[12px] leading-[18px] text-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-45 disabled:no-underline"
                          >
                            公開中の内容に戻す
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <p className="min-w-0 flex-1 text-[12px] leading-[18px] text-text-muted">
                            アプリでの表示を停止します。下書きは残ります。
                          </p>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void navigate(reviewPath('event', base.id, 'withdraw'))}
                            className="shrink-0 rounded-sm text-[12px] leading-[18px] text-danger hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-45 disabled:no-underline"
                          >
                            公開をやめる
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        </main>

        {showSidePanel && (
          <SidePanel
            id="event-side-panel"
            label={conflict ? '最新の保存内容と比較' : 'アプリでの見え方'}
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            returnFocusTo={panelButton}
          >
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
              <PreviewPanel
                draft={draft}
                index={index}
                spots={spots}
                previewState={previewState}
                selectedSlotId={previewSlotId}
                onSelectSlot={setPreviewSlotId}
                onHide={wide ? () => setPreviewVisible(false) : undefined}
              />
            )}
          </SidePanel>
        )}
      </div>

      {/* 未保存離脱確認（S03） */}
      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.reset?.()}
        dismissible={!busy}
        title="未保存の変更があります"
        description="この画面を離れる前に、変更を保存するか破棄するか選択してください。保存に失敗した場合はこの画面に留まります。"
      >
        <DialogActions>
          <Button variant="secondary" onClick={() => blocker.reset?.()} disabled={busy}>
            編集へ戻る
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()} disabled={busy}>
            変更を破棄
          </Button>
          <Button
            disabled={busy || conflictOpen}
            onClick={async () => {
              if (await save({ openCreated: false })) blocker.proceed?.()
              else blocker.reset?.()
            }}
          >
            {saveState === 'saving' ? '保存中…' : '保存して移動'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 保存していない変更を取り消す確認 */}
      <Dialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="保存していない変更を取り消しますか"
        description="最後に「下書き保存」したときの内容に戻します。保存していない入力は失われます。"
      >
        <DialogActions>
          <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
            編集へ戻る
          </Button>
          <Button variant="danger" onClick={discardUnsavedChanges}>
            変更を取り消す
          </Button>
        </DialogActions>
      </Dialog>

      {/* 公開中の内容に戻す確認（決定事項36 V2-5） */}
      <Dialog
        open={confirmRevert}
        onOpenChange={(open) => !reverting && setConfirmRevert(open)}
        dismissible={!reverting}
        title="公開中の内容に戻しますか"
        description="下書きを、いまアプリに出ている公開中の内容に戻して保存します。保存済みの変更と未保存の入力は置き換わります（公開中の内容は変わりません）。"
      >
        <DialogActions>
          <Button variant="secondary" onClick={() => setConfirmRevert(false)} disabled={reverting}>
            編集へ戻る
          </Button>
          <Button variant="danger" onClick={() => void revertToPublished()} disabled={reverting}>
            {reverting ? '戻しています…' : '公開中の内容に戻す'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
