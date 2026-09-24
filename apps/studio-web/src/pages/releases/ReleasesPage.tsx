import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { ApiError } from '../../api/client'
import { getReference } from '../../api/reference'
import { getRelease, listReleases, type ReleaseDetail, type ReleaseEntryDetail, type ReleaseSummary, type TargetKind } from '../../api/releases'
import { DiffList } from '../../publishing/DiffList'
import { diffRows } from '../../publishing/diff'
import { editorPath, isLive, kindNouns, publicationBadge, reviewPath } from '../../publishing/publication'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { FilterChip } from '../../ui/FilterChip'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusBadge } from '../../ui/StatusBadge'

const dateTime = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

const actionLabels: Record<string, { label: string; tone: 'neutral' | 'danger' | 'info' }> = {
  publish: { label: '公開', tone: 'info' },
  withdraw: { label: '取り下げ', tone: 'danger' },
  restore: { label: '復旧', tone: 'neutral' },
}

function actionsOf(release: ReleaseSummary): string[] {
  return [...new Set(release.entries.map((entry) => entry.action))]
}

/**
 * Releases（11 RL-08・RL-09・RL-10〜RL-12）。一覧＋詳細の2列。Figma に無く、2026-09-24 に承認された構成案で作る（28 S4-10）。
 * 詳細から［この版に戻す］［取り下げ］へ進む。確認・実行は公開確認（R01 の形）で行う。
 */
export function ReleasesPage() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')
  const targetKind = params.get('targetKind') ?? ''
  const action = params.get('action') ?? ''

  const releases = useInfiniteQuery({
    queryKey: ['releases', { targetKind, action }],
    queryFn: ({ pageParam }) => listReleases({ targetKind, action, before: pageParam }),
    initialPageParam: null as number | null,
    getNextPageParam: (page) => page.nextBefore ?? undefined,
  })
  const items = releases.data?.pages.flatMap((page) => page.items) ?? []

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <>
      <Toolbar title="Releases" subtitle="公開・取り下げ・復旧の履歴" />
      <div className="flex min-h-0 flex-1">
        <section aria-label="公開履歴" className="flex w-[560px] shrink-0 flex-col gap-3 overflow-auto border-r border-border bg-surface p-[18px]">
          <h2 className="text-[16px] leading-6 font-bold text-text-primary">公開履歴</h2>
          <div className="flex flex-wrap gap-2">
            <FilterChip label="対象の種類" value={targetKind} onChange={(value) => update('targetKind', value)}>
              <option value="">対象：すべて</option>
              <option value="event">対象：イベント</option>
              <option value="occurrence">対象：開催回</option>
              <option value="categories">対象：カテゴリ一覧</option>
              <option value="spot">対象：Spot</option>
            </FilterChip>
            <FilterChip label="操作" value={action} onChange={(value) => update('action', value)}>
              <option value="">操作：すべて</option>
              <option value="publish">操作：公開</option>
              <option value="withdraw">操作：取り下げ</option>
              <option value="restore">操作：復旧</option>
            </FilterChip>
          </div>

          {releases.isPending ? (
            <p role="status" className="text-[12px] leading-5 text-text-secondary">
              公開履歴を読み込んでいます
            </p>
          ) : releases.isError ? (
            <NoticeBanner tone="blocking">
              公開履歴を取得できませんでした。0件とは扱わず、再試行してください。
              <Button variant="secondary" className="ml-3" onClick={() => void releases.refetch()}>
                再試行
              </Button>
            </NoticeBanner>
          ) : items.length === 0 ? (
            <NoticeBanner>{targetKind || action ? '条件に一致する公開履歴はありません。' : '公開履歴は正式に0件です。'}</NoticeBanner>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((release) => {
                const selected = release.releaseId === selectedId
                return (
                  <li key={release.releaseId}>
                    <button
                      type="button"
                      aria-current={selected || undefined}
                      onClick={() => update('id', release.releaseId)}
                      className={cn(
                        'flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
                        selected ? 'border-brand bg-brand-subtle' : 'border-border bg-surface hover:bg-surface-subtle',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className={cn('text-[13px] leading-[21px] font-bold', selected ? 'text-brand' : 'text-text-primary')}>Release #{release.sequence}</span>
                        {actionsOf(release).map((value) => (
                          <StatusBadge key={value} tone={actionLabels[value]?.tone}>
                            {actionLabels[value]?.label ?? value}
                          </StatusBadge>
                        ))}
                        {release.source === 'import' && <StatusBadge>取り込み</StatusBadge>}
                      </span>
                      <span className="truncate text-[12px] leading-5 text-text-primary">{release.entries.map((entry) => entry.label).join('、')}</span>
                      <span className="text-[11px] leading-[19px] text-text-secondary">
                        {dateTime.format(new Date(release.createdAt))}・{release.createdBy?.displayName ?? '取り込みコマンド'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {releases.hasNextPage && (
            <Button variant="secondary" className="self-start" disabled={releases.isFetchingNextPage} onClick={() => void releases.fetchNextPage()}>
              {releases.isFetchingNextPage ? '読み込み中…' : 'さらに読み込む'}
            </Button>
          )}
        </section>

        <main className="min-h-0 flex-1 overflow-auto px-6 pt-[22px] pb-10">
          {selectedId ? <ReleaseDetailLoader key={selectedId} id={selectedId} /> : <p className="text-[12px] leading-5 text-text-secondary">左の一覧から Release を選ぶと、公開した内容と差分を表示します。</p>}
        </main>
      </div>
    </>
  )
}

function ReleaseDetailLoader({ id }: { id: string }) {
  const detail = useQuery({ queryKey: ['release', id], queryFn: () => getRelease(id) })
  if (detail.data) return <ReleaseDetailView detail={detail.data} />
  if (detail.isPending)
    return (
      <p role="status" className="text-[12px] leading-5 text-text-secondary">
        Release を読み込んでいます
      </p>
    )
  const notFound = detail.error instanceof ApiError && detail.error.status === 404
  return (
    <NoticeBanner tone="blocking" className="w-[776px] max-w-full">
      {notFound ? 'この Release は見つかりません。一覧から選び直してください。' : 'Release を取得できませんでした。'}
      {!notFound && (
        <Button variant="secondary" className="ml-3" onClick={() => void detail.refetch()}>
          再試行
        </Button>
      )}
    </NoticeBanner>
  )
}

function ReleaseDetailView({ detail }: { detail: ReleaseDetail }) {
  const { release } = detail
  const reference = useQuery({ queryKey: ['reference'], queryFn: getReference })
  const names = { occurrences: new Map((reference.data?.occurrences ?? []).map((o) => [o.id, o.name])) }

  return (
    <div className="flex w-[776px] max-w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[24px] leading-8 font-bold text-text-primary">Release #{release.sequence}</h2>
        {actionsOf(release).map((value) => (
          <StatusBadge key={value} tone={actionLabels[value]?.tone}>
            {actionLabels[value]?.label ?? value}
          </StatusBadge>
        ))}
        {release.source === 'import' && <StatusBadge>取り込み</StatusBadge>}
      </div>
      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-surface px-4 py-3.5 text-[12px] leading-5">
        <dt className="text-text-secondary">日時</dt>
        <dd className="text-text-primary">{dateTime.format(new Date(release.createdAt))} JST</dd>
        <dt className="text-text-secondary">実行者</dt>
        <dd className="text-text-primary">{release.createdBy?.displayName ?? '取り込みコマンド（運用者）'}</dd>
        <dt className="text-text-secondary">結果</dt>
        <dd className="text-success">成功（サーバー側で公開版を確定）</dd>
        {release.message && (
          <>
            <dt className="text-text-secondary">メッセージ</dt>
            <dd className="break-words text-text-primary">{release.message}</dd>
          </>
        )}
      </dl>
      <p className="-mt-2 text-[11px] leading-[19px] text-text-secondary">
        公開に失敗した操作は Release を作りません。失敗の記録は <Link to="/logs?action=publish&status=failed" className="text-brand hover:underline">Logs</Link> で確認できます。
      </p>

      {detail.entries.map((entry) => (
        <EntryCard key={`${entry.entry.targetKind}:${entry.entry.targetId}`} entry={entry} detail={detail} names={names} />
      ))}
    </div>
  )
}

function EntryCard({ entry, detail, names }: { entry: ReleaseEntryDetail; detail: ReleaseDetail; names: { occurrences: Map<string, string> } }) {
  const { targetKind, targetId, action, label, revisionId, restoredFromRevisionId } = entry.entry
  const kind = targetKind as TargetKind
  const current = publicationBadge(entry.currentPublication.state)
  const rows = diffRows({ action: action === 'withdraw' ? 'withdraw' : 'publish', targetKind, ...entry.changes }, detail.published, detail.candidate, names)
  const stashRows = entry.stash ? diffRows({ action: 'publish', targetKind, ...entry.stash }, detail.candidate, detail.candidate, names) : []

  return (
    <section aria-label={`${kindNouns[kind] ?? targetKind}：${label}`} className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge>{kindNouns[kind] ?? targetKind}</StatusBadge>
        <h3 className="text-[16px] leading-6 font-bold break-words text-text-primary">{label}</h3>
        <StatusBadge tone={actionLabels[action]?.tone}>{actionLabels[action]?.label ?? action}</StatusBadge>
        {entry.isCurrent ? <StatusBadge tone="success">いまの公開版</StatusBadge> : <StatusBadge tone={current.tone}>現在：{current.label}</StatusBadge>}
      </div>
      <p className="text-[11px] leading-[19px] text-text-secondary">
        {action === 'withdraw' ? '取り下げた版' : 'この版'}：{revisionId.slice(-8)}
        {restoredFromRevisionId && `（過去の版 ${restoredFromRevisionId.slice(-8)} の内容を戻しました）`}
      </p>

      <div>
        <h4 className="text-[13px] leading-[21px] font-bold text-text-primary">{action === 'withdraw' ? '取り下げた内容' : '直前の公開版との差分'}</h4>
        <DiffList rows={rows} before="直前の公開版" after={action === 'withdraw' ? 'この Release の後' : 'この版'} empty="直前の公開版との違いはありません。" />
      </div>

      {entry.stash && (
        <div className="flex flex-col gap-1 rounded-lg bg-surface-subtle px-3.5 py-3">
          <h4 className="text-[13px] leading-[21px] font-bold text-text-primary">退避した下書き</h4>
          <p className="text-[11px] leading-[19px] text-text-secondary">
            復旧の直前にあった未公開の下書き（版 {entry.entry.stashedRevisionId?.slice(-8)}）です。内容はここで確認できます。下書きへ戻す操作は後の段階で追加します。
          </p>
          <DiffList rows={stashRows} before="退避した下書き" after="復旧後の下書き" empty="復旧後の下書きとの違いはありません。" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {entry.canRestore && (
          <Link
            to={reviewPath(kind, targetId, 'restore', revisionId)}
            className="flex h-10 min-w-[120px] items-center justify-center rounded-lg border border-border bg-surface px-4 text-[14px] leading-[22px] font-medium text-text-primary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            この版に戻す…
          </Link>
        )}
        {entry.isCurrent && isLive(entry.currentPublication.state) && kind !== 'categories' && (
          <Link
            to={reviewPath(kind, targetId, 'withdraw')}
            className="flex h-10 min-w-[120px] items-center justify-center rounded-lg border border-danger bg-surface px-4 text-[14px] leading-[22px] font-medium text-text-primary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            取り下げ…
          </Link>
        )}
        <Link
          to={editorPath(targetKind, targetId)}
          className="flex h-10 min-w-[120px] items-center justify-center rounded-lg border border-border bg-surface px-4 text-[14px] leading-[22px] font-medium text-text-primary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          編集画面を開く
        </Link>
      </div>
    </section>
  )
}
