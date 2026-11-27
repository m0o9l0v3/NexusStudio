import { skipToken, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ApiError } from '../../api/client'
import { getLog, listLogs, type LogItem } from '../../api/logs'
import type { TargetKind } from '../../api/releases'
import { editorPath, kindNouns, normalizePublicationTerms } from '../../publishing/publication'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { SelectField } from '../../ui/Field'
import { StaleListNotice } from '../../ui/StaleListNotice'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusLabel, type StatusTone } from '../../ui/StatusLabel'
import { useStackedDetailFocus } from '../../ui/useStackedDetailFocus'

const dateTime = new Intl.DateTimeFormat('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Tokyo' })
const fullDateTime = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Tokyo' })

const actionLabels: Record<string, string> = {
  save: '下書き保存',
  publish: '公開操作',
  import: '参照データの取り込み',
  signIn: 'ログイン',
  signInFailed: 'ログイン失敗',
  signOut: 'ログアウト',
}

const statusLabels: Record<string, { label: string; tone: StatusTone }> = {
  succeeded: { label: '成功', tone: 'success' },
  failed: { label: '失敗', tone: 'danger' },
  processing: { label: '処理中', tone: 'warning' },
}

const metadataRow = 'grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[120px_1fr] sm:gap-x-4'

function normalizeDetail(detail: string): string { return normalizePublicationTerms(detail, '公開をやめる') }

function actionText(item: LogItem): string {
  // 公開操作は、公開・取り下げ・復旧のどれかを補足に持つ。
  if (item.action === 'publish' && item.detail && item.status === 'succeeded') return normalizeDetail(item.detail)
  return actionLabels[item.action] ?? item.action
}

/**
 * Logs（12 UI-18・UI-19、28 S4-8、Figma LG01）。
 * 誰が・いつ・何をしたか。公開の行からは対応する Release へ移動できる。
 */
export function LogsPage() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')
  const filters = {
    action: params.get('action') ?? '',
    status: params.get('status') ?? '',
    actorId: params.get('actorId') ?? '',
    targetKind: params.get('targetKind') ?? '',
    date: params.get('date') ?? '',
  }
  const filtered = Object.values(filters).some(Boolean)

  const logs = useInfiniteQuery({
    queryKey: ['logs', filters],
    queryFn: ({ pageParam }) => listLogs({ ...filters, offset: pageParam }),
    initialPageParam: null as number | null,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
  })
  const [lastSuccess, setLastSuccess] = useState<{ data: NonNullable<typeof logs.data>; query: typeof filters; updatedAt: number } | null>(null)
  const [actorNames, setActorNames] = useState(new Map<string, string>())
  const queryChanged = !!lastSuccess && JSON.stringify(lastSuccess.query) !== JSON.stringify(filters)
  if (logs.isSuccess && (!lastSuccess || lastSuccess.data !== logs.data || lastSuccess.updatedAt !== logs.dataUpdatedAt || queryChanged)) {
    setLastSuccess({ data: logs.data, query: filters, updatedAt: logs.dataUpdatedAt })
    const names = new Map(actorNames)
    for (const page of logs.data.pages) {
      for (const { id, displayName } of page.actors) {
        if (displayName.trim()) names.set(id, displayName)
      }
    }
    setActorNames(names)
  }
  const items = lastSuccess?.data.pages.flatMap((page) => page.items) ?? []
  const actors = lastSuccess?.data.pages[0]?.actors ?? []
  const listed = items.find((item) => item.id === selectedId)
  const detail = useQuery({ queryKey: ['log', selectedId], queryFn: selectedId && !listed ? () => getLog(selectedId) : skipToken })
  const selectedLog = listed ?? detail.data
  const { listRef, detailRef, requestDetailFocus, returnToList } = useStackedDetailFocus(selectedId, !!selectedLog)
  const actorName = (id: string) => actorNames.get(id) ?? '指定した管理者'
  const describe = (q: typeof filters) => [
    q.action && `操作：${actionLabels[q.action] ?? '指定の操作'}`,
    q.status && `結果：${statusLabels[q.status]?.label ?? '指定の結果'}`,
    q.actorId && `管理者：${actorName(q.actorId)}`,
    q.targetKind && `対象：${kindNouns[q.targetKind as TargetKind] ?? '指定の種類'}`,
    q.date && `日付：${q.date}`,
  ].filter(Boolean).join('／') || '絞り込みなし'

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <>
      <Toolbar title="操作記録" subtitle="保存・公開・ログインの記録" headingClassName="sm:flex-row sm:items-baseline sm:gap-2" />
      <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas max-lg:[container-type:size]">
        <div className="flex min-h-full min-w-0 flex-col lg:flex-row">
          <section ref={listRef} aria-label="操作記録" className="flex w-full min-w-0 shrink-0 flex-col gap-2 border-b border-border-subtle p-4 lg:w-[440px] xl:w-[460px] lg:border-r lg:border-b-0">
            <h2 tabIndex={-1} className="text-[13px] leading-[18px] font-bold text-text-primary">操作記録</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2">
              <SelectField label="操作" controlSize="sm" className="min-w-0 [&>label]:sr-only [&_select]:text-[12px]" value={filters.action} onChange={(event) => update('action', event.target.value)}>
                <option value="">操作：すべて</option>
                {Object.entries(actionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    操作：{label}
                  </option>
                ))}
              </SelectField>
              <SelectField label="結果" controlSize="sm" className="min-w-0 [&>label]:sr-only [&_select]:text-[12px]" value={filters.status} onChange={(event) => update('status', event.target.value)}>
                <option value="">結果：すべて</option>
                {Object.entries(statusLabels).map(([value, { label }]) => <option key={value} value={value}>結果：{label}</option>)}
              </SelectField>
              <SelectField label="管理者" controlSize="sm" className="min-w-0 [&>label]:sr-only [&_select]:text-[12px]" value={filters.actorId} onChange={(event) => update('actorId', event.target.value)}>
                <option value="">管理者：すべて</option>
                {filters.actorId && !actors.some((actor) => actor.id === filters.actorId) && <option value={filters.actorId}>管理者：{actorName(filters.actorId)}</option>}
                {actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    管理者：{actorName(actor.id)}
                  </option>
                ))}
              </SelectField>
              <SelectField label="対象" controlSize="sm" className="min-w-0 [&>label]:sr-only [&_select]:text-[12px]" value={filters.targetKind} onChange={(event) => update('targetKind', event.target.value)}>
                <option value="">対象：すべて</option>
                <option value="event">対象：イベント</option>
                <option value="occurrence">対象：開催回</option>
                <option value="categories">対象：カテゴリ一覧</option>
                <option value="spot">対象：地点</option>
                <option value="map">対象：地図</option>
              </SelectField>
              <label className={cn(
                'flex h-[30px] min-w-0 items-center rounded-md border px-2.5 text-[12px] leading-[19px] focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand',
                filters.date ? 'border-brand bg-brand-subtle text-brand' : 'border-border-input bg-canvas text-text-secondary',
              )}>
                <span className="shrink-0">日付：</span>
                <input
                  type="date"
                  value={filters.date}
                  onChange={(event) => update('date', event.target.value)}
                  className="min-w-0 flex-1 bg-transparent tabular-nums outline-none"
                />
              </label>
            </div>

            {filtered && <Button variant="secondary" size="sm" className="self-start" onClick={() => { const next = new URLSearchParams(params); Object.keys(filters).forEach((key) => next.delete(key)); setParams(next, { replace: true }) }}>絞り込みを解除</Button>}
            {logs.isError && !logs.isFetchNextPageError && lastSuccess && <StaleListNotice listName="操作記録" updatedAt={lastSuccess.updatedAt} conditions={{ failed: describe(filters), shown: describe(lastSuccess.query) }} onRetry={() => void logs.refetch()} />}
            {lastSuccess && queryChanged && logs.isFetching && !logs.isError && (
              <p role="status" className="wrap-anywhere text-[12px] leading-5 text-text-secondary">
                絞り込み条件（{describe(filters)}）を読み込んでいます。下の件数・一覧は前の条件（{describe(lastSuccess.query)}）の結果です。
              </p>
            )}
            {lastSuccess && <p className="text-[11px] tabular-nums">{items.length}件表示</p>}
            {!lastSuccess && logs.isPending ? (
              <p role="status" className="text-[12px] leading-5 text-text-secondary">
                操作記録を読み込んでいます
              </p>
            ) : !lastSuccess ? (
              <NoticeBanner tone="blocking">
                操作記録を取得できませんでした。0件とは扱わず、再試行してください。
                <Button variant="secondary" className="ml-3" onClick={() => void logs.refetch()}>
                  再試行
                </Button>
              </NoticeBanner>
            ) : items.length === 0 ? (
              <NoticeBanner>{Object.values(lastSuccess.query).some(Boolean) ? '条件に一致する記録はありません。' : '操作記録は正式に0件です。'}</NoticeBanner>
            ) : (
              <ul className="divide-y divide-border-subtle border-y border-border-subtle">
                {items.map((item) => {
                  const selected = item.id === selectedId
                  const status = statusLabels[item.status] ?? statusLabels.processing
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-current={selected || undefined}
                        onClick={() => { requestDetailFocus(item.id); update('id', item.id) }}
                        className={cn(
                          'flex w-full flex-wrap items-center gap-3 min-w-0 rounded-md px-2.5 py-2 text-left wrap-anywhere focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
                          selected ? 'bg-nav-active' : 'hover:bg-surface-subtle',
                        )}
                      >
                        <span className="w-[100px] shrink-0 text-[11px] tabular-nums leading-[19px] text-text-secondary">{dateTime.format(new Date(item.startedAt))}</span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={cn('wrap-anywhere text-[13px] leading-[21px] text-text-primary', selected && 'font-bold')}>
                            {actionText(item)}
                            {item.targetLabel ? `：${item.targetLabel}` : ''}
                          </span>
                          <span className="wrap-anywhere text-[11px] leading-[19px] text-text-secondary">{item.actor?.displayName ?? (item.action === 'import' ? '取り込みコマンド' : '不明な管理者')}</span>
                        </span>
                        <StatusLabel tone={status.tone}>{status.label}</StatusLabel>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {logs.isFetchNextPageError && <NoticeBanner tone="blocking">続きを取得できませんでした。<Button variant="secondary" onClick={() => void logs.fetchNextPage()}>再試行</Button></NoticeBanner>}
            {logs.hasNextPage && (
              <Button variant="secondary" className="self-start" disabled={logs.isFetchingNextPage} onClick={() => void logs.fetchNextPage()}>
                {logs.isFetchingNextPage ? '読み込み中…' : 'さらに読み込む'}
              </Button>
            )}
          </section>

          <main ref={detailRef} tabIndex={-1} className={cn('min-w-0 flex-1 px-4 pt-[22px] pb-10 sm:px-6', selectedId && 'max-lg:min-h-[100cqh]')}>
            {selectedId && <Button variant="ghost" size="sm" className="mb-2 lg:hidden" onClick={returnToList}>一覧へ戻る</Button>}
            {selectedId ? <LogDetailContent item={selectedLog} pending={detail.isPending} error={detail.error} onRetry={() => void detail.refetch()} /> : <p className="text-[12px] leading-5 text-text-secondary">一覧から記録を選ぶと、詳細を表示します。</p>}
          </main>
        </div>
      </div>
    </>
  )
}

function LogDetailContent({ item, pending, error, onRetry }: { item?: LogItem; pending: boolean; error: Error | null; onRetry: () => void }) {
  if (item) return <LogDetail item={item} />
  if (pending)
    return (
      <p role="status" className="text-[12px] leading-5 text-text-secondary">
        記録を読み込んでいます
      </p>
    )
  const notFound = error instanceof ApiError && error.status === 404
  return <NoticeBanner tone="blocking">{notFound ? 'この記録は見つかりません。一覧から選び直してください。' : '記録を取得できませんでした。'}{!notFound && <Button variant="secondary" onClick={onRetry}>再試行</Button>}</NoticeBanner>
}

function LogDetail({ item }: { item: LogItem }) {
  const status = statusLabels[item.status] ?? statusLabels.processing
  const kind = item.targetKind as TargetKind | null
  return (
    <div className="flex w-[680px] max-w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 tabIndex={-1} className="wrap-anywhere text-[22px] leading-[30px] font-bold text-text-primary">{actionText(item)}</h2>
        <StatusLabel tone={status.tone}>{status.label}</StatusLabel>
      </div>
      <dl className="-mt-1.5 divide-y divide-border-subtle border-y border-border-subtle text-[12px] leading-5">
        <div className={metadataRow}>
          <dt className="text-text-secondary">日時</dt>
          <dd className="text-text-primary tabular-nums">
            {fullDateTime.format(new Date(item.startedAt))} JST
            {item.finishedAt && item.finishedAt !== item.startedAt ? `（完了 ${fullDateTime.format(new Date(item.finishedAt))}）` : ''}
          </dd>
        </div>
        <div className={metadataRow}>
          <dt className="text-text-secondary">実行者</dt>
          <dd className="wrap-anywhere text-text-primary">{item.actor?.displayName ?? (item.action === 'import' ? '取り込みコマンド（運用者）' : '—')}</dd>
        </div>
        <div className={metadataRow}>
          <dt className="text-text-secondary">操作</dt>
          <dd className="text-text-primary">{actionLabels[item.action] ?? item.action}</dd>
        </div>
        <div className={metadataRow}>
          <dt className="text-text-secondary">対象</dt>
          <dd className="wrap-anywhere text-text-primary">
            {kind && item.targetId ? (
              <>
                {kindNouns[kind] ?? kind}：
                <Link to={editorPath(kind, item.targetId)} className="text-brand hover:underline">
                  {item.targetLabel ?? item.targetId}
                </Link>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className={metadataRow}>
          <dt className="text-text-secondary">結果</dt>
          <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 wrap-anywhere text-text-primary">
            <StatusLabel tone={status.tone} textTone={item.status === 'succeeded' ? 'primary' : 'tone'}>{status.label}</StatusLabel>
            {item.detail && <span>（{normalizeDetail(item.detail)}）</span>}
          </dd>
        </div>
        {item.releaseId && (
          <div className={metadataRow}>
            <dt className="text-text-secondary">関連する公開版</dt>
            <dd>
              <Link to={`/releases?id=${item.releaseId}`} className="text-brand tabular-nums hover:underline">
                第{item.releaseSequence}版
              </Link>
            </dd>
          </div>
        )}
        {item.revisionId && (
          <div className={metadataRow}>
            <dt className="text-text-secondary">保存した版</dt>
            <dd className="font-mono tabular-nums text-text-primary">{item.revisionId.slice(-8)}</dd>
          </div>
        )}
        {item.operationId && (
          <div className={metadataRow}>
            <dt className="text-text-secondary">操作ID</dt>
            <dd className="break-all font-mono text-text-secondary">{item.operationId}</dd>
          </div>
        )}
      </dl>
      <p className="text-[11px] leading-[19px] text-text-secondary">パスワードや認証トークンは記録していません。未登録のメールアドレスでのログイン失敗は、入力された値を残していません。</p>
    </div>
  )
}
