import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
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
import { SelectField } from '../../ui/Field'
import { StaleListNotice } from '../../ui/StaleListNotice'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusLabel } from '../../ui/StatusLabel'

const dateTime = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

const actionLabels: Record<string, { label: string; tone: 'neutral' | 'danger' | 'success' }> = {
  publish: { label: '公開', tone: 'success' },
  withdraw: { label: '公開をやめる', tone: 'danger' },
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
  const targetId = params.get('targetId') ?? ''
  const action = params.get('action') ?? ''

  const releases = useInfiniteQuery({
    queryKey: ['releases', { targetKind, targetId, action }],
    queryFn: ({ pageParam }) => listReleases({ targetKind, targetId, action, before: pageParam }),
    initialPageParam: null as number | null,
    getNextPageParam: (page) => page.nextBefore ?? undefined,
  })
  const query = { targetKind, targetId, action }
  const [lastSuccess, setLastSuccess] = useState<{ data: NonNullable<typeof releases.data>; query: typeof query; updatedAt: number } | null>(null)
  if (releases.isSuccess && (!lastSuccess || lastSuccess.data !== releases.data || lastSuccess.updatedAt !== releases.dataUpdatedAt || JSON.stringify(lastSuccess.query) !== JSON.stringify(query))) setLastSuccess({ data: releases.data, query, updatedAt: releases.dataUpdatedAt })
  const items = lastSuccess?.data.pages.flatMap((page) => page.items) ?? []
  const targetNames = [...new Set((releases.data?.pages ?? []).flatMap((page) => page.items.flatMap((release) => release.entries.filter((entry) => entry.targetId === targetId).map((entry) => entry.label))))]
  const describe = (q: typeof query) => [q.targetKind && `対象：${kindNouns[q.targetKind as TargetKind] ?? q.targetKind}`, q.targetId && `対象ID：${q.targetId}`, q.action && `操作：${actionLabels[q.action]?.label ?? q.action}`].filter(Boolean).join('／') || '絞り込みなし'

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <>
      <Toolbar title="公開履歴" subtitle="公開・公開停止・復旧の履歴" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-canvas lg:flex-row lg:overflow-hidden">
        <section aria-label="公開履歴" className="flex w-full min-w-0 shrink-0 flex-col gap-3 border-b border-border-subtle p-4 lg:w-[360px] xl:w-[400px] lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <h2 className="text-[16px] leading-6 font-bold text-text-primary">公開履歴</h2>
          <div className="flex flex-wrap gap-2">
            <SelectField label="対象の種類" controlSize="sm" className="min-w-0 [&>label]:sr-only [&_select]:text-[12px]" value={targetKind} onChange={(event) => update('targetKind', event.target.value)}>
              <option value="">対象：すべて</option>
              <option value="event">対象：イベント</option>
              <option value="occurrence">対象：開催回</option>
              <option value="categories">対象：カテゴリ一覧</option>
              <option value="spot">対象：地点</option>
              <option value="map">対象：地図</option>
            </SelectField>
            <SelectField label="操作" controlSize="sm" className="min-w-0 [&>label]:sr-only [&_select]:text-[12px]" value={action} onChange={(event) => update('action', event.target.value)}>
              <option value="">操作：すべて</option>
              <option value="publish">操作：公開</option>
              <option value="withdraw">操作：公開をやめる</option>
              <option value="restore">操作：復旧</option>
            </SelectField>
          </div>

          {targetId && (
            <NoticeBanner>
              {targetNames.length === 1 ? `対象「${targetNames[0]}」の公開履歴を表示しています。` : '指定された対象の公開履歴を表示しています。'}
              <Button variant="secondary" className="ml-3" onClick={() => update('targetId', '')}>
                対象絞り込みを解除
              </Button>
            </NoticeBanner>
          )}

          {(targetKind || action) && <Button variant="secondary" size="sm" onClick={() => { const next = new URLSearchParams(params); next.delete('targetKind'); next.delete('action'); setParams(next, { replace: true }) }}>絞り込みを解除</Button>}
          {releases.isError && !releases.isFetchNextPageError && lastSuccess && <StaleListNotice listName="公開履歴" updatedAt={lastSuccess.updatedAt} conditions={{ failed: describe(query), shown: describe(lastSuccess.query) }} onRetry={() => void releases.refetch()} />}
          {lastSuccess && <p className="text-[11px] tabular-nums">{items.length}件表示</p>}
          {!lastSuccess && releases.isPending ? (
            <p role="status" className="text-[12px] leading-5 text-text-secondary">
              公開履歴を読み込んでいます
            </p>
          ) : !lastSuccess ? (
            <NoticeBanner tone="blocking">
              公開履歴を取得できませんでした。0件とは扱わず、再試行してください。
              <Button variant="secondary" className="ml-3" onClick={() => void releases.refetch()}>
                再試行
              </Button>
            </NoticeBanner>
          ) : items.length === 0 ? (
            <NoticeBanner>{lastSuccess.query.targetKind || lastSuccess.query.targetId || lastSuccess.query.action ? '条件に一致する公開履歴はありません。' : '公開履歴は正式に0件です。'}</NoticeBanner>
          ) : (
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {items.map((release) => {
                const selected = release.releaseId === selectedId
                return (
                  <li key={release.releaseId}>
                    <button
                      type="button"
                      aria-current={selected || undefined}
                      onClick={() => update('id', release.releaseId)}
                      className={cn(
                        'flex w-full flex-col gap-1 min-w-0 rounded-md px-2.5 py-2 text-left wrap-anywhere focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
                        selected ? 'bg-nav-active' : 'hover:bg-surface-subtle',
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cn('text-[13px] leading-[21px] font-bold tabular-nums', 'text-text-primary')}>第{release.sequence}版</span>
                        {actionsOf(release).map((value) => (
                          <StatusLabel key={value} tone={actionLabels[value]?.tone}>
                            {actionLabels[value]?.label ?? value}
                          </StatusLabel>
                        ))}
                        {release.source === 'import' && <span className="text-[11px] text-text-secondary">· 取り込み</span>}
                      </span>
                      <span className="wrap-anywhere text-[12px] leading-5 text-text-primary">{release.entries.map((entry) => entry.label).join('、')}</span>
                      <span className="text-[11px] leading-[19px] text-text-secondary tabular-nums">
                        {dateTime.format(new Date(release.createdAt))}・{release.createdBy?.displayName ?? '取り込みコマンド'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {releases.isFetchNextPageError && <NoticeBanner tone="blocking">続きを取得できませんでした。<Button variant="secondary" onClick={() => void releases.fetchNextPage()}>再試行</Button></NoticeBanner>}
          {releases.hasNextPage && (
            <Button variant="secondary" className="self-start" disabled={releases.isFetchingNextPage} onClick={() => void releases.fetchNextPage()}>
              {releases.isFetchingNextPage ? '読み込み中…' : 'さらに読み込む'}
            </Button>
          )}
        </section>

        <main className="min-w-0 flex-1 px-4 pt-[22px] pb-10 sm:px-6 lg:min-h-0 lg:overflow-y-auto">
          {selectedId ? <ReleaseDetailLoader key={selectedId} id={selectedId} /> : <p className="text-[12px] leading-5 text-text-secondary">一覧から公開版を選ぶと、公開した内容と差分を表示します。</p>}
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
        公開版を読み込んでいます
      </p>
    )
  const notFound = detail.error instanceof ApiError && detail.error.status === 404
  return (
    <NoticeBanner tone="blocking" className="w-[776px] max-w-full">
      {notFound ? 'この公開版は見つかりません。一覧から選び直してください。' : '公開版を取得できませんでした。'}
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
        <h2 className="text-[24px] leading-8 font-bold tabular-nums text-text-primary">第{release.sequence}版</h2>
        {actionsOf(release).map((value) => (
          <StatusLabel key={value} tone={actionLabels[value]?.tone}>
            {actionLabels[value]?.label ?? value}
          </StatusLabel>
        ))}
        {release.source === 'import' && <span className="text-[11px] text-text-secondary">· 取り込み</span>}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-surface px-4 py-3.5 text-[12px] leading-5">
        <dt className="text-text-secondary">日時</dt>
        <dd className="text-text-primary tabular-nums">{dateTime.format(new Date(release.createdAt))} JST</dd>
        <dt className="text-text-secondary">実行者</dt>
        <dd className="text-text-primary">{release.createdBy?.displayName ?? '取り込みコマンド（運用者）'}</dd>
        <dt className="text-text-secondary">結果</dt>
        <dd><StatusLabel tone="success">成功（サーバー側で公開版を確定）</StatusLabel></dd>
        {release.message && (
          <>
            <dt className="text-text-secondary">メッセージ</dt>
            <dd className="wrap-anywhere text-text-primary">{release.message}</dd>
          </>
        )}
      </dl>
      <p className="-mt-2 text-[11px] leading-[19px] text-text-secondary">
        公開に失敗した操作は 公開版を作りません。失敗の記録は <Link to="/logs?action=publish&status=failed" className="text-brand hover:underline">操作記録</Link> で確認できます。
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
    <section aria-label={`${kindNouns[kind] ?? targetKind}：${label}`} className="flex min-w-0 flex-col gap-3 border-t border-border-subtle py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-text-secondary">{kindNouns[kind] ?? targetKind}</span>
        <h3 className="text-[16px] leading-6 font-bold wrap-anywhere text-text-primary">{label}</h3>
        <StatusLabel tone={actionLabels[action]?.tone}>{actionLabels[action]?.label ?? action}</StatusLabel>
        {entry.isCurrent ? <StatusLabel tone="success">いまの公開版</StatusLabel> : <StatusLabel tone={current.tone}>現在：{current.label}</StatusLabel>}
      </div>
      <p className="text-[11px] leading-[19px] text-text-secondary">
        {action === 'withdraw' ? '公開停止した版' : 'この版'}：<span className="font-mono tabular-nums">{revisionId.slice(-8)}</span>
        {restoredFromRevisionId && <>（過去の版 <span className="font-mono tabular-nums">{restoredFromRevisionId.slice(-8)}</span> の内容を戻しました）</>}
      </p>

      <div>
        <h4 className="text-[13px] leading-[21px] font-bold text-text-primary">{action === 'withdraw' ? '公開停止した内容' : '直前の公開版との差分'}</h4>
        <DiffList rows={rows} before="直前の公開版" after={action === 'withdraw' ? 'この公開操作の後' : 'この版'} empty="直前の公開版との違いはありません。" />
      </div>

      {entry.stash && (
        <div className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-subtle p-4">
          <h4 className="text-[13px] leading-[21px] font-bold text-text-primary">退避した下書き</h4>
          <p className="text-[11px] leading-[19px] text-text-secondary">
            復旧の直前にあった未公開の下書き（版 <span className="font-mono tabular-nums">{entry.entry.stashedRevisionId?.slice(-8)}</span>）です。内容はここで確認できます。下書きへ戻す操作は後の段階で追加します。
          </p>
          <DiffList rows={stashRows} before="退避した下書き" after="復旧後の下書き" empty="復旧後の下書きとの違いはありません。" />
        </div>
      )}

      {entry.isCurrent && !entry.canRestore && <p className="text-[11px] text-text-secondary">いまの公開版のため戻す操作は表示していません。</p>}
      <div className="flex flex-wrap gap-2">
        {entry.canRestore && (
          <Link
            to={reviewPath(kind, targetId, 'restore', revisionId)}
            className="flex h-10 min-w-[120px] items-center justify-center rounded-lg border border-border bg-surface px-4 text-[14px] leading-[22px] font-bold text-text-primary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            この版に戻す…
          </Link>
        )}
        {entry.isCurrent && isLive(entry.currentPublication.state) && kind !== 'categories' && (
          <Link
            to={reviewPath(kind, targetId, 'withdraw')}
            className="flex h-10 min-w-[120px] items-center justify-center rounded-lg border border-danger bg-surface px-4 text-[14px] leading-[22px] font-bold text-text-primary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            公開をやめる…
          </Link>
        )}
        <Link
          to={editorPath(targetKind, targetId)}
          className="flex h-10 min-w-[120px] items-center justify-center rounded-lg border border-border bg-surface px-4 text-[14px] leading-[22px] font-bold text-text-primary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          編集画面を開く
        </Link>
      </div>
    </section>
  )
}
