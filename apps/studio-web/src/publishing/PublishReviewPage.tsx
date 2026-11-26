import { ChevronLeft } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { getCategories } from '../api/categories'
import { ApiError, NetworkError } from '../api/client'
import { getEvent } from '../api/events'
import { getOccurrence } from '../api/occurrences'
import { getReference } from '../api/reference'
import { getOperation, previewPublish, publish, type OperationResult, type PublishAction, type PublishEntry, type PublishPreview, type TargetKind } from '../api/releases'
import { getSpot } from '../api/spots'
import { useSessionExpiry } from '../auth/session'
import { newId } from '../events/model'
import { Toolbar } from '../shell/Toolbar'
import { Button } from '../ui/Button'
import { NoticeBanner } from '../ui/NoticeBanner'
import { StatusLabel } from '../ui/StatusLabel'
import { diffRows } from './diff'
import { DiffList } from './DiffList'
import { actionLabel, actionVerbs, editorPath, kindNouns, publicationBadge } from './publication'
import { ValidationPanel } from './ValidationPanel'

type Target = { kind: TargetKind; id: string; action: PublishAction; revisionId: string | null; label: string; updatedAt: string | null }

const areaLabels: Record<TargetKind, string> = {
  event: 'イベント',
  occurrence: 'オープンキャンパス',
  categories: 'イベント',
  spot: '地点',
  map: '地図',
}

const listPaths: Record<TargetKind, string> = {
  event: '/events',
  occurrence: '/open-campus',
  categories: '/events',
  spot: '/spots',
  map: '/map-data',
}

/**
 * 公開確認（Figma R01 `19:2`）と公開結果（R02〜R05）。イベント・開催回・カテゴリ一覧・Spotで共通に使う。
 * 開催回・カテゴリ・Spotの公開確認は Figma に無く、R01 の形を流用する（28 S4-6、2026-09-24 承認の構成案）。
 */
export function PublishReviewPage({ kind }: { kind: TargetKind }) {
  const params = useParams()
  const [search] = useSearchParams()
  const id = kind === 'categories' || kind === 'map' ? kind : kind === 'spot' ? (search.get('id') ?? '') : (params.id ?? '')
  const requested = search.get('action')
  const action: PublishAction = requested === 'withdraw' || requested === 'restore' ? requested : 'publish'
  // 復旧では戻す過去の版。公開では画面を開いた時点の現在の版。
  const restoreRevision = action === 'restore' ? search.get('revision') : null
  // 地図の公開では、公開する版（取り込んだ版）を URL で受け取る（地図には編集中の下書きが無い。決定事項31 D1）。
  const mapRevision = kind === 'map' && action === 'publish' ? search.get('revision') : null

  // 公開の画面にいる間は、対象の読み込み中・取得失敗でも公開向けの文言で期限切れを案内する（L05 の「保存してください」を出さない）。
  // 結果を待つ間の L07 は PublishFlow が上書きする。子の effect が先に走り、片付けも子が先なので、画面を離れたときだけ既定に戻る。
  const { setPurpose } = useSessionExpiry()
  useEffect(() => {
    setPurpose('publishReview')
    return () => setPurpose(null)
  }, [setPurpose])

  // 公開するのは保存済みの現在の版。確認画面を開いた時点の版に固定する（11 §5）。
  const target = useQuery({
    queryKey: ['publish-target', kind, id, mapRevision],
    queryFn: async (): Promise<Omit<Target, 'action'>> => {
      switch (kind) {
        case 'event': {
          const detail = await getEvent(id)
          return { kind, id, revisionId: detail.revisionId, label: detail.draft.title?.trim() || '無題のイベント', updatedAt: detail.updatedAt }
        }
        case 'occurrence': {
          const detail = await getOccurrence(id)
          return { kind, id, revisionId: detail.revisionId, label: detail.draft.name?.trim() || '無題の開催回', updatedAt: detail.updatedAt }
        }
        case 'categories': {
          const detail = await getCategories()
          return { kind, id, revisionId: detail.revisionId, label: 'カテゴリ一覧', updatedAt: detail.updatedAt }
        }
        case 'map':
          // 版の名前（地図 vN）は公開確認の応答の対象名で示す。
          return { kind, id, revisionId: mapRevision, label: '地図', updatedAt: null }
        default: {
          const detail = await getSpot(id)
          return { kind, id, revisionId: detail.revisionId, label: detail.draft.name?.trim() || id, updatedAt: detail.updatedAt }
        }
      }
    },
    enabled: Boolean(id),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  })

  if ((action === 'restore' && !restoreRevision) || (kind === 'map' && action === 'publish' && !mapRevision)) {
    return (
      <>
        <ReviewToolbar kind={kind} id={id} title={action === 'restore' ? '復旧確認' : '公開確認'} />
        <main className="min-h-0 flex-1 overflow-auto bg-canvas px-4 pt-[22px] pb-10 sm:px-6">
          <NoticeBanner tone="blocking" className="w-[784px] max-w-full">
            {action === 'restore'
              ? '戻す版が指定されていません。公開履歴から［この版に戻す］を選び直してください。'
              : '公開する地図の版が指定されていません。地図を取り込んだときに表示された公開確認の URL から開いてください。'}
          </NoticeBanner>
        </main>
      </>
    )
  }

  if (target.data)
    return (
      <PublishFlow
        key={`${kind}:${id}:${action}:${restoreRevision ?? ''}:${mapRevision ?? ''}`}
        target={{ ...target.data, action, revisionId: restoreRevision ?? target.data.revisionId }}
      />
    )

  return (
    <>
      <ReviewToolbar kind={kind} id={id} title={action === 'withdraw' ? '公開停止確認' : action === 'restore' ? '復旧確認' : '公開確認'} />
      <main className="min-h-0 flex-1 overflow-auto bg-canvas px-4 pt-[22px] pb-10 sm:px-6">
        <div className="flex w-[784px] max-w-full flex-col items-start gap-3">
          {target.isPending && id ? (
            <p role="status" className="text-[12px] leading-5 text-text-secondary">
              公開する対象を読み込んでいます
            </p>
          ) : (
            <NoticeBanner tone="blocking">
              公開する対象を取得できませんでした。
              <Button variant="secondary" size="sm" className="ml-3" onClick={() => void target.refetch()}>
                再試行
              </Button>
            </NoticeBanner>
          )}
        </div>
      </main>
    </>
  )
}

type Phase =
  | { type: 'review'; notice?: string }
  | { type: 'processing'; operationId: string }
  | { type: 'succeeded'; result: OperationResult }
  | { type: 'checking'; operationId: string; note?: string }
  | { type: 'failed'; title: string; detail: string; operationId?: string }

function PublishFlow({ target }: { target: Target }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>({ type: 'review' })
  // 公開の要求が応答を待っている間は、照会で記録が見つからなくても「届いていない」と決めつけない。
  const inflight = useRef(false)
  const entries: PublishEntry[] = [{ targetKind: target.kind, targetId: target.id, action: target.action, revisionId: target.action === 'withdraw' ? null : target.revisionId }]

  // 確認画面を開くたびに検証をやり直す（確認結果は公開時に照合する）。
  const preview = useQuery({
    queryKey: ['publish-preview', target.kind, target.id, target.action, target.revisionId],
    queryFn: () => previewPublish(entries),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const reference = useQuery({ queryKey: ['reference'], queryFn: getReference })
  const back = editorPath(target.kind, target.id)
  // ボタンは「公開をやめる」、結果や処理状況では「公開停止」を使う。
  const verb = target.action === 'withdraw' ? publicationBadge('withdrawn').label : actionVerbs[target.action]

  function settle(result: OperationResult) {
    // 公開状態は各画面で算出して表示している。成功・失敗にかかわらず取り直す。
    void queryClient.invalidateQueries()
    if (result.status === 'succeeded') setPhase({ type: 'succeeded', result })
    else if (result.status === 'failed') setPhase({ type: 'failed', title: `${verb}されませんでした`, detail: result.detail ?? `${verb}処理を完了できませんでした。`, operationId: result.operationId })
    else setPhase({ type: 'checking', operationId: result.operationId, note: 'サーバーではまだ処理中です。少し待ってから再確認してください。' })
  }

  async function run(current: PublishPreview) {
    const operationId = newId()
    setPhase({ type: 'processing', operationId })
    inflight.current = true
    try {
      const result = await publish(operationId, current.validation.entries, current.validation.id)
      inflight.current = false
      settle(result)
    } catch (error) {
      inflight.current = false
      if (error instanceof ApiError && (error.status === 409 || error.status === 422)) {
        // 確認後に変わった・公開阻止がある：古い確認結果では公開しない。最新の内容で確認し直す（11 RA-04）。
        await preview.refetch()
        setPhase({
          type: 'review',
          notice:
            error.status === 409
              ? '確認した後に内容が変わったため、公開しませんでした。最新の内容で確認し直しています。差分と検証結果を確認してください。'
              : `公開できない問題があるため、${verb}しませんでした。検証結果を確認してください。`,
        })
      } else if (error instanceof ApiError && error.status === 401) {
        // 期限切れは成功と表示しない。再ログイン後も自動で再実行しない（12 UI-04・UA-03）。
        setPhase({ type: 'failed', title: `${verb}されませんでした`, detail: `ログインの有効期限が切れたため、${verb}しませんでした。再ログインしてから、公開内容を確認し直してください。` })
      } else if (error instanceof ApiError && error.status < 500) {
        setPhase({ type: 'failed', title: `${verb}されませんでした`, detail: error.message })
      } else {
        // 応答が届かなかった：成功・失敗を推測せず、同じ操作IDで照会する（17 §4、RA-06）。
        setPhase({ type: 'checking', operationId })
      }
    }
  }

  // 期限切れのダイアログの文言を場面に合わせる。結果を待っている・照会している間は L07（105:3074）。
  const expiry = useSessionExpiry()
  const { setPurpose } = expiry
  const waitingForResult = phase.type === 'processing' || phase.type === 'checking'
  useEffect(() => {
    setPurpose(waitingForResult ? 'publishResult' : 'publishReview')
    // 公開の画面にいる間の既定（PublishReviewPage が登録）へ戻す。
    return () => setPurpose('publishReview')
  }, [setPurpose, waitingForResult])

  // 結果の照会中に再ログインしたら、同じ操作IDで照会し直す（L07「再ログイン後に操作IDから結果を確認します」）。
  // 照会は読み取りだけで、公開は自動で送り直さない（12 UI-04）。「戻る」で閉じた場合は照会しない。
  const latest = useRef({ phase, check: (_operationId: string) => Promise.resolve() })
  const seenResolved = useRef(expiry.resolvedCount)
  useEffect(() => {
    if (expiry.resolvedCount === seenResolved.current) return
    seenResolved.current = expiry.resolvedCount
    const current = latest.current.phase
    if (current.type === 'checking') void latest.current.check(current.operationId)
  }, [expiry.resolvedCount])

  async function check(operationId: string) {
    try {
      settle(await getOperation(operationId))
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && inflight.current) {
        setPhase({ type: 'checking', operationId, note: 'サーバーはまだこの操作を受け付けていません。少し待ってから再確認してください。' })
      } else if (error instanceof ApiError && error.status === 404) {
        setPhase({ type: 'failed', title: `${verb}されませんでした`, detail: `${verb}の操作はサーバーに届いていませんでした。公開内容は変わっていません。`, operationId })
      } else {
        setPhase({ type: 'checking', operationId, note: error instanceof NetworkError ? 'まだサーバーに接続できません。接続を確認してから再確認してください。' : '状態を取得できませんでした。再確認してください。' })
      }
    }
  }
  useEffect(() => {
    latest.current = { phase, check }
  })

  const title = phase.type === 'review' ? `${verb}確認` : phase.type === 'processing' ? `${verb}処理` : `${verb}結果`

  return (
    <>
      <ReviewToolbar kind={target.kind} id={target.id} label={target.label} title={title} />
      {phase.type === 'review' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas lg:flex-row lg:overflow-hidden">
          <main className="min-w-0 flex-1 px-6 pt-[22px] pb-10 lg:min-h-0 lg:overflow-y-auto">
            <div className="flex w-[776px] max-w-full flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[24px] leading-8 font-bold text-text-primary">
                  {target.action === 'restore'
                    ? `${kindNouns[target.kind]}を過去の版に戻す内容を確認`
                    : target.action === 'withdraw'
                      ? `${actionLabel(target.kind, target.action)}前に確認`
                      : `${kindNouns[target.kind]}${target.kind === 'categories' ? '' : '1件'}の公開内容を確認`}
                </h2>
                {preview.data?.items[0] && (
                  <StatusLabel tone={publicationBadge(preview.data.items[0].publication.state).tone}>
                    {publicationBadge(preview.data.items[0].publication.state).label}
                  </StatusLabel>
                )}
              </div>
              <p className="-mt-2 text-[12px] leading-5 text-text-secondary">
                {target.action === 'withdraw'
                  ? '公開を終了します。下書きの内容は公開せず、そのまま残ります。'
                  : target.action === 'restore'
                    ? '過去に公開した版を、現在の関連データと組み合わせて検証し、新しい公開として反映します。下書きもこの版の内容になります。'
                    : target.kind === 'event'
                      ? '確認した版だけを公開します。選んでいない下書きは公開しません。イベント内の日時・会場は、この1件全体で反映されます。'
                      : '確認した版だけを公開します。選んでいない下書きは公開しません。'}
              </p>
              {phase.notice && <NoticeBanner tone="warning">{phase.notice}</NoticeBanner>}
              {preview.isPending ? (
                <p role="status" className="text-[12px] leading-5 text-text-secondary">
                  公開候補を組み立てて検証しています
                </p>
              ) : preview.isError ? (
                <NoticeBanner tone="blocking">
                  公開内容を確認できませんでした。公開はしていません。
                  <Button variant="secondary" size="sm" className="ml-3" onClick={() => void preview.refetch()}>
                    再試行
                  </Button>
                </NoticeBanner>
              ) : (
                <ReviewContent
                  preview={preview.data}
                  updatedAt={target.updatedAt}
                  occurrenceNames={new Map((reference.data?.occurrences ?? []).map((o) => [o.id, o.name]))}
                />
              )}
            </div>
          </main>
          <ValidationPanel
            preview={preview.data}
            loading={preview.isPending || preview.isFetching}
            failed={preview.isError}
            kind={target.kind}
            action={target.action}
            submitLabel={actionLabel(target.kind, target.action)}
            onSubmit={() => preview.data && void run(preview.data)}
            onBack={() => void navigate(back)}
          />
        </div>
      ) : (
        <main className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-canvas px-6 py-16">
          <ResultCard
            phase={phase}
            target={target}
            verb={verb}
            onCheck={check}
            onReview={() => {
              setPhase({ type: 'review' })
              void preview.refetch()
            }}
          />
        </main>
      )}
    </>
  )
}

function ReviewContent({
  preview,
  updatedAt,
  occurrenceNames,
}: {
  preview: PublishPreview
  updatedAt: string | null
  occurrenceNames: Map<string, string>
}) {
  const item = preview.items[0]
  const rows = diffRows(item, preview.published, preview.candidate, { occurrences: occurrenceNames })
  const stashes = item.action === 'restore' && item.currentRevisionId !== item.publication.publishedRevisionId
  return (
    <>
      {stashes && (
        <NoticeBanner tone="warning">
          未公開の下書きがあります。復旧の前にその下書きを退避し、公開履歴から内容を確認できるようにします。下書きは戻す版の内容に置き換わります。
        </NoticeBanner>
      )}
      <dl className="divide-y divide-border-subtle border-y border-border-subtle text-[12px] leading-5">
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3">
          <dt className="text-text-secondary">
            {item.action === 'withdraw' ? '公開をやめる対象' : item.action === 'restore' ? '復旧対象' : '公開する対象'}
          </dt>
          <dd className="min-w-0 break-words">
            <span className="font-bold text-text-primary">{item.label}</span>
            <span className="ml-2 text-text-secondary">
              {item.targetKind === 'event' ? 'イベント1件・全日時・全会場' : kindNouns[item.targetKind as TargetKind]}
            </span>
          </dd>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3">
          <dt className="text-text-secondary">{item.action === 'restore' ? '戻す版' : '公開する版'}</dt>
          <dd className="min-w-0 break-words text-text-primary">
            {item.action === 'withdraw' ? (
              '—'
            ) : item.action === 'publish' && item.targetKind !== 'map' ? (
              <>
                <span>保存済み下書き{updatedAt ? `（${dateTime.format(new Date(updatedAt))} 保存）` : ''}</span>
                {item.revisionId && (
                  <span title={item.revisionId} className="ml-2 font-mono text-[11px] text-text-muted">
                    {item.revisionId.slice(-8)}
                  </span>
                )}
              </>
            ) : item.revisionId ? (
              <span title={item.revisionId} className="font-mono text-[11px] text-text-primary">
                {item.revisionId.slice(-8)}
              </span>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3">
          <dt className="text-text-secondary">公開中の版</dt>
          <dd className="min-w-0 break-words">
            {item.publication.publishedRevisionId ? (
              <>
                {item.publication.publishedAt && (
                  <span className="mr-2 text-text-primary">{dateTime.format(new Date(item.publication.publishedAt))} 公開</span>
                )}
                <span title={item.publication.publishedRevisionId} className="font-mono text-[11px] text-text-muted">
                  {item.publication.publishedRevisionId.slice(-8)}
                </span>
              </>
            ) : (
              <span className="text-text-secondary">なし</span>
            )}
          </dd>
        </div>
      </dl>
      <section aria-labelledby="diff-heading" className="pt-2">
        <h3 id="diff-heading" className="text-[14px] leading-5 font-bold text-text-primary">
          公開中との差分{' '}
          {rows.length > 0 && <span className="ml-2 font-normal text-text-secondary">{rows.length}項目が変わります</span>}
        </h3>
        <DiffList rows={rows} after={item.action === 'restore' ? '戻す版' : '公開候補'} />
      </section>
    </>
  )
}

const returnTo: Record<TargetKind, (id: string) => { path: string; label: string }> = {
  event: () => ({ path: '/events', label: 'イベント一覧に戻る' }),
  occurrence: () => ({ path: '/open-campus', label: 'オープンキャンパスに戻る' }),
  categories: () => ({ path: '/events/categories', label: 'カテゴリ管理に戻る' }),
  spot: (id) => ({ path: `/spots?id=${encodeURIComponent(id)}`, label: '地点一覧に戻る' }),
  map: () => ({ path: '/releases?targetKind=map', label: '公開履歴に戻る' }),
}

const dateTime = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

function ResultCard({
  phase,
  target,
  verb,
  onCheck,
  onReview,
}: {
  phase: Exclude<Phase, { type: 'review' }>
  target: Target
  verb: string
  onCheck: (operationId: string) => Promise<void>
  onReview: () => void
}) {
  const [checking, setChecking] = useState(false)
  const noun = kindNouns[target.kind]

  async function check(operationId: string) {
    setChecking(true)
    try {
      await onCheck(operationId)
    } finally {
      setChecking(false)
    }
  }

  return (
    <section aria-live="polite" className="flex w-full max-w-[560px] flex-col gap-4">
      {phase.type === 'processing' && (
        <>
          <StatusLabel className="self-start">{verb}処理中</StatusLabel>
          <h2 className="text-[24px] leading-8 font-bold text-text-primary">
            {noun}
            {target.kind === 'categories' ? '' : '1件'}を{verb}しています
          </h2>
          <p className="text-[12px] leading-5 text-text-secondary">
            確認した候補を一度だけ反映しています。画面を閉じても処理は継続し、操作IDから結果を確認できます。
          </p>
          <dl className="divide-y divide-border-subtle border-y border-border-subtle text-[12px] leading-5">
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3">
              <dt className="text-text-secondary">対象</dt>
              <dd className="min-w-0 break-words">
                <span className="font-bold text-text-primary">{target.label}</span>
                <span className="ml-2 text-text-secondary">
                  {target.kind === 'event' ? 'イベント1件・全日時・全会場' : kindNouns[target.kind]}
                </span>
              </dd>
            </div>
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3">
              <dt className="text-text-secondary">操作ID</dt>
              <dd className="font-mono break-all text-text-primary">{phase.operationId}</dd>
            </div>
          </dl>
          <Button className="self-start px-4" disabled={checking} onClick={() => void check(phase.operationId)}>
            {checking ? '確認中…' : `${verb}結果を確認`}
          </Button>
        </>
      )}

      {phase.type === 'succeeded' && (
        <>
          <StatusLabel tone="success" className="self-start">
            {verb}しました
          </StatusLabel>
          <h2 className="text-[24px] leading-8 font-bold text-text-primary">
            {noun}を{verb}しました
          </h2>
          <p className="text-[12px] leading-5 text-text-secondary">
            {target.action === 'withdraw'
              ? 'サーバー側で公開を終了した版が確定しました。下書きは残っています。'
              : target.action === 'restore'
                ? '過去の版を新しい公開として確定しました。退避した下書きは公開履歴から確認できます。'
                : 'サーバー側で整合した公開版が確定し、取得できる状態になりました。'}
          </p>
          <dl className="divide-y divide-border-subtle border-y border-border-subtle text-[12px] leading-5">
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3">
              <dt className="text-text-secondary">対象</dt>
              <dd className="font-bold break-words text-text-primary">
                {phase.result.release?.entries.map((e) => e.label).join('、') ?? target.label}
              </dd>
            </div>
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3">
              <dt className="text-text-secondary">新しい公開版</dt>
              <dd className="font-bold text-text-primary">{phase.result.release ? `第${phase.result.release.sequence}版` : '—'}</dd>
            </div>
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3">
              <dt className="text-text-secondary">{verb}日時</dt>
              <dd className="text-text-primary">{phase.result.release ? `${dateTime.format(new Date(phase.result.release.createdAt))} JST` : '—'}</dd>
            </div>
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3">
              <dt className="text-text-secondary">操作ID</dt>
              <dd className="font-mono break-all text-text-primary">{phase.result.operationId}</dd>
            </div>
          </dl>
          <div className="flex flex-col gap-1 rounded-md bg-warning-subtle px-3.5 py-3">
            <p className="text-[13px] leading-[21px] font-bold text-warning">全iOS端末への反映完了を意味しません</p>
            <p className="text-[11px] leading-[19px] text-text-secondary">
              端末は次回の更新取得時に新しい公開版を検証して切り替えます。オフライン端末は直前の保存版を使用する場合があります。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={returnTo[target.kind](target.id).path}
              className="inline-flex h-9 items-center justify-center rounded-md bg-brand px-4 text-[13px] leading-[19px] font-bold text-canvas transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {returnTo[target.kind](target.id).label}
            </Link>
            <Link
              to={`/releases?id=${phase.result.release?.releaseId ?? ''}`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-canvas px-4 text-[13px] leading-[19px] font-normal text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              公開履歴を見る
            </Link>
          </div>
        </>
      )}

      {phase.type === 'checking' && (
        <>
          <StatusLabel tone="warning" className="self-start">
            結果確認中
          </StatusLabel>
          <h2 className="text-[24px] leading-8 font-bold text-text-primary">{verb}結果を確認しています</h2>
          <p className="text-[12px] leading-5 text-text-secondary">
            {verb}処理中に通信が切断されました。成功・失敗を推測せず、同じ操作IDでサーバーの実際の状態を照会します。
          </p>
          <div className="flex w-full flex-col gap-1.5 rounded-md border border-border-subtle bg-surface-subtle px-3.5 py-3">
            <p className="text-[13px] leading-[21px] font-bold text-text-primary">確認できていること</p>
            <ul className="text-[11px] leading-[19px] text-text-secondary">
              <li>
                ・操作ID：<span className="font-mono break-all">{phase.operationId}</span>
              </li>
              <li>・再確認しても新しい公開を作りません</li>
              <li>・結果が確定するまで成功とは表示しません</li>
            </ul>
          </div>
          {phase.note && <p className="text-[11px] leading-[19px] text-warning">{phase.note}</p>}
          <Button className="self-start px-4" disabled={checking} onClick={() => void check(phase.operationId)}>
            {checking ? '確認中…' : '状態を再確認'}
          </Button>
        </>
      )}

      {phase.type === 'failed' && (
        <>
          <StatusLabel tone="danger" className="self-start">
            {verb}されませんでした
          </StatusLabel>
          <h2 className="text-[24px] leading-8 font-bold text-text-primary">
            {noun}は{phase.title}
          </h2>
          <p className="text-[12px] leading-5 text-text-secondary">一部だけ反映された状態はなく、直前の公開版を維持しています。</p>
          <dl className="divide-y divide-border-subtle border-y border-border-subtle text-[12px]">
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3">
              <dt className="text-text-secondary">現在の公開版</dt>
              <dd>
                <StatusLabel tone="success">直前の公開版を継続</StatusLabel>
              </dd>
            </div>
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3">
              <dt className="text-text-secondary">下書き</dt>
              <dd className="break-words">{target.label}の保存済み下書きは残っています</dd>
            </div>
          </dl>
          <div role="alert" className="flex flex-col gap-1 rounded-md border border-danger-border bg-danger-subtle px-3.5 py-3">
            <p className="text-[13px] leading-[21px] font-bold text-danger">{phase.detail}</p>
            {phase.operationId && (
              <p className="text-[11px] leading-[19px] text-text-secondary">
                操作ID：<span className="font-mono break-all">{phase.operationId}</span>
              </p>
            )}
          </div>
          <Button className="self-start px-4" onClick={onReview}>
            公開確認へ戻る
          </Button>
        </>
      )}
    </section>
  )
}

function ReviewToolbar({ kind, id, label, title }: { kind: TargetKind; id: string; label?: string; title: string }) {
  const linkClass =
    'inline-flex items-center gap-1 rounded-sm hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
  return (
    <Toolbar
      className="flex-wrap"
      title={title}
      leading={
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-[13px] leading-5 text-text-secondary">
          <Link className={linkClass} to={listPaths[kind]}>
            <ChevronLeft aria-hidden size={15} strokeWidth={1.75} />
            {areaLabels[kind]}
          </Link>
          <span aria-hidden className="text-text-muted">
            /
          </span>
          {kind === 'categories' ? (
            <>
              <Link className={linkClass} to="/events/categories">
                カテゴリ管理
              </Link>
              <span aria-hidden className="text-text-muted">
                /
              </span>
            </>
          ) : (
            label &&
            kind !== 'map' &&
            id && (
              <>
                <Link className={`${linkClass} max-w-[160px] truncate`} to={editorPath(kind, id)}>
                  {label}
                </Link>
                <span aria-hidden className="text-text-muted">
                  /
                </span>
              </>
            )
          )}
        </div>
      }
    />
  )
}
