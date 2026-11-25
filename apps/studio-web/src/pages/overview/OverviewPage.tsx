import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronDown, ChevronRight, CircleDashed, RefreshCw, Save } from 'lucide-react'
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
import { PageSheet } from '../../ui/PageSheet'
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

const dashedCircle = <CircleDashed size={16} strokeWidth={1.5} />
const saveIcon = <Save size={16} strokeWidth={1.5} />
const cardClass = 'rounded-[10px] border border-border'
const dividedCardClass = `${cardClass} divide-y divide-border`
const noteClass = 'text-[13px] leading-[18px] text-text-secondary'
const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
const textLinkClass = `inline-flex items-center gap-1 rounded-sm text-brand hover:underline ${focusClass}`

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
        className="max-[500px]:flex-wrap max-[500px]:gap-y-1"
        titleNode={(
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
            <span>ホーム</span>
            {data && occurrence && (
              <span className="relative inline-flex min-w-0 max-w-full px-0.5">
                <select
                  aria-label="公開中の開催回を切り替える"
                  value={occurrence.id}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className={`h-7 min-w-0 max-w-full appearance-none truncate rounded-md border border-border-input bg-surface pl-2.5 pr-7 text-sm font-normal ${focusClass}`}
                >
                  {data.publishedOccurrences.map(({ id, name }) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden size={16} strokeWidth={1.5} className="pointer-events-none absolute top-1.5 right-2 text-text-secondary" />
              </span>
            )}
          </span>
        )}
      >
        <div className="flex shrink-0 items-center gap-2 max-[500px]:basis-full">
          {data && (
            <span className={noteClass}>
              最終更新 <time dateTime={data.generatedAt}>{clock.format(new Date(data.generatedAt))}</time>
            </span>
          )}
          <Button variant="secondary" size="sm" className="w-7 px-0" aria-label="最新の状態に更新" onClick={refresh} disabled={overview.isFetching}>
            <RefreshCw aria-hidden size={16} strokeWidth={1.5} className={overview.isFetching ? 'motion-safe:animate-spin' : undefined} />
          </Button>
        </div>
      </Toolbar>
      <PageSheet className="max-[500px]:mx-2">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[1160px] flex-col gap-6 px-3 py-5 text-sm max-[500px]:wrap-anywhere sm:px-6 xl:px-7 xl:py-6">
            {overview.isPending && <p role="status" className="text-text-secondary">ホームを読み込んでいます。</p>}
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
                <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                  <OccurrenceSchedule occurrence={occurrence} campusToday={data.campusToday} />
                  <DataHealth health={data.dataHealth} campusToday={data.campusToday} />
                </div>
                <UnpublishedChanges changes={data.unpublishedChanges} />
                <RecentLogs logs={data.recentLogs} campusToday={data.campusToday} />
              </>
            )}
          </div>
        </div>
      </PageSheet>
    </>
  )
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[17px] leading-[23px] font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function describeReleaseEntry({ targetKind, action, count }: OverviewReleaseKindCount) {
  const noun = kindNouns[targetKind as TargetKind] ?? 'その他'
  const target = targetKind === 'categories' && count === 1 ? noun : `${noun}${count}件`
  if (action === 'withdraw') return `${target}（${actionVerbs.withdraw}）`
  if (action === 'restore') return `${target}（${actionVerbs.restore}）`
  return target
}

function CurrentRelease({ release }: { release: OverviewRelease | null }) {
  return (
    <Section title="いま公開中の版">
      {release ? (
        <Link
          to={`/releases?id=${encodeURIComponent(release.releaseId)}`}
          className={`${cardClass} ${focusClass} group flex min-h-[54px] flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 hover:bg-black/[0.03] active:bg-black/[0.06]`}
        >
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <strong className="font-medium group-hover:underline">第{release.sequence}版</strong>
            <span className="text-xs text-text-secondary">release-{release.sequence}</span>
          </span>
          <StatusLabel tone="success">公開中</StatusLabel>
          <span className="text-text-secondary">
            公開日時 <time dateTime={release.publishedAt}>{fullDateTime.format(new Date(release.publishedAt))}</time>（日本時間）
          </span>
          <span className="text-text-secondary">
            公開したもの：{release.entrySummary.map(describeReleaseEntry).join('・') || 'なし'}
          </span>
          {release.previousSequence !== null && (
            <span className="text-text-secondary">元にした版：第{release.previousSequence}版</span>
          )}
        </Link>
      ) : (
        <div className={`${cardClass} flex min-h-[54px] flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2`}>
          <StatusLabel icon={dashedCircle} className="whitespace-normal!">まだ公開されていません</StatusLabel>
          <p className={noteClass}>公開すると、ここに版と公開内容が表示されます。</p>
        </div>
      )}
    </Section>
  )
}

function OccurrenceSchedule({ occurrence, campusToday }: { occurrence?: OverviewOccurrence; campusToday: string }) {
  return (
    <Section
      title="開催情報"
      aside={occurrence ? <StatusLabel tone="success">公開中</StatusLabel> : <StatusLabel icon={dashedCircle}>未公開</StatusLabel>}
    >
      {occurrence && occurrence.days.length > 0 ? (
        <ul className={dividedCardClass}>
          {occurrence.days.map((day) => {
            const cancelled = day.status === 'cancelled'
            return (
              <li key={day.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <div className="flex min-w-24 flex-wrap items-center gap-1.5">
                  <time dateTime={day.date}>{formatDateLong(day.date)}</time>
                  {day.date === campusToday && <Badge tone="info">今日</Badge>}
                </div>
                <span className="flex-1">{formatHours(day) ?? '開催時間未登録'}</span>
                <StatusLabel tone={cancelled ? 'danger' : 'success'}>{cancelled ? '中止' : '予定どおり'}</StatusLabel>
                {cancelled && day.cancelNote && <p className={`basis-full wrap-anywhere ${noteClass}`}>{day.cancelNote}</p>}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className={`${cardClass} flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-3`}>
          <p>{occurrence ? '公開中の開催日はありません。' : '公開中のオープンキャンパスはありません'}</p>
          <Link to="/open-campus" className={textLinkClass}>オープンキャンパスを見る</Link>
        </div>
      )}
      <p className={noteClass}>「今日」かどうかは、実際の日付と公開済みの開催日で判断します。</p>
    </Section>
  )
}

function DiagnosisStatus({ health }: { health: OverviewDataHealth }) {
  const { diagnosisStatus, totalBlockingCount, totalWarningCount } = health
  const stale = diagnosisStatus === 'stale'
  const age = stale ? '（古い結果）' : ''

  if (diagnosisStatus === 'neverRun') return <StatusLabel icon={dashedCircle}>未チェック</StatusLabel>
  if (diagnosisStatus === 'failed') return <StatusLabel tone="danger">チェック失敗</StatusLabel>
  if (totalBlockingCount !== null && totalBlockingCount > 0) {
    return <StatusLabel tone="danger" className="whitespace-normal!">公開できない問題 {totalBlockingCount}件{age}</StatusLabel>
  }
  if (totalWarningCount !== null && totalWarningCount > 0) {
    return <StatusLabel tone="warning" className="whitespace-normal!">要確認 {totalWarningCount}件{age}</StatusLabel>
  }
  if (stale) return <StatusLabel tone="warning">結果が古い</StatusLabel>
  if (diagnosisStatus === 'ok' && totalBlockingCount === 0 && totalWarningCount === 0) {
    return <StatusLabel tone="success">問題なし</StatusLabel>
  }
  return <StatusLabel icon={dashedCircle}>結果不明</StatusLabel>
}

function HealthRow({ title, detail, status }: { title: string; detail: string; status: ReactNode }) {
  return (
    <li className="flex min-h-11 items-center gap-3 px-3 py-2 max-[500px]:flex-col max-[500px]:items-start max-[500px]:gap-1">
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="xl:w-[156px]">{title}</span>
        <span className="text-text-secondary">{detail}</span>
      </div>
      <div className="max-w-full min-[501px]:max-w-[60%]">{status}</div>
    </li>
  )
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
      aside={(
        <span className={noteClass}>
          最終チェック {lastCheckedAt ? (
            <time dateTime={lastCheckedAt}>{formatRelativeTime(lastCheckedAt, campusToday)}</time>
          ) : '未実施'}
        </span>
      )}
    >
      <h3 className="text-xs font-bold text-text-secondary">公開中のデータ</h3>
      <ul className={cardClass}>
        <HealthRow
          title="いま公開中の版"
          detail={hasPublishedRelease ? '公開前チェック済み' : 'まだ公開されていません'}
          status={hasPublishedRelease ? <StatusLabel tone="success">問題なし</StatusLabel> : <StatusLabel icon={dashedCircle}>未公開</StatusLabel>}
        />
      </ul>
      <h3 className="text-xs font-bold text-text-secondary">下書き</h3>
      <ul className={dividedCardClass}>
        <HealthRow
          title="すべての下書き"
          detail={includesMap ? '地図を含む' : '公開前チェックの結果'}
          status={<DiagnosisStatus health={health} />}
        />
        <HealthRow
          title="未チェックの下書き"
          detail={unchecked ? uncheckedSummary || `${uncheckedDraftCount}件` : 'なし'}
          status={unchecked ? <StatusLabel tone="warning" icon={dashedCircle}>未チェック</StatusLabel> : <StatusLabel>なし</StatusLabel>}
        />
      </ul>
      <p className={noteClass}>下書きに問題があっても、公開中のデータに問題があるわけではありません。</p>
    </Section>
  )
}

type Area = (typeof areas)[number]

function describeChange(area: Area, { draftCount, uncheckedCount, blockingCount, latestMapRevisionId }: OverviewAreaStatus) {
  const validationPath = `/validation?area=${area.kind}`
  if (blockingCount !== null && blockingCount > 0) {
    return {
      status: <StatusLabel tone="danger" className="whitespace-normal!">下書き {draftCount}件・公開できない問題 {blockingCount}件</StatusLabel>,
      action: '修正する',
      path: validationPath,
    }
  }
  if (uncheckedCount > 0) {
    return {
      status: (
        <StatusLabel tone="warning" icon={dashedCircle} className="whitespace-normal!">
          未チェック {uncheckedCount}件{draftCount > uncheckedCount && `（下書き ${draftCount}件）`}
        </StatusLabel>
      ),
      action: 'チェックする',
      path: validationPath,
    }
  }
  return {
    status: <StatusLabel icon={saveIcon} className="whitespace-normal!">保存した下書き {draftCount}件</StatusLabel>,
    action: '確認する',
    path: area.kind === 'map' && latestMapRevisionId ? reviewPath('map', '', 'publish', latestMapRevisionId) : area.path,
  }
}

function UnpublishedChanges({ changes }: { changes: OverviewAreaStatus[] }) {
  return (
    <Section title="まだ公開していない変更" aside={<p className={noteClass}>次に公開されるものとは限りません</p>}>
      <div className={`${cardClass} overflow-hidden`}>
        <table className="w-full table-fixed text-left">
          <thead className="text-[13px] text-text-secondary">
            <tr>
              <th scope="col" className="h-9 w-[32%] px-3 py-1 font-medium lg:w-[212px]">項目</th>
              <th scope="col" className="pr-3 font-medium">状態と次にすること</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => {
              const change = changes.find(({ targetKind }) => targetKind === area.kind)
              const row = change && change.draftCount > 0 ? describeChange(area, change) : null

              return (
                <tr
                  key={area.kind}
                  className={cn('relative border-t border-border', row && 'hover:bg-black/[0.03] active:bg-black/[0.06]')}
                >
                  <th scope="row" className="h-12 px-3 py-2 font-normal">{area.label}</th>
                  <td className="py-2 pr-3">
                    {row ? (
                      <div className="flex items-center gap-2 max-[500px]:flex-col max-[500px]:items-start">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                          <div className="max-w-full">{row.status}</div>
                          <Link
                            to={row.path}
                            aria-label={`${area.label}の下書きを${row.action}`}
                            className={`relative z-10 inline-flex min-h-7 items-center rounded-md bg-brand-subtle px-2.5 font-medium text-brand hover:bg-brand-subtle/75 ${focusClass}`}
                          >
                            {row.action}
                          </Link>
                        </div>
                        {/* 矢印リンクの当たり判定を行全体に広げ、アクションリンクはその手前に置く。 */}
                        <Link
                          to={area.path}
                          aria-label={`${area.label}を開く`}
                          className="shrink-0 self-end text-text-secondary outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand min-[501px]:self-center"
                        >
                          <ChevronRight aria-hidden size={16} strokeWidth={1.5} />
                        </Link>
                      </div>
                    ) : change ? <StatusLabel>変更なし</StatusLabel> : (
                      <StatusLabel icon={dashedCircle} className="whitespace-normal!">取得できません</StatusLabel>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

const logActions: Record<string, string> = { publish: '公開', save: '下書きを保存', import: '取り込み' }

function LogStatus({ log }: { log: LogItem }) {
  switch (log.status) {
    case 'failed':
      return <StatusLabel tone="danger">失敗</StatusLabel>
    case 'processing':
      return <StatusLabel tone="warning">処理中</StatusLabel>
    case 'succeeded':
      if (log.action === 'save') return <StatusLabel icon={saveIcon}>保存済み</StatusLabel>
      return <StatusLabel tone="success">{log.action === 'import' ? '完了' : '成功'}</StatusLabel>
    default:
      return <StatusLabel icon={dashedCircle}>結果不明</StatusLabel>
  }
}

function RecentLogs({ logs, campusToday }: { logs: OverviewResponse['recentLogs']; campusToday: string }) {
  return (
    <Section
      title="最近の操作"
      aside={(
        <Link to="/logs" className={textLinkClass}>
          操作記録で見る <ArrowRight aria-hidden size={16} strokeWidth={1.5} />
        </Link>
      )}
    >
      {logs.length === 0 ? (
        <p className={`${cardClass} px-3 py-3`}>操作記録はまだありません。</p>
      ) : (
        <ul className={dividedCardClass}>
          {logs.map((log) => {
            const target = log.targetLabel || log.targetId || kindNouns[log.targetKind as TargetKind] || '対象不明'
            const version = log.releaseSequence !== null ? `（第${log.releaseSequence}版）` : log.action === 'save' ? '（下書き）' : ''

            return (
              <li key={log.id}>
                <Link
                  to={`/logs?id=${encodeURIComponent(log.id)}`}
                  className="grid min-h-11 grid-cols-1 items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-black/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand active:bg-black/[0.06] min-[501px]:grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[80px_112px_minmax(0,1fr)_auto]"
                >
                  <time dateTime={log.startedAt} className={noteClass}>{formatRelativeTime(log.startedAt, campusToday)}</time>
                  <span>{logActions[log.action] ?? 'その他の操作'}</span>
                  <span className="wrap-anywhere">{target}{version}</span>
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
