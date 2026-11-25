import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarX, ChevronDown, ChevronRight, CircleDashed, Minus, Pencil, Plus, Search } from 'lucide-react'
import { useDeferredValue, useMemo, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { listEvents, type EventListItem } from '../../api/events'
import { getReference } from '../../api/reference'
import { formatDateLong, indexReference } from '../../events/model'
import { publicationBadge } from '../../publishing/publication'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { PageSheet } from '../../ui/PageSheet'
import { StatusLabel } from '../../ui/StatusLabel'

const updatedFormat = new Intl.DateTimeFormat('ja-JP', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
  hourCycle: 'h23',
})

const publicationOptions = ['unpublished', 'published', 'publishedWithChanges', 'withdrawn'] as const

const pencilIcon = <Pencil size={16} strokeWidth={1.5} />
const dashedCircleIcon = <CircleDashed size={16} strokeWidth={1.5} />
const minusIcon = <Minus size={16} strokeWidth={1.5} />
const calendarXIcon = <CalendarX size={16} strokeWidth={1.5} />

const rowGridClass =
  'xl:grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(180px,1.25fr)_92px_108px] xl:items-center xl:gap-x-3'

function parseIsoDate(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

function formatUniqueDates(dates: string[]): string {
  const sorted = [...new Set(dates)].sort((a, b) => a.localeCompare(b))
  let prevYear: number | null = null
  let prevMonth: number | null = null
  return sorted
    .map((iso) => {
      const { year, month, day } = parseIsoDate(iso)
      const label = prevYear === year && prevMonth === month ? `${day}日` : `${month}月${day}日`
      prevYear = year
      prevMonth = month
      return label
    })
    .join('・')
}

/** 開催日時の要約：単一枠なら日付と時刻、複数枠なら昇順の日付列と回数（07 §4.1、Figma v2 E01）。 */
function summarizeSchedule(item: EventListItem): string {
  if (item.slotCount === 0) return '日時なし'
  const dated = item.slots.filter((slot): slot is EventListItem['slots'][number] & { date: string } => Boolean(slot.date))
  if (dated.length === 0) {
    return item.slotCount > 1 ? `日付未選択（${item.slotCount}回）` : '日付未選択'
  }
  if (item.slots.length === 1) {
    const [slot] = dated
    const date = formatDateLong(slot.date)
    const time =
      slot.timeMode === 'allDay'
        ? '終日'
        : slot.timeMode === 'fixed'
          ? `${slot.start ?? '--:--'}–${slot.end ?? '--:--'}`
          : '時間未選択'
    return `${date} ${time}`
  }
  return `${formatUniqueDates(dated.map((slot) => slot.date))}（${item.slotCount}回）`
}

/** 会場の要約：先頭会場名と残りか所数（07 §4.1、Figma v2 E01）。 */
function summarizeVenue(item: EventListItem): string {
  if (item.venueCount === 0) return '会場なし'
  const primary = item.primaryVenueName?.trim()
  if (item.venueCount === 1) return primary || '1か所'
  return primary ? `${primary} ほか${item.venueCount - 1}か所` : `${item.venueCount}か所`
}

/** Figma v2 E01「イベント一覧」（61:503）。 */
export function EventListPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const occurrenceId = params.get('occurrenceId') ?? ''
  const publication = params.get('publication') ?? ''
  const sort: 'updated' | 'schedule' = params.get('sort') === 'schedule' ? 'schedule' : 'updated'
  const deferredQ = useDeferredValue(q)

  const events = useQuery({
    queryKey: ['events', { q: deferredQ, occurrenceId, publication, sort }],
    queryFn: () => listEvents({ q: deferredQ, occurrenceId, publication, sort }),
    placeholderData: keepPreviousData,
  })
  const reference = useQuery({ queryKey: ['reference'], queryFn: getReference })
  const occurrences = useMemo(() => indexReference(reference.data).occurrences, [reference.data])
  const filtered = Boolean(q || occurrenceId || publication)
  const failed = events.isError && (!events.data || events.isPlaceholderData)
  const staleRetained = events.isError && Boolean(events.data) && !events.isPlaceholderData
  const rows = failed ? [] : (events.data ?? [])

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const retry = () => {
    void events.refetch({ cancelRefetch: false })
  }

  return (
    <>
      <Toolbar title="イベント" className="max-[500px]:flex-wrap max-[500px]:gap-y-1.5">
        <div className="flex shrink-0 flex-wrap items-center gap-2 max-[500px]:basis-full">
          <Button variant="secondary" onClick={() => void navigate('/events/categories')}>
            カテゴリを管理
          </Button>
          <Button onClick={() => void navigate('/events/new')}>
            <Plus aria-hidden size={16} strokeWidth={1.75} />
            新規イベント
          </Button>
        </div>
      </Toolbar>
      <PageSheet className="max-[500px]:mx-2">
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1160px] flex-col px-3 py-5 text-sm sm:px-6 xl:px-7 xl:py-6">
            <div className="flex flex-wrap items-center gap-2" role="search">
              <div className="relative w-full sm:min-w-[220px] sm:flex-1 sm:max-w-[340px]">
                <label className="sr-only" htmlFor="event-search">
                  タイトルで検索
                </label>
                <Search
                  aria-hidden
                  size={16}
                  strokeWidth={1.5}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-secondary"
                />
                <input
                  id="event-search"
                  type="search"
                  value={q}
                  onChange={(event) => update('q', event.target.value)}
                  placeholder="タイトルで検索"
                  className="h-9 w-full rounded-md border border-border-input bg-surface pr-3 pl-9 text-[13px] leading-5 text-text-primary placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                />
              </div>
              <FilterSelect label="オープンキャンパス" value={occurrenceId} onChange={(value) => update('occurrenceId', value)}>
                <option value="">オープンキャンパス：すべて</option>
                {occurrences.map((occurrence) => (
                  <option key={occurrence.id} value={occurrence.id}>
                    オープンキャンパス：{occurrence.name}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="公開状態"
                value={publication}
                describedBy="event-list-withdrawn-note"
                onChange={(value) => update('publication', value)}
              >
                <option value="">公開状態：すべて</option>
                {publicationOptions.map((state) => (
                  <option key={state} value={state}>
                    公開状態：{publicationBadge(state).label}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="並べ替え"
                value={sort}
                active={sort !== 'updated'}
                onChange={(value) => update('sort', value === 'updated' ? '' : value)}
              >
                <option value="updated">並べ替え：更新日時順</option>
                <option value="schedule">並べ替え：開催日時順</option>
              </FilterSelect>
            </div>

            <div aria-busy={events.isFetching || undefined}>
              {staleRetained && (
                <NoticeBanner tone="warning" className="mt-4">
                  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span>最新のイベント一覧を取得できませんでした。以前取得した一覧を表示しています。</span>
                    <Button variant="secondary" size="sm" onClick={retry} disabled={events.isFetching}>
                      再試行
                    </Button>
                  </span>
                </NoticeBanner>
              )}

              {events.isPending ? (
                <LoadingRows />
              ) : failed ? (
                <NoticeBanner tone="blocking" className="mt-4">
                  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span>イベント一覧を取得できませんでした。0件とは扱わず、再試行してください。</span>
                    <Button variant="secondary" size="sm" onClick={retry} disabled={events.isFetching}>
                      再試行
                    </Button>
                  </span>
                </NoticeBanner>
              ) : events.isPlaceholderData && rows.length === 0 ? (
                <LoadingRows />
              ) : rows.length === 0 ? (
                filtered ? (
                  <NoticeBanner className="mt-4">
                    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span>検索・絞り込みに一致するイベントはありません。条件を解除できます。</span>
                      <Button variant="secondary" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                        条件を解除
                      </Button>
                    </span>
                  </NoticeBanner>
                ) : (
                  <NoticeBanner className="mt-4">イベントは正式に0件です。新規イベントから下書きを作成できます。</NoticeBanner>
                )
              ) : (
                <div className="mt-4 overflow-hidden rounded-[10px] border border-border bg-surface">
                  <div
                    aria-hidden
                    className={cn(
                      'hidden border-b border-border px-4 py-2.5 text-xs font-medium text-text-secondary',
                      rowGridClass,
                    )}
                  >
                    <span>イベント名</span>
                    <span>開催日時</span>
                    <span>会場</span>
                    <span>状態</span>
                    <span>最終更新</span>
                    <span />
                  </div>
                  <ul className="divide-y divide-border" aria-label="イベント一覧">
                    {rows.map((item) => (
                      <EventRow key={item.id} item={item} />
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <p id="event-list-withdrawn-note" className="mt-3 text-[12px] leading-5 text-text-secondary">
              公開をやめたイベントは、「公開状態」で選ぶと表示されます。
            </p>
          </div>
        </main>
      </PageSheet>
    </>
  )
}

type FilterSelectProps = {
  label: string
  value: string
  active?: boolean
  describedBy?: string
  onChange: (value: string) => void
  children: ReactNode
}

function FilterSelect({ label, value, active, describedBy, onChange, children }: FilterSelectProps) {
  const selected = active ?? Boolean(value)
  return (
    <span className="relative inline-flex max-w-full shrink-0 sm:max-w-[300px]">
      <select
        aria-label={label}
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'field-sizing-content h-9 max-w-full cursor-pointer appearance-none truncate rounded-md border pr-8 pl-3 text-[13px] leading-5 transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
          selected
            ? 'border-brand bg-brand-subtle/50 font-medium text-brand-nav-text hover:bg-brand-subtle/80'
            : 'border-border-input bg-surface text-text-primary hover:bg-surface-subtle',
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        size={16}
        strokeWidth={1.5}
        className={cn(
          'pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2',
          selected ? 'text-brand-nav-text' : 'text-text-secondary',
        )}
      />
    </span>
  )
}

function PublicationStatus({ state }: { state: string }) {
  switch (state) {
    case 'published':
      return <StatusLabel tone="success">公開中</StatusLabel>
    case 'publishedWithChanges':
      return (
        <StatusLabel tone="warning" icon={pencilIcon}>
          公開中・変更あり
        </StatusLabel>
      )
    case 'withdrawn':
      return (
        <StatusLabel tone="neutral" icon={minusIcon}>
          公開停止
        </StatusLabel>
      )
    default:
      return (
        <StatusLabel tone="neutral" icon={dashedCircleIcon}>
          未公開
        </StatusLabel>
      )
  }
}

/** 実効的な開催状況：枠独自の中止と開催日の中止を合算して算出する（07 EV-09）。 */
function CancellationStatus({ item }: { item: EventListItem }) {
  const cancelled = item.slots.filter((slot) => slot.status === 'cancelled' || slot.dayCancelled).length
  if (cancelled === 0) return null
  if (item.slots.length > 0 && cancelled === item.slots.length) {
    return (
      <StatusLabel tone="danger" icon={calendarXIcon}>
        すべて中止
      </StatusLabel>
    )
  }
  return (
    <StatusLabel tone="warning" icon={calendarXIcon}>
      一部中止<span className="sr-only">（{cancelled}回中止）</span>
    </StatusLabel>
  )
}

/** Figma v2 `イベント / 一覧の行`。1280px未満では1段目にイベント名、2段目に開催日時・会場・状態・最終更新・編集を折り返す。 */
function EventRow({ item }: { item: EventListItem }) {
  const title = item.title?.trim() || '無題のイベント'
  return (
    <li>
      <Link
        to={`/events/${item.id}`}
        className={cn(
          'group flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors',
          'hover:bg-black/[0.03] active:bg-black/[0.06]',
          'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand',
          rowGridClass,
        )}
      >
        <span className="w-full min-w-0 break-words text-[14px] leading-5 font-medium text-text-primary xl:w-auto">
          {title}
        </span>
        <span className="min-w-0 break-words text-[13px] leading-5 text-text-secondary">{summarizeSchedule(item)}</span>
        <span className="min-w-0 break-words text-[13px] leading-5 text-text-secondary">{summarizeVenue(item)}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <PublicationStatus state={item.publication} />
          <CancellationStatus item={item} />
        </span>
        <span className="text-[13px] leading-5 text-text-secondary tabular-nums">
          <time dateTime={item.updatedAt}>{updatedFormat.format(new Date(item.updatedAt))}</time>
          <span className="sr-only">（{item.updatedBy.displayName}）</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center justify-end gap-2 xl:ml-0">
          <span className="inline-flex h-7 items-center rounded-md bg-brand-subtle px-2.5 text-[12px] font-medium whitespace-nowrap text-brand group-hover:bg-brand-subtle/75">
            編集する
          </span>
          <ChevronRight aria-hidden size={16} strokeWidth={1.5} className="text-text-secondary" />
        </span>
      </Link>
    </li>
  )
}

function LoadingRows() {
  return (
    <div role="status" className="mt-4 overflow-hidden rounded-[10px] border border-border bg-surface">
      <p className="border-b border-border px-4 py-2.5 text-[12px] leading-5 text-text-secondary">
        イベント一覧を読み込んでいます
      </p>
      <div aria-hidden className="divide-y divide-border">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="flex min-h-14 items-center gap-4 px-4 py-3">
            <div className="h-4 w-48 max-w-[45%] rounded bg-surface-subtle motion-safe:animate-pulse" />
            <div className="hidden h-4 w-32 rounded bg-surface-subtle motion-safe:animate-pulse sm:block" />
            <div className="hidden h-4 w-24 rounded bg-surface-subtle motion-safe:animate-pulse md:block" />
            <div className="ml-auto h-7 w-20 rounded-md bg-surface-subtle motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
