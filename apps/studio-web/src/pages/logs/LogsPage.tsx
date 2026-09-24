import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { ApiError } from '../../api/client'
import { getLog, listLogs, type LogItem } from '../../api/logs'
import type { TargetKind } from '../../api/releases'
import { editorPath, kindNouns } from '../../publishing/publication'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { FilterChip } from '../../ui/FilterChip'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusBadge, type StatusTone } from '../../ui/StatusBadge'

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

function actionText(item: LogItem): string {
  // 公開操作は、公開・取り下げ・復旧のどれかを補足に持つ。
  if (item.action === 'publish' && item.detail && item.status === 'succeeded') return item.detail
  return actionLabels[item.action] ?? item.action
}

/**
 * Logs（12 UI-18・UI-19、28 S4-8）。一覧＋詳細の2列。Figma に無く、2026-09-24 に承認された構成案で作る（28 S4-10）。
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
  const items = logs.data?.pages.flatMap((page) => page.items) ?? []
  const actors = logs.data?.pages[0]?.actors ?? []

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <>
      <Toolbar title="Logs" subtitle="保存・公開・ログインの記録" />
      <div className="flex min-h-0 flex-1">
        <section aria-label="操作ログ" className="flex w-[640px] shrink-0 flex-col gap-3 overflow-auto border-r border-border bg-surface p-[18px]">
          <h2 className="text-[16px] leading-6 font-bold text-text-primary">操作ログ</h2>
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip label="操作" value={filters.action} onChange={(value) => update('action', value)}>
              <option value="">操作：すべて</option>
              {Object.entries(actionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  操作：{label}
                </option>
              ))}
            </FilterChip>
            <FilterChip label="結果" value={filters.status} onChange={(value) => update('status', value)}>
              <option value="">結果：すべて</option>
              <option value="succeeded">結果：成功</option>
              <option value="failed">結果：失敗</option>
              <option value="processing">結果：処理中</option>
            </FilterChip>
            <FilterChip label="管理者" value={filters.actorId} onChange={(value) => update('actorId', value)}>
              <option value="">管理者：すべて</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  管理者：{actor.displayName}
                </option>
              ))}
            </FilterChip>
            <FilterChip label="対象" value={filters.targetKind} onChange={(value) => update('targetKind', value)}>
              <option value="">対象：すべて</option>
              <option value="event">対象：イベント</option>
              <option value="occurrence">対象：開催回</option>
              <option value="categories">対象：カテゴリ一覧</option>
              <option value="spot">対象：Spot</option>
            </FilterChip>
            <label className="flex items-center gap-1 text-[11px] leading-[19px] text-text-secondary">
              日付
              <input
                type="date"
                value={filters.date}
                onChange={(event) => update('date', event.target.value)}
                className={cn(
                  'h-[25px] rounded-full px-2.5 text-[11px] leading-[19px] font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
                  filters.date ? 'bg-brand-subtle text-brand' : 'bg-surface-subtle text-text-secondary',
                )}
              />
            </label>
          </div>

          {logs.isPending ? (
            <p role="status" className="text-[12px] leading-5 text-text-secondary">
              操作ログを読み込んでいます
            </p>
          ) : logs.isError ? (
            <NoticeBanner tone="blocking">
              操作ログを取得できませんでした。0件とは扱わず、再試行してください。
              <Button variant="secondary" className="ml-3" onClick={() => void logs.refetch()}>
                再試行
              </Button>
            </NoticeBanner>
          ) : items.length === 0 ? (
            <NoticeBanner>{filtered ? '条件に一致する記録はありません。' : '操作ログは正式に0件です。'}</NoticeBanner>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const selected = item.id === selectedId
                const status = statusLabels[item.status] ?? statusLabels.processing
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={selected || undefined}
                      onClick={() => update('id', item.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
                        selected ? 'border-brand bg-brand-subtle' : 'border-border bg-surface hover:bg-surface-subtle',
                      )}
                    >
                      <span className="w-[120px] shrink-0 text-[11px] leading-[19px] text-text-secondary">{dateTime.format(new Date(item.startedAt))}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn('truncate text-[13px] leading-[21px] font-medium', selected ? 'text-brand' : 'text-text-primary')}>
                          {actionText(item)}
                          {item.targetLabel ? `：${item.targetLabel}` : ''}
                        </span>
                        <span className="truncate text-[11px] leading-[19px] text-text-secondary">{item.actor?.displayName ?? (item.action === 'import' ? '取り込みコマンド' : '不明な管理者')}</span>
                      </span>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {logs.hasNextPage && (
            <Button variant="secondary" className="self-start" disabled={logs.isFetchingNextPage} onClick={() => void logs.fetchNextPage()}>
              {logs.isFetchingNextPage ? '読み込み中…' : 'さらに読み込む'}
            </Button>
          )}
        </section>

        <main className="min-h-0 flex-1 overflow-auto px-6 pt-[22px] pb-10">
          {selectedId ? <LogDetailLoader key={selectedId} id={selectedId} listed={items.find((item) => item.id === selectedId)} /> : <p className="text-[12px] leading-5 text-text-secondary">左の一覧から記録を選ぶと、詳細を表示します。</p>}
        </main>
      </div>
    </>
  )
}

function LogDetailLoader({ id, listed }: { id: string; listed: LogItem | undefined }) {
  const detail = useQuery({ queryKey: ['log', id], queryFn: () => getLog(id), enabled: !listed })
  const item = listed ?? detail.data
  if (item) return <LogDetail item={item} />
  if (detail.isPending)
    return (
      <p role="status" className="text-[12px] leading-5 text-text-secondary">
        記録を読み込んでいます
      </p>
    )
  const notFound = detail.error instanceof ApiError && detail.error.status === 404
  return <NoticeBanner tone="blocking">{notFound ? 'この記録は見つかりません。一覧から選び直してください。' : '記録を取得できませんでした。'}</NoticeBanner>
}

function LogDetail({ item }: { item: LogItem }) {
  const status = statusLabels[item.status] ?? statusLabels.processing
  const kind = item.targetKind as TargetKind | null
  return (
    <div className="flex w-[640px] max-w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[22px] leading-[30px] font-bold text-text-primary">{actionText(item)}</h2>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 rounded-lg bg-surface px-4 py-3.5 text-[12px] leading-5">
        <dt className="text-text-secondary">日時</dt>
        <dd className="text-text-primary">
          {fullDateTime.format(new Date(item.startedAt))} JST
          {item.finishedAt && item.finishedAt !== item.startedAt ? `（完了 ${fullDateTime.format(new Date(item.finishedAt))}）` : ''}
        </dd>
        <dt className="text-text-secondary">実行者</dt>
        <dd className="text-text-primary">{item.actor?.displayName ?? (item.action === 'import' ? '取り込みコマンド（運用者）' : '—')}</dd>
        <dt className="text-text-secondary">操作</dt>
        <dd className="text-text-primary">{actionLabels[item.action] ?? item.action}</dd>
        <dt className="text-text-secondary">対象</dt>
        <dd className="break-words text-text-primary">
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
        <dt className="text-text-secondary">結果</dt>
        <dd className={item.status === 'failed' ? 'text-danger' : 'text-text-primary'}>
          {status.label}
          {item.detail ? `（${item.detail}）` : ''}
        </dd>
        {item.releaseId && (
          <>
            <dt className="text-text-secondary">関連する Release</dt>
            <dd>
              <Link to={`/releases?id=${item.releaseId}`} className="text-brand hover:underline">
                Release #{item.releaseSequence}
              </Link>
            </dd>
          </>
        )}
        {item.revisionId && (
          <>
            <dt className="text-text-secondary">保存した版</dt>
            <dd className="text-text-primary">{item.revisionId.slice(-8)}</dd>
          </>
        )}
        {item.operationId && (
          <>
            <dt className="text-text-secondary">操作ID</dt>
            <dd className="break-all text-text-secondary">{item.operationId}</dd>
          </>
        )}
      </dl>
      <p className="text-[11px] leading-[19px] text-text-secondary">パスワードや認証トークンは記録していません。未登録のメールアドレスでのログイン失敗は、入力された値を残していません。</p>
    </div>
  )
}
