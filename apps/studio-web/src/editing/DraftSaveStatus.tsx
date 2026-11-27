import { cn } from '../ui/cn'

const clock = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
})

export function DraftSaveStatus({ label, dirty, updatedAt, className = 'text-[12px]' }: {
  label: string
  dirty: boolean
  updatedAt?: string | null
  className?: string
}) {
  return (
    <span role="status" className={cn('block text-text-muted tabular-nums', className)}>
      {label === '保存済み' && updatedAt && (
        <><time dateTime={updatedAt}>{clock.format(new Date(updatedAt))}</time>{' '}</>
      )}
      {label === '未保存' && dirty ? '未保存の変更があります' : label}
    </span>
  )
}
