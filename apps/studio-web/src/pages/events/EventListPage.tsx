import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { listEvents, type EventListItem } from '../../api/events'
import { getReference } from '../../api/reference'
import { formatDateShort, indexReference } from '../../events/model'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusBadge } from '../../ui/StatusBadge'

const publicationLabels: Record<string, { label: string; tone: 'neutral' | 'success' }> = {
  unpublished: { label: '未公開', tone: 'neutral' },
  published: { label: '公開中', tone: 'success' },
  changed: { label: '公開中・未公開変更あり', tone: 'success' },
}

const updatedFormat = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

/** 一覧の要約：単一枠なら日付と時刻、複数枠なら日付の並び（07 §4.1、Figma E01）。 */
function summarize(item: EventListItem): string {
  const dated = item.slots.filter((slot) => slot.date)
  if (dated.length === 0) return item.slotCount === 0 ? '開催枠なし' : '開催日未選択'
  if (item.slots.length === 1) {
    const [slot] = item.slots
    const time = slot.timeMode === 'allDay' ? '終日' : slot.timeMode === 'fixed' ? `${slot.start ?? '--:--'}–${slot.end ?? '--:--'}` : '時間未選択'
    return `${formatDateShort(slot.date!)} ${time}`
  }
  return [...new Set(dated.map((slot) => formatDateShort(slot.date!)))].join('・')
}

/** Figma E01「Events 一覧」（11:2）と状態 E33〜E37。 */
export function EventListPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const occurrenceId = params.get('occurrenceId') ?? ''
  const publication = params.get('publication') ?? ''
  const sort = (params.get('sort') as 'updated' | 'schedule' | null) ?? 'updated'
  const deferredQ = useDeferredValue(q)

  const events = useQuery({
    queryKey: ['events', { q: deferredQ, occurrenceId, publication, sort }],
    queryFn: () => listEvents({ q: deferredQ, occurrenceId, publication, sort }),
    placeholderData: keepPreviousData,
  })
  const reference = useQuery({ queryKey: ['reference'], queryFn: getReference })
  const occurrences = useMemo(() => indexReference(reference.data).occurrences, [reference.data])
  const filtered = Boolean(q || occurrenceId || publication)

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <>
      <Toolbar title="Events" />
      <main className="min-h-0 flex-1 overflow-auto px-6 pt-[22px] pb-10">
        <div className="flex w-[1176px] max-w-full flex-col">
          <div className="flex w-[1020px] max-w-full items-start justify-between">
            <div>
              <h2 className="text-[22px] leading-[30px] font-bold text-text-primary">イベント</h2>
              <p className="text-[12px] leading-5 text-text-secondary">開催枠・会場・公開状態を確認します</p>
            </div>
            <Button onClick={() => void navigate('/events/new')}>新規イベント</Button>
          </div>

          <div className="mt-4 flex items-center gap-2" role="search">
            <label className="sr-only" htmlFor="event-search">
              タイトルで検索
            </label>
            <input
              id="event-search"
              type="search"
              value={q}
              onChange={(event) => update('q', event.target.value)}
              placeholder="タイトルを検索"
              className="h-10 w-[520px] rounded-lg border border-border bg-surface px-3 text-[13px] leading-[21px] text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
            />
            <FilterChip label="開催回" value={occurrenceId} onChange={(value) => update('occurrenceId', value)}>
              <option value="">開催回：すべて</option>
              {occurrences.map((occurrence) => (
                <option key={occurrence.id} value={occurrence.id}>
                  開催回：{occurrence.name}
                </option>
              ))}
            </FilterChip>
            <FilterChip label="公開状態" value={publication} onChange={(value) => update('publication', value)}>
              <option value="">公開状態：すべて</option>
              <option value="unpublished">公開状態：未公開</option>
            </FilterChip>
            <FilterChip label="並べ替え" value={sort} active={sort !== 'updated'} onChange={(value) => update('sort', value === 'updated' ? '' : value)}>
              <option value="updated">更新日時順</option>
              <option value="schedule">開催日時順</option>
            </FilterChip>
          </div>

          <div aria-hidden className="mt-4 flex h-8 items-center gap-3 px-3.5 text-[11px] leading-[19px] text-text-secondary">
            <span className="w-[580px]">イベント</span>
            <span className="w-10">枠</span>
            <span className="w-[50px]">会場</span>
            <span className="w-[150px]">状態</span>
            <span className="w-40">更新</span>
            <span className="w-[108px]">操作</span>
          </div>

          <div className="mt-4 flex flex-col gap-4" aria-busy={events.isFetching || undefined}>
            {events.isPending ? (
              <LoadingRows />
            ) : events.isError && !events.data ? (
              <NoticeBanner tone="blocking" className="w-[1020px] max-w-full">
                イベント一覧を取得できませんでした。0件とは扱わず、再試行してください。
                <Button variant="secondary" className="ml-3" onClick={() => void events.refetch()}>
                  再試行
                </Button>
              </NoticeBanner>
            ) : events.data.length === 0 ? (
              filtered ? (
                <NoticeBanner className="w-[1020px] max-w-full">
                  検索・絞り込みに一致するイベントはありません。条件を解除できます。
                  <Button variant="secondary" className="ml-3" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                    条件を解除
                  </Button>
                </NoticeBanner>
              ) : (
                <NoticeBanner className="w-[1020px] max-w-full">イベントは正式に0件です。新規イベントから下書きを作成できます。</NoticeBanner>
              )
            ) : (
              <ul className="flex flex-col gap-4" aria-label="イベント一覧">
                {events.data.map((item) => (
                  <EventRow key={item.id} item={item} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  )
}

function FilterChip({ label, value, active, onChange, children }: { label: string; value: string; active?: boolean; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'field-sizing-content h-[25px] max-w-[280px] cursor-pointer appearance-none truncate rounded-full px-2.5 text-[11px] leading-[19px] font-medium',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
        (active ?? Boolean(value)) ? 'bg-brand-subtle text-brand' : 'bg-surface-subtle text-text-secondary',
      )}
    >
      {children}
    </select>
  )
}

/** Figma `Event List Row`（72:298）。 */
function EventRow({ item }: { item: EventListItem }) {
  const status = publicationLabels[item.publication] ?? { label: item.publication, tone: 'neutral' as const }
  return (
    <li className="flex h-[72px] items-center gap-3 border border-border bg-surface px-3.5 py-3">
      <div className="flex w-[580px] min-w-0 flex-col gap-[3px]">
        <Link
          to={`/events/${item.id}`}
          className="truncate text-[14px] leading-[22px] font-medium text-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-brand"
        >
          {item.title?.trim() || '無題のイベント'}
        </Link>
        <p className="truncate text-[11px] leading-[19px] text-text-secondary">{summarize(item)}</p>
      </div>
      <p className="w-10 text-[12px] leading-5 text-text-secondary">{item.slotCount}枠</p>
      <p className="w-[50px] text-[12px] leading-5 text-text-secondary">{item.venueCount}会場</p>
      <div className="flex w-[150px] items-center">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      <p className="relative w-40 text-[11px] leading-[19px] text-text-secondary">
        更新 {updatedFormat.format(new Date(item.updatedAt))}
        <span className="sr-only">（{item.updatedBy.displayName}）</span>
      </p>
      <Link
        to={`/events/${item.id}`}
        aria-label={`${item.title?.trim() || '無題のイベント'}を編集`}
        className="flex h-10 w-[108px] items-center justify-center rounded-lg border border-border bg-surface text-[14px] leading-[22px] font-medium text-text-primary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        編集 →
      </Link>
    </li>
  )
}

/** Figma `Event List Loading Row`（95:1798）。 */
function LoadingRows() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <p className="text-[12px] leading-5 text-text-secondary">イベント一覧を読み込んでいます</p>
      {[0, 1, 2].map((key) => (
        <div key={key} aria-hidden className="h-14 w-[1176px] max-w-full animate-pulse rounded-lg bg-surface-subtle" />
      ))}
    </div>
  )
}
