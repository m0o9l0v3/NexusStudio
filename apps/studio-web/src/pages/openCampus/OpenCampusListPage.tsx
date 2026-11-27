import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { listOccurrences } from '../../api/occurrences'
import { publicationBadge } from '../../publishing/publication'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StaleListNotice } from '../../ui/StaleListNotice'
import { StatusLabel } from '../../ui/StatusLabel'

const updatedFormat = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
function summarizeDays(days: { date: string }[]) {
  let previousMonth = ''
  return days.map(({ date }) => {
    const [, month, day] = date.split('-')
    const currentMonth = String(Number(month))
    const label = `${currentMonth === previousMonth ? '' : `${currentMonth}月`}${Number(day)}日`
    previousMonth = currentMonth
    return label
  }).join('・')
}
const grid = 'xl:grid xl:grid-cols-[minmax(0,3fr)_minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(120px,1.5fr)]'

export function OpenCampusListPage() {
  const navigate = useNavigate()
  const occurrences = useQuery({ queryKey: ['occurrences'], queryFn: listOccurrences })
  const retry = () => void occurrences.refetch()

  return <>
    <Toolbar
      title="オープンキャンパス"
      className="min-w-0 flex-wrap"
      headingClassName="basis-44"
      titleNode={
        <>
          オープンキャンパス
          {occurrences.data && (
            <span className="ml-2 text-[12px] font-normal text-text-muted tabular-nums">{occurrences.data.length}件</span>
          )}
        </>
      }
    >
      <Button className="ml-auto" onClick={() => void navigate('/open-campus/new')}><Plus aria-hidden size={15} />新規開催回</Button>
    </Toolbar>
    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas px-6 py-5">
      <p className="text-[13px] text-text-secondary">開催回ごとに、開催日・一般公開の時間・中止を管理します。</p>
      {occurrences.isError && occurrences.data && (
        <StaleListNotice listName="開催回一覧" updatedAt={occurrences.dataUpdatedAt} onRetry={retry} className="mt-4" />
      )}
      {occurrences.isPending ? (
        <p role="status" className="mt-4 text-text-secondary">開催回を読み込んでいます</p>
      ) : !occurrences.data ? (
        <NoticeBanner tone="blocking" className="mt-4">
          開催回を取得できませんでした。0件とは扱わず、再試行してください。{' '}
          <Button variant="secondary" onClick={retry}>再試行</Button>
        </NoticeBanner>
      ) : occurrences.data.length === 0 ? (
        <NoticeBanner className="mt-4">開催回は正式に0件です。新規開催回から下書きを作成できます。</NoticeBanner>
      ) : <div className="mt-4 min-w-0">
        <div aria-hidden className={`hidden border-b border-border-subtle px-1 py-2 text-[12px] text-text-muted ${grid}`}><span>開催回</span><span>開催日</span><span>関連イベント</span><span>状態</span><span className="pr-6 text-right">更新</span></div>
        <ul className="divide-y divide-border-subtle border-b border-border-subtle" aria-label="開催回一覧">{occurrences.data.map(item => {
          const badge = publicationBadge(item.publication)
          const cancelled = item.days.filter(day => day.status === 'cancelled').length
          return <li key={item.id}><Link to={`/open-campus/${item.id}`} className={`flex min-h-11 min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-1 py-2.5 wrap-anywhere hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${grid}`}>
            <span className="w-full min-w-0 xl:w-auto">{item.name.trim() || '無題の開催回'}</span>
            <span className="min-w-0 text-[13px] text-text-secondary tabular-nums">{item.days.length ? `${summarizeDays(item.days)}（${item.days.length}日）` : '開催日なし'}</span>
            <span className="text-[13px] text-text-secondary tabular-nums">{item.relatedEventCount}件</span>
            <span className="flex min-w-0 flex-wrap items-center gap-1"><StatusLabel tone={badge.tone}>{badge.label === '取り下げ済み' ? '公開停止' : badge.label}</StatusLabel>{cancelled > 0 && <span className="text-[12px] text-danger tabular-nums">· 中止 {cancelled}日</span>}</span>
            <span className="ml-auto flex items-center justify-end gap-2 text-[12px] text-text-muted tabular-nums">{item.updatedAt ? updatedFormat.format(new Date(item.updatedAt)) : '取り込み'}<ChevronRight aria-hidden size={14} /></span>
          </Link></li>
        })}</ul></div>}
      <p className="mt-3 text-[12px] text-text-muted">公開をやめた開催回も一覧に表示します。行をクリックすると編集画面を開きます。中止した開催日がある開催回は「中止 N日」と表示します。</p>
    </main>
  </>
}
