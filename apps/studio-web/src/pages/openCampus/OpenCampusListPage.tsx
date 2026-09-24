import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { listOccurrences, type OccurrenceListItem } from '../../api/occurrences'
import { formatDateShort } from '../../events/model'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { publicationBadge } from '../../publishing/publication'
import { StatusBadge } from '../../ui/StatusBadge'

const updatedFormat = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

function summarize(item: OccurrenceListItem): string {
  if (item.days.length === 0) return '開催日なし'
  const cancelled = item.days.filter((day) => day.status === 'cancelled').length
  return `${item.days.map((day) => formatDateShort(day.date)).join('・')}${cancelled > 0 ? `｜開催日中止 ${cancelled}日` : ''}`
}

/**
 * Open Campus 一覧（08 OC-01）。Figmaには無い画面で、2026-09-24 に利用者が承認した構成案に従う。
 * 行の表現は Events 一覧（`Event List Row` 72:298）を流用する。
 */
export function OpenCampusListPage() {
  const navigate = useNavigate()
  const occurrences = useQuery({ queryKey: ['occurrences'], queryFn: listOccurrences })

  return (
    <>
      <Toolbar title="Open Campus" />
      <main className="min-h-0 flex-1 overflow-auto px-6 pt-[22px] pb-10">
        <div className="flex w-[1176px] max-w-full flex-col">
          <div className="flex w-[1020px] max-w-full items-start justify-between">
            <div>
              <h2 className="text-[22px] leading-[30px] font-bold text-text-primary">開催回</h2>
              <p className="text-[12px] leading-5 text-text-secondary">開催日・一般公開時間・中止を管理します</p>
            </div>
            <Button onClick={() => void navigate('/open-campus/new')}>新規開催回</Button>
          </div>

          <div aria-hidden className="mt-4 flex h-8 items-center gap-3 px-3.5 text-[11px] leading-[19px] text-text-secondary">
            <span className="w-[580px]">開催回</span>
            <span className="w-10">開催日</span>
            <span className="w-[50px]">関連</span>
            <span className="w-[150px]">状態</span>
            <span className="w-40">更新</span>
            <span className="w-[108px]">操作</span>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {occurrences.isPending ? (
              <p role="status" className="text-[12px] leading-5 text-text-secondary">
                開催回を読み込んでいます
              </p>
            ) : occurrences.isError ? (
              <NoticeBanner tone="blocking" className="w-[1020px] max-w-full">
                開催回を取得できませんでした。0件とは扱わず、再試行してください。
                <Button variant="secondary" className="ml-3" onClick={() => void occurrences.refetch()}>
                  再試行
                </Button>
              </NoticeBanner>
            ) : occurrences.data.length === 0 ? (
              <NoticeBanner className="w-[1020px] max-w-full">開催回は正式に0件です。新規開催回から下書きを作成できます。</NoticeBanner>
            ) : (
              <ul className="flex flex-col gap-4" aria-label="開催回一覧">
                {occurrences.data.map((item) => (
                  <li key={item.id} className="flex h-[72px] items-center gap-3 border border-border bg-surface px-3.5 py-3">
                    <div className="flex w-[580px] min-w-0 flex-col gap-[3px]">
                      <Link to={`/open-campus/${item.id}`} className="truncate text-[14px] leading-[22px] font-medium text-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-brand">
                        {item.name.trim() || '無題の開催回'}
                      </Link>
                      <p className="truncate text-[11px] leading-[19px] text-text-secondary">{summarize(item)}</p>
                    </div>
                    <p className="w-10 text-[12px] leading-5 text-text-secondary">{item.days.length}日</p>
                    <p className="w-[50px] text-[12px] leading-5 text-text-secondary">{item.relatedEventCount}件</p>
                    <div className="flex w-[150px] items-center">
                      <StatusBadge tone={publicationBadge(item.publication).tone}>{publicationBadge(item.publication).label}</StatusBadge>
                    </div>
                    <p className="w-40 text-[11px] leading-[19px] text-text-secondary">
                      {item.updatedAt ? `更新 ${updatedFormat.format(new Date(item.updatedAt))}` : '取り込み'}
                    </p>
                    <Link
                      to={`/open-campus/${item.id}`}
                      aria-label={`${item.name.trim() || '無題の開催回'}を編集`}
                      className="flex h-10 w-[108px] items-center justify-center rounded-lg border border-border bg-surface text-[14px] leading-[22px] font-medium text-text-primary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      編集 →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
