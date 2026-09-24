import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { getCategories } from '../api/categories'
import { ApiError, NetworkError } from '../api/client'
import { getEvent } from '../api/events'
import { getOccurrence } from '../api/occurrences'
import { getReference } from '../api/reference'
import { getOperation, previewPublish, publish, type OperationResult, type PublishAction, type PublishEntry, type PublishPreview, type TargetKind } from '../api/releases'
import { getSpot } from '../api/spots'
import { newId } from '../events/model'
import { Toolbar } from '../shell/Toolbar'
import { Button } from '../ui/Button'
import { NoticeBanner } from '../ui/NoticeBanner'
import { StatusBadge } from '../ui/StatusBadge'
import { cn } from '../ui/cn'
import { diffRows } from './diff'
import { DiffList } from './DiffList'
import { actionLabel, actionVerbs, editorPath, kindNouns, publicationBadge } from './publication'
import { ValidationPanel } from './ValidationPanel'

type Target = { kind: TargetKind; id: string; action: PublishAction; revisionId: string | null; label: string }

const areaLabels: Record<TargetKind, string> = { event: 'Events', occurrence: 'Open Campus', categories: 'Events / カテゴリ', spot: 'Spots' }

/**
 * 公開確認（Figma R01 `19:2`）と公開結果（R02〜R05）。イベント・開催回・カテゴリ一覧・Spotで共通に使う。
 * 開催回・カテゴリ・Spotの公開確認は Figma に無く、R01 の形を流用する（28 S4-6、2026-09-24 承認の構成案）。
 */
export function PublishReviewPage({ kind }: { kind: TargetKind }) {
  const params = useParams()
  const [search] = useSearchParams()
  const id = kind === 'categories' ? 'categories' : kind === 'spot' ? (search.get('id') ?? '') : (params.id ?? '')
  const requested = search.get('action')
  const action: PublishAction = requested === 'withdraw' || requested === 'restore' ? requested : 'publish'
  // 復旧では戻す過去の版。公開では画面を開いた時点の現在の版。
  const restoreRevision = action === 'restore' ? search.get('revision') : null

  // 公開するのは保存済みの現在の版。確認画面を開いた時点の版に固定する（11 §5）。
  const target = useQuery({
    queryKey: ['publish-target', kind, id],
    queryFn: async (): Promise<Omit<Target, 'action'>> => {
      switch (kind) {
        case 'event': {
          const detail = await getEvent(id)
          return { kind, id, revisionId: detail.revisionId, label: detail.draft.title?.trim() || '無題のイベント' }
        }
        case 'occurrence': {
          const detail = await getOccurrence(id)
          return { kind, id, revisionId: detail.revisionId, label: detail.draft.name?.trim() || '無題の開催回' }
        }
        case 'categories': {
          const detail = await getCategories()
          return { kind, id, revisionId: detail.revisionId, label: 'カテゴリ一覧' }
        }
        default: {
          const detail = await getSpot(id)
          return { kind, id, revisionId: detail.revisionId, label: detail.draft.name?.trim() || id }
        }
      }
    },
    enabled: Boolean(id),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  })

  if (action === 'restore' && !restoreRevision) {
    return (
      <>
        <Toolbar title={`${areaLabels[kind]} / 復旧確認`} />
        <main className="min-h-0 flex-1 overflow-auto px-6 pt-[22px] pb-10">
          <NoticeBanner tone="blocking" className="w-[784px] max-w-full">
            戻す版が指定されていません。Releases の履歴から［この版に戻す］を選び直してください。
          </NoticeBanner>
        </main>
      </>
    )
  }

  if (target.data)
    return (
      <PublishFlow
        key={`${kind}:${id}:${action}:${restoreRevision ?? ''}`}
        target={{ ...target.data, action, revisionId: restoreRevision ?? target.data.revisionId }}
      />
    )

  return (
    <>
      <Toolbar title={`${areaLabels[kind]} / 公開確認`} />
      <main className="min-h-0 flex-1 overflow-auto px-6 pt-[22px] pb-10">
        <div className="flex w-[784px] max-w-full flex-col items-start gap-3">
          {target.isPending && id ? (
            <p role="status" className="text-[12px] leading-5 text-text-secondary">
              公開する対象を読み込んでいます
            </p>
          ) : (
            <NoticeBanner tone="blocking">公開する対象を取得できませんでした。編集画面から開き直してください。</NoticeBanner>
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
  const verb = actionVerbs[target.action]

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

  const title = `${areaLabels[target.kind]} / ${target.label} / ${phase.type === 'review' ? `${verb}確認` : phase.type === 'processing' ? `${verb}処理` : `${verb}結果`}`
  const subtitle =
    phase.type === 'review'
      ? `${target.label}・保存済みの版`
      : phase.type === 'processing'
        ? '確認した候補を反映しています'
        : phase.type === 'succeeded'
          ? 'サーバー側の公開版を確定しました'
          : phase.type === 'checking'
            ? '結果が分からないため実際の状態を照会します'
            : '公開内容は変更されていません'

  return (
    <>
      <Toolbar title={title} subtitle={subtitle} />
      {phase.type === 'review' ? (
        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 flex-1 overflow-auto px-6 pt-[22px] pb-10">
            <div className="flex w-[776px] max-w-full flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[24px] leading-8 font-bold text-text-primary">
                  {target.action === 'restore'
                    ? `${kindNouns[target.kind]}を過去の版に戻す内容を確認`
                    : `${kindNouns[target.kind]}${target.kind === 'categories' ? '' : '1件'}の${verb}内容を確認`}
                </h2>
                <StatusBadge tone="success">保存済み下書き</StatusBadge>
              </div>
              <p className="-mt-2 text-[12px] leading-5 text-text-secondary">
                {target.action === 'withdraw'
                  ? '公開を終了します。下書きの内容は公開せず、そのまま残ります。'
                  : target.action === 'restore'
                    ? '過去に公開した版を、現在の関連データと組み合わせて検証し、新しい公開として反映します。下書きもこの版の内容になります。'
                    : target.kind === 'event'
                    ? '確認した版だけを公開します。イベント内の開催枠・会場は一件全体で反映されます。'
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
                  <Button variant="secondary" className="ml-3" onClick={() => void preview.refetch()}>
                    再試行
                  </Button>
                </NoticeBanner>
              ) : (
                <ReviewContent preview={preview.data} occurrenceNames={new Map((reference.data?.occurrences ?? []).map((o) => [o.id, o.name]))} />
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
        <main className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-6 py-10">
          <ResultCard phase={phase} target={target} verb={verb} onCheck={check} onReview={() => { setPhase({ type: 'review' }); void preview.refetch() }} />
        </main>
      )}
    </>
  )
}

function ReviewContent({ preview, occurrenceNames }: { preview: PublishPreview; occurrenceNames: Map<string, string> }) {
  const item = preview.items[0]
  const rows = diffRows(item, preview.published, preview.candidate, { occurrences: occurrenceNames })
  const status = publicationBadge(item.publication.state)
  const stashes = item.action === 'restore' && item.currentRevisionId !== item.publication.publishedRevisionId
  return (
    <>
      {stashes && (
        <NoticeBanner tone="warning">
          未公開の下書きがあります。復旧の前にその下書きを退避し、Releases の履歴から内容を確認できるようにします。下書きは戻す版の内容に置き換わります。
        </NoticeBanner>
      )}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-4">
        <p className="text-[11px] leading-[19px] text-text-secondary">{item.action === 'withdraw' ? '取り下げ対象' : item.action === 'restore' ? '復旧対象' : '公開対象'}</p>
        <p className="text-[16px] leading-6 font-bold break-words text-text-primary">{item.label}</p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge>{item.targetKind === 'event' ? 'イベント1件' : kindNouns[item.targetKind as TargetKind]}</StatusBadge>
          {item.targetKind === 'event' && <StatusBadge>全開催枠・全会場</StatusBadge>}
          <StatusBadge tone={status.tone}>現在：{status.label}</StatusBadge>
        </div>
        <p className="text-[11px] leading-[19px] text-text-secondary">
          {item.revisionId ? `${item.action === 'restore' ? '戻す版' : '対象の版'}：${item.revisionId.slice(-8)}　` : ''}
          {item.publication.publishedRevisionId ? `公開中の版：${item.publication.publishedRevisionId.slice(-8)}` : '公開中の版：なし'}
        </p>
      </section>

      <section aria-labelledby="diff-heading" className="flex flex-col rounded-lg border border-border bg-surface px-4 py-4">
        <h3 id="diff-heading" className="text-[16px] leading-6 font-bold text-text-primary">
          公開中との差分
        </h3>
        <DiffList rows={rows} after={item.action === 'restore' ? '戻す版' : '公開候補'} />
      </section>
    </>
  )
}

const returnTo: Record<TargetKind, (id: string) => { path: string; label: string }> = {
  event: () => ({ path: '/events', label: 'Eventsへ戻る' }),
  occurrence: () => ({ path: '/open-campus', label: 'Open Campusへ戻る' }),
  categories: () => ({ path: '/events/categories', label: 'カテゴリへ戻る' }),
  spot: (id) => ({ path: `/spots?id=${encodeURIComponent(id)}`, label: 'Spotsへ戻る' }),
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
  const border = phase.type === 'failed' ? 'border-danger' : phase.type === 'checking' ? 'border-warning' : 'border-border'

  async function check(operationId: string) {
    setChecking(true)
    try {
      await onCheck(operationId)
    } finally {
      setChecking(false)
    }
  }

  return (
    <section aria-live="polite" className={cn('flex w-[620px] max-w-full flex-col gap-4 rounded-xl border bg-surface px-8 py-8', border)}>
      {phase.type === 'processing' && (
        <>
          <StatusBadge className="self-start">{verb}処理中</StatusBadge>
          <h2 className="text-[24px] leading-8 font-bold text-text-primary">
            {noun}
            {target.kind === 'categories' ? '' : '1件'}を{verb}しています
          </h2>
          <p className="text-[12px] leading-5 text-text-secondary">確認した候補を一度だけ反映しています。画面を閉じても処理は継続し、操作IDから結果を確認できます。</p>
          <p className="text-[11px] leading-[19px] text-text-secondary">操作ID：{phase.operationId}</p>
          <Button className="w-[240px]" disabled={checking} onClick={() => void check(phase.operationId)}>
            {checking ? '確認中…' : `${verb}結果を確認`}
          </Button>
        </>
      )}

      {phase.type === 'succeeded' && (
        <>
          <StatusBadge tone="success" className="self-start">
            {verb}成功
          </StatusBadge>
          <h2 className="text-[24px] leading-8 font-bold text-text-primary">
            {noun}を{verb}しました
          </h2>
          <p className="text-[12px] leading-5 text-text-secondary">
            {target.action === 'withdraw'
              ? 'サーバー側で公開を終了した版が確定しました。下書きは残っています。'
              : target.action === 'restore'
                ? '過去の版を新しい公開として確定しました。退避した下書きは Release詳細から確認できます。'
                : 'サーバー側で整合した公開版が確定し、取得できる状態になりました。'}
          </p>
          <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 rounded-lg bg-surface-subtle px-3.5 py-3.5 text-[12px] leading-5">
            <dt className="text-text-secondary">対象</dt>
            <dd className="font-medium break-words text-text-primary">{phase.result.release?.entries.map((e) => e.label).join('、') ?? target.label}</dd>
            <dt className="text-text-secondary">新しい公開版</dt>
            <dd className="text-text-primary">Release #{phase.result.release?.sequence}</dd>
            <dt className="text-text-secondary">{verb}日時</dt>
            <dd className="text-text-primary">{phase.result.release ? `${dateTime.format(new Date(phase.result.release.createdAt))} JST` : '—'}</dd>
          </dl>
          <div className="flex flex-col gap-1 rounded-lg border border-warning px-3.5 py-3">
            <StatusBadge className="self-start">端末への反映は別状態</StatusBadge>
            <p className="text-[13px] leading-[21px] font-bold text-text-primary">全iOS端末への反映完了を意味しません</p>
            <p className="text-[11px] leading-[19px] text-text-secondary">端末は次回の更新取得時に新しいReleaseを検証して切り替えます。オフライン端末は直前の保存版を使用する場合があります。</p>
          </div>
          <div className="flex gap-2">
            <Link
              to={returnTo[target.kind](target.id).path}
              className="flex h-10 w-[184px] items-center justify-center rounded-lg bg-brand text-[14px] leading-[22px] font-medium text-surface hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {returnTo[target.kind](target.id).label}
            </Link>
            <Link
              to={`/releases?id=${phase.result.release?.releaseId ?? ''}`}
              className="flex h-10 w-[184px] items-center justify-center rounded-lg border border-border bg-surface text-[14px] leading-[22px] font-medium text-text-primary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Release詳細を見る
            </Link>
          </div>
        </>
      )}

      {phase.type === 'checking' && (
        <>
          <StatusBadge className="self-start">結果確認中</StatusBadge>
          <h2 className="text-[24px] leading-8 font-bold text-text-primary">{verb}結果を確認しています</h2>
          <p className="text-[12px] leading-5 text-text-secondary">{verb}処理中に通信が切断されました。成功・失敗を推測せず、同じ操作IDでサーバーの実際の状態を照会します。</p>
          <div className="flex flex-col gap-1.5 self-start rounded-lg bg-surface-subtle px-3.5 py-3">
            <p className="text-[13px] leading-[21px] font-bold text-text-primary">確認できていること</p>
            <ul className="text-[11px] leading-[19px] text-text-secondary">
              <li>・操作ID：{phase.operationId}</li>
              <li>・再確認しても新しい公開を作りません</li>
              <li>・結果が確定するまで成功とは表示しません</li>
            </ul>
          </div>
          {phase.note && <p className="text-[11px] leading-[19px] text-warning">{phase.note}</p>}
          <Button className="w-[200px]" disabled={checking} onClick={() => void check(phase.operationId)}>
            {checking ? '確認中…' : '状態を再確認'}
          </Button>
        </>
      )}

      {phase.type === 'failed' && (
        <>
          <StatusBadge tone="danger" className="self-start">
            未反映の失敗
          </StatusBadge>
          <h2 className="text-[24px] leading-8 font-bold text-text-primary">
            {noun}は{phase.title}
          </h2>
          <p className="text-[12px] leading-5 text-text-secondary">一部だけ反映された状態はなく、直前の公開版を維持しています。</p>
          <div className="flex flex-col gap-1 rounded-lg bg-surface-subtle px-3.5 py-3">
            <p className="text-[11px] leading-[19px] text-text-secondary">現在の公開版</p>
            <p className="text-[14px] leading-[22px] font-bold text-success">直前の公開版を継続</p>
            <p className="text-[11px] leading-[19px] text-text-secondary">{target.label}の保存済み下書きは残っています。</p>
          </div>
          <div role="alert" className="flex flex-col gap-1 rounded-lg border border-danger px-3.5 py-3">
            <p className="text-[13px] leading-[21px] font-medium text-danger">{phase.detail}</p>
            {phase.operationId && <p className="text-[11px] leading-[19px] text-text-secondary">操作ID：{phase.operationId}</p>}
          </div>
          <Button className="w-[200px]" onClick={onReview}>
            公開確認へ戻る
          </Button>
        </>
      )}
    </section>
  )
}
