import { Button } from './Button'
import { NoticeBanner } from './NoticeBanner'

const dateTime = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'long',
  timeStyle: 'short',
  hourCycle: 'h23',
  timeZone: 'Asia/Tokyo',
})

export function StaleListNotice({ listName, updatedAt, onRetry, className, conditions }: {
  listName: string
  updatedAt: number
  onRetry: () => void
  className?: string
  conditions?: { failed: string; shown: string }
}) {
  return (
    <NoticeBanner tone="warning" className={className}>
      最新の{listName}を取得できませんでした。前回の一覧を表示しています。
      {conditions && (
        <>
          <span className="block wrap-anywhere">取得に失敗した条件：{conditions.failed}</span>
          <span className="block wrap-anywhere">表示中の条件：{conditions.shown}</span>
        </>
      )}
      （取得時刻 <time className="tabular-nums" dateTime={new Date(updatedAt).toISOString()}>{dateTime.format(updatedAt)}</time> JST）{' '}
      <Button variant="secondary" className="mt-2" onClick={onRetry}>再試行</Button>
    </NoticeBanner>
  )
}
