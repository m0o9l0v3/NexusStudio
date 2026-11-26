import { useQuery } from '@tanstack/react-query'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { LogItem } from '../../api/logs'
import {
  getOverview,
  type OverviewAreaStatus,
  type OverviewDataHealth,
  type OverviewOccurrence,
  type OverviewRelease,
  type OverviewReleaseKindCount,
  type OverviewResponse,
} from '../../api/overview'
import type { TargetKind } from '../../api/releases'
import { formatDateLong, formatDateShort, formatHours } from '../../events/model'
import { actionVerbs, kindNouns, reviewPath } from '../../publishing/publication'
import { Toolbar } from '../../shell/Toolbar'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusLabel } from '../../ui/StatusLabel'

const tokyo = { timeZone: 'Asia/Tokyo', hourCycle: 'h23' } as const
const clock = new Intl.DateTimeFormat('ja-JP', { ...tokyo, hour: '2-digit', minute: '2-digit' })
const fullDateTime = new Intl.DateTimeFormat('ja-JP', {
  ...tokyo, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
// ISO形式でAPIの campusToday と比較する。
const calendarDate = new Intl.DateTimeFormat('sv-SE', {
  ...tokyo, year: 'numeric', month: '2-digit', day: '2-digit',
})

const areas = [
  { kind: 'event', label: kindNouns.event, path: '/events' },
  { kind: 'map', label: kindNouns.map, path: '/map-data' },
  { kind: 'spot', label: kindNouns.spot, path: '/spots' },
  { kind: 'occurrence', label: 'オープンキャンパス', path: '/open-campus' },
  { kind: 'categories', label: 'カテゴリ', path: '/events/categories' },
] as const satisfies ReadonlyArray<{ kind: TargetKind; label: string; path: string }>

const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
const insetFocusClass = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand'
const brandLinkClass = `inline-flex items-center gap-1 rounded-sm text-brand hover:underline ${focusClass}`
const unpublishedRowGridClass = 'grid min-h-11 grid-cols-1 items-center gap-x-4 gap-y-1 px-1 py-2.5 sm:grid-cols-[200px_minmax(0,1fr)_auto]'

function formatRelativeTime(value: string, campusToday: string) {
  const date = new Date(value)
  const day = calendarDate.format(date)
  const time = clock.format(date)
  return day === campusToday ? time : `${formatDateShort(day)} ${time}`
}

function defaultOccurrence(occurrences: OverviewOccurrence[], campusToday: string) {
  const days = occurrences
    .flatMap((occurrence) => occurrence.days.map(({ date }) => ({ date, occurrence })))
    .sort((a, b) => a.date.localeCompare(b.date))

  return (days.find(({ date }) => date >= campusToday) ?? days.at(-1))?.occurrence ?? occurrences[0]
}

export function OverviewPage() {
  const overview = useQuery({ queryKey: ['overview'], queryFn: getOverview })
  const { data } = overview
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 更新後も同じ開催回を表示し、公開中の一覧から消えたときだけ選び直す。
  let occurrence = data?.publishedOccurrences.find(({ id }) => id === selectedId)
  if (data && !occurrence) {
    occurrence = defaultOccurrence(data.publishedOccurrences, data.campusToday)
    const nextId = occurrence?.id ?? null
    if (nextId !== selectedId) setSelectedId(nextId)
  }

  const refresh = () => { void overview.refetch({ cancelRefetch: false }) }

  return (
    <>
      <Toolbar
        title="ホーム"
        className="max-[500px]:flex-wrap max-[500px]:gap-y-1 max-[500px]:px-3"
        titleNode={(
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
            <span>ホーム</span>
            {data && occurrence && (
              <span className="relative inline-flex min-w-0 max-w-full px-0.5">
                <select
                  aria-label="公開中の開催回を切り替える"
                  value={occurrence.id}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className={`h-[30px] min-w-0 max-w-full appearance-none truncate rounded-md border border-border-input bg-surface-subtle pl-2.5 pr-7 text-[13px] font-normal tracking-normal text-text-primary transition-colors hover:bg-surface-hover ${focusClass}`}
                >
                  {data.publishedOccurrences.map(({ id, name }) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden size={14} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-text-secondary" />
              </span>
            )}
          </span>
        )}
      >
        <div className="flex shrink-0 items-center gap-2 max-[500px]:basis-full">
          {data && (
            <span className="text-[12px] leading-[17px] text-text-muted">
              <time dateTime={data.generatedAt} className="tabular-nums">{clock.format(new Date(data.generatedAt))}</time> 更新
            </span>
          )}
          <Button variant="ghost" size="sm" className="w-[30px] px-0" aria-label="最新の状態に更新" onClick={refresh} disabled={overview.isFetching}>
            <RefreshCw aria-hidden size={16} strokeWidth={1.75} className={overview.isFetching ? 'motion-safe:animate-spin' : undefined} />
          </Button>
        </div>
      </Toolbar>
      <main className="min-h-0 flex-1 overflow-y-auto bg-canvas">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-7 px-6 py-6 text-[14px] max-[500px]:px-3 max-[500px]:wrap-anywhere">
          {overview.isPending && <p role="status" className="text-[13px] text-text-secondary">ホームを読み込んでいます。</p>}
          {overview.isError && (
            <NoticeBanner tone={data ? 'warning' : 'blocking'}>
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-2">
                <span>
                  {data ? (
                    <>
                      最新の状態を取得できませんでした。
                      <time dateTime={data.generatedAt}>{fullDateTime.format(new Date(data.generatedAt))}</time>（日本時間）に取得した内容を表示しています。
                    </>
                  ) : 'ホームのデータを取得できませんでした。'}
                </span>
                <Button variant="secondary" size="sm" onClick={refresh} disabled={overview.isFetching}>再試行</Button>
              </span>
            </NoticeBanner>
          )}
          {data && (
            <>
              <CurrentRelease release={data.latestRelease} />
              <div className="grid grid-cols-1 items-start gap-8 border-b border-border-subtle pb-5 lg:grid-cols-2">
                <OccurrenceSchedule occurrence={occurrence} campusToday={data.campusToday} />
                <DataHealth health={data.dataHealth} campusToday={data.campusToday} />
              </div>
              <UnpublishedChanges changes={data.unpublishedChanges} />
              <RecentLogs logs={data.recentLogs} campusToday={data.campusToday} />
            </>
          )}
        </div>
      </main>
    </>
  )
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border-subtle pb-2">
        <h2 className="text-[13px] leading-[18px] font-bold text-text-primary">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function describeReleaseEntry({ targetKind, action, count }: OverviewReleaseKindCount) {
  const noun = kindNouns[targetKind as TargetKind] ?? 'その他'
  const target = targetKind === 'categories' && count === 1 ? noun : `${noun} ${count}件`
  if (action === 'withdraw') return `${target}（${actionVerbs.withdraw}）`
  if (action === 'restore') return `${target}（${actionVerbs.restore}）`
  return target
}

function CurrentRelease({ release }: { release: OverviewRelease | null }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5 border-b border-border-subtle pb-5">
      <h2 className="text-[12px] leading-[17px] font-normal text-text-secondary">いま公開中の版</h2>
      {release ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[20px] leading-[1.2] font-bold tracking-[-0.01em] tabular-nums text-text-primary">
              第{release.sequence}版
            </span>
            <StatusLabel tone="success" textTone="primary">公開中</StatusLabel>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-[19px] text-text-secondary">
            <time dateTime={release.publishedAt} className="tabular-nums">
              {fullDateTime.format(new Date(release.publishedAt))}
            </time>
            <span aria-hidden className="text-text-muted">・</span>
            <span className="tabular-nums">{release.entrySummary.map(describeReleaseEntry).join('・') || 'なし'}</span>
            {release.previousSequence !== null && (
              <>
                <span aria-hidden className="text-text-muted">・</span>
                <span className="tabular-nums">元: 第{release.previousSequence}版</span>
              </>
            )}
            <Link
              to={`/releases?id=${encodeURIComponent(release.releaseId)}`}
              className={`ml-1 ${brandLinkClass}`}
            >
              <span>公開履歴</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusLabel tone="neutral" className="whitespace-normal!">まだ公開されていません</StatusLabel>
          <p className="text-[13px] leading-[19px] text-text-secondary">公開すると、ここに版と公開内容が表示されます。</p>
        </div>
      )}
    </section>
  )
}

function OccurrenceSchedule({ occurrence, campusToday }: { occurrence?: OverviewOccurrence; campusToday: string }) {
  const hasToday = occurrence?.days.some((day) => day.date === campusToday) ?? false

  return (
    <Section
      title="開催情報"
      aside={occurrence ? <StatusLabel tone="success" textTone="primary">公開中</StatusLabel> : <StatusLabel tone="neutral">未公開</StatusLabel>}
    >
      {occurrence && occurrence.days.length > 0 ? (
        <ul className="divide-y divide-border-subtle border-b border-border-subtle">
          {occurrence.days.map((day) => {
            const cancelled = day.status === 'cancelled'
            return (
              <li key={day.id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <time dateTime={day.date} className="font-bold tabular-nums text-text-primary">
                      {formatDateLong(day.date)}
                    </time>
                    {day.date === campusToday && <Badge tone="info">今日</Badge>}
                  </div>
                  <span className="tabular-nums text-text-secondary">{formatHours(day) ?? '開催時間未登録'}</span>
                </div>
                {cancelled ? (
                  <StatusLabel tone="danger">中止</StatusLabel>
                ) : (
                  <span className="text-[13px] text-text-secondary">予定どおり</span>
                )}
                {cancelled && day.cancelNote && (
                  <p className="basis-full text-[12px] leading-[18px] text-text-secondary wrap-anywhere">{day.cancelNote}</p>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border-subtle py-3 text-[13px]">
          <p className="text-text-secondary">{occurrence ? '公開中の開催日はありません。' : '公開中のオープンキャンパスはありません'}</p>
          <Link to="/open-campus" className={brandLinkClass}>
            <span>オープンキャンパスを見る</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      )}
      {hasToday && (
        <p className="pt-2.5 text-[12px] leading-[17px] text-text-muted">
          「今日」かどうかは、実際の日付と公開済みの開催日で判断します。
        </p>
      )}
    </Section>
  )
}

function DiagnosisStatus({ health }: { health: OverviewDataHealth }) {
  const { diagnosisStatus, totalBlockingCount, totalWarningCount } = health
  const stale = diagnosisStatus === 'stale'
  const age = stale ? '（古い結果）' : ''

  if (diagnosisStatus === 'neverRun') return <StatusLabel tone="neutral">未チェック</StatusLabel>
  if (diagnosisStatus === 'failed') return <StatusLabel tone="danger">チェック失敗</StatusLabel>
  if (totalBlockingCount !== null && totalBlockingCount > 0) {
    return <StatusLabel tone="danger" className="whitespace-normal! tabular-nums">公開できない問題 {totalBlockingCount}件{age}</StatusLabel>
  }
  if (totalWarningCount !== null && totalWarningCount > 0) {
    return <StatusLabel tone="warning" className="whitespace-normal! tabular-nums">要確認 {totalWarningCount}件{age}</StatusLabel>
  }
  if (stale) return <StatusLabel tone="warning">結果が古い</StatusLabel>
  if (diagnosisStatus === 'ok' && totalBlockingCount === 0 && totalWarningCount === 0) {
    return <StatusLabel tone="success" textTone="primary">問題なし</StatusLabel>
  }
  return <StatusLabel tone="neutral">結果不明</StatusLabel>
}

function DataHealth({ health, campusToday }: { health: OverviewDataHealth; campusToday: string }) {
  const { hasPublishedRelease, includesMap, lastCheckedAt, uncheckedByArea, uncheckedDraftCount } = health
  const unchecked = uncheckedDraftCount > 0
  const uncheckedSummary = uncheckedByArea.map(({ targetKind, count }) =>
    `${kindNouns[targetKind as TargetKind] ?? 'その他'} ${count}件`,
  ).join('・')

  return (
    <Section
      title="データの状態"
      aside={lastCheckedAt ? (
        <span className="text-[12px] leading-[17px] text-text-muted tabular-nums">
          <time dateTime={lastCheckedAt}>{formatRelativeTime(lastCheckedAt, campusToday)}</time> チェック
        </span>
      ) : (
        <span className="text-[12px] leading-[17px] text-text-muted">未チェック</span>
      )}
    >
      <ul className="divide-y divide-border-subtle border-b border-border-subtle">
        <li className="flex min-h-11 items-center justify-between gap-3 py-2.5 max-[500px]:flex-wrap">
          <span className="text-text-primary">公開中の版</span>
          {hasPublishedRelease ? (
            <StatusLabel tone="success" textTone="primary">問題なし</StatusLabel>
          ) : (
            <StatusLabel tone="neutral">未公開</StatusLabel>
          )}
        </li>
        <li className="flex min-h-11 items-center justify-between gap-3 py-2.5 max-[500px]:flex-wrap">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-text-primary">下書き</span>
            {includesMap && <span className="text-[12px] text-text-muted">地図を含む</span>}
          </span>
          <DiagnosisStatus health={health} />
        </li>
        <li className="flex min-h-11 items-center justify-between gap-3 py-2.5 max-[500px]:flex-wrap">
          <span className="text-text-primary">未チェックの下書き</span>
          {unchecked ? (
            <StatusLabel tone="warning" className="whitespace-normal! tabular-nums">
              {uncheckedSummary || `${uncheckedDraftCount}件`}
            </StatusLabel>
          ) : (
            <span className="text-[13px] text-text-muted">なし</span>
          )}
        </li>
      </ul>
      <p className="pt-2.5 text-[12px] leading-[17px] text-text-muted">下書きの問題は、現在公開中のデータに影響しません。</p>
    </Section>
  )
}

type Area = (typeof areas)[number]

function describeChange(area: Area, { draftCount, uncheckedCount, blockingCount, latestMapRevisionId }: OverviewAreaStatus) {
  const validationPath = `/validation?area=${area.kind}`
  if (blockingCount !== null && blockingCount > 0) {
    return {
      status: <StatusLabel tone="danger" className="whitespace-normal! tabular-nums">下書き {draftCount}件・公開できない問題 {blockingCount}件</StatusLabel>,
      action: '修正する',
      actionClass: 'text-danger',
      path: validationPath,
    }
  }
  if (uncheckedCount > 0) {
    return {
      status: (
        <StatusLabel tone="warning" className="whitespace-normal! tabular-nums">
          未チェック {uncheckedCount}件{draftCount > uncheckedCount && `（下書き ${draftCount}件）`}
        </StatusLabel>
      ),
      action: 'チェック',
      actionClass: 'text-text-secondary',
      path: validationPath,
    }
  }
  return {
    status: <span className="text-[13px] tabular-nums text-text-secondary">保存済みの下書き {draftCount}件</span>,
    action: '確認する',
    actionClass: 'text-text-secondary',
    path: area.kind === 'map' && latestMapRevisionId ? reviewPath('map', '', 'publish', latestMapRevisionId) : area.path,
  }
}

function UnpublishedChanges({ changes }: { changes: OverviewAreaStatus[] }) {
  return (
    <Section
      title="まだ公開していない変更"
      aside={<p className="text-[12px] leading-[17px] text-text-muted">次に公開されるとは限りません</p>}
    >
      <ul className="divide-y divide-border-subtle border-b border-border-subtle">
        {areas.map((area) => {
          const change = changes.find(({ targetKind }) => targetKind === area.kind)
          const row = change && change.draftCount > 0 ? describeChange(area, change) : null

          if (row) {
            return (
              <li key={area.kind}>
                <Link
                  to={row.path}
                  className={cn(unpublishedRowGridClass, 'rounded-sm transition-colors hover:bg-surface-hover', insetFocusClass)}
                >
                  <span className="text-text-primary">{area.label}</span>
                  <span className="min-w-0">{row.status}</span>
                  <span className={cn('inline-flex items-center gap-1 text-[13px] sm:justify-self-end', row.actionClass)}>
                    <span>{row.action}</span>
                    <span aria-hidden>→</span>
                  </span>
                </Link>
              </li>
            )
          }

          return (
            <li key={area.kind} className={unpublishedRowGridClass}>
              <span className="text-text-secondary">{area.label}</span>
              <span className="min-w-0">
                {change ? (
                  <span className="text-[13px] text-text-muted">変更なし</span>
                ) : (
                  <StatusLabel tone="neutral" className="whitespace-normal!">取得できません</StatusLabel>
                )}
              </span>
              <span aria-hidden className="text-[13px] text-text-muted sm:justify-self-end">—</span>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

const logActions: Record<string, string> = { publish: '公開', save: '下書き保存', import: '取り込み' }

function describeLogAction(log: LogItem) {
  if (log.action === 'publish' && log.status === 'succeeded' && log.detail) {
    return log.detail
      .split('・')
      .map((part) => (part === '取り下げ' ? actionVerbs.withdraw : part))
      .join('・')
  }
  return logActions[log.action] ?? 'その他の操作'
}

function LogStatus({ log }: { log: LogItem }) {
  switch (log.status) {
    case 'failed':
      return <StatusLabel tone="danger">失敗</StatusLabel>
    case 'processing':
      return <StatusLabel tone="warning">処理中</StatusLabel>
    case 'succeeded':
      if (log.action === 'save') return <span className="text-[12px] leading-[17px] text-text-muted">保存済み</span>
      return <StatusLabel tone="success" textTone="primary">{log.action === 'import' ? '完了' : '成功'}</StatusLabel>
    default:
      return <StatusLabel tone="neutral">結果不明</StatusLabel>
  }
}

function RecentLogs({ logs, campusToday }: { logs: OverviewResponse['recentLogs']; campusToday: string }) {
  return (
    <Section
      title="最近の操作"
      aside={(
        <Link to="/logs" className={`text-[12px] leading-[17px] ${brandLinkClass}`}>
          <span>操作記録を見る</span>
          <span aria-hidden>→</span>
        </Link>
      )}
    >
      {logs.length === 0 ? (
        <p className="border-b border-border-subtle py-3 text-[13px] text-text-secondary">操作記録はまだありません。</p>
      ) : (
        <ul className="divide-y divide-border-subtle border-b border-border-subtle">
          {logs.map((log) => {
            const target = log.targetLabel || kindNouns[log.targetKind as TargetKind] || '対象不明'

            return (
              <li key={log.id}>
                <Link
                  to={`/logs?id=${encodeURIComponent(log.id)}`}
                  className={cn(
                    'grid min-h-11 grid-cols-1 items-center gap-x-4 gap-y-1 rounded-sm px-1 py-2.5 transition-colors hover:bg-surface-hover min-[501px]:grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[88px_112px_minmax(0,1fr)_auto]',
                    insetFocusClass,
                  )}
                >
                  <time dateTime={log.startedAt} className="text-[13px] tabular-nums text-text-muted">
                    {formatRelativeTime(log.startedAt, campusToday)}
                  </time>
                  <span className="text-[13px] text-text-secondary">{describeLogAction(log)}</span>
                  <span className="min-w-0 wrap-anywhere">
                    <span className="text-text-primary">{target}</span>
                    {log.releaseSequence !== null && (
                      <span className="ml-2 text-[12px] tabular-nums text-text-muted">第{log.releaseSequence}版</span>
                    )}
                  </span>
                  <span className="justify-self-end"><LogStatus log={log} /></span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
