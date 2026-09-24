import * as RadixDialog from '@radix-ui/react-dialog'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { searchSpots, type SpotItem } from '../../../api/reference'
import { Button } from '../../../ui/Button'
import { cn } from '../../../ui/cn'
import { InputField, SelectField } from '../../../ui/Field'
import { NoticeBanner } from '../../../ui/NoticeBanner'
import { StatusBadge } from '../../../ui/StatusBadge'

type Availability = 'available' | 'added' | 'stopped'

function availabilityOf(spot: SpotItem, added: Set<string>): Availability {
  if (added.has(spot.canonicalId)) return 'added'
  if (spot.utilization !== 'available') return 'stopped'
  return 'available'
}

type VenuePickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** この枠に追加済みのcanonical ID。再選択させない（07 AC06）。 */
  addedIds: string[]
  onSelect: (spot: SpotItem) => void
  /** 閉じたときにフォーカスを戻す要素（［会場を追加］）。 */
  returnFocusTo: RefObject<HTMLElement | null>
}

/**
 * Figma `Venue Picker Dialog`（79:519）：結果・読み込み中・正式0件・検索0件・取得失敗・新規選択停止。
 * ↑↓で候補を移動、Enterで追加、Escで閉じる。閉じると［会場を追加］へフォーカスが戻る（AC19）。
 */
export function VenuePickerDialog({ open, onOpenChange, addedIds, onSelect, returnFocusTo }: VenuePickerDialogProps) {
  const [q, setQ] = useState('')
  const [building, setBuilding] = useState('')
  const [floor, setFloor] = useState('')
  const deferredQ = useDeferredValue(q)
  // 検索条件が変わったら先頭の候補から選び直す。
  const filterKey = `${deferredQ}\u0000${building}\u0000${floor}`
  const [activeState, setActiveState] = useState({ key: filterKey, index: 0 })
  const active = activeState.key === filterKey ? activeState.index : 0
  const setActive = (next: number | ((current: number) => number)) =>
    setActiveState({ key: filterKey, index: typeof next === 'function' ? next(active) : next })
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const added = new Set(addedIds)

  const result = useQuery({
    queryKey: ['spots', { q: deferredQ, building, floor }],
    queryFn: () => searchSpots(deferredQ, building, floor),
    enabled: open,
    placeholderData: keepPreviousData,
  })
  const items = result.data?.items ?? []
  const filtered = Boolean(q.trim() || building || floor)

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function choose(spot: SpotItem | undefined) {
    if (!spot || availabilityOf(spot, added) !== 'available') return
    onSelect(spot)
    onOpenChange(false)
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (items.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, items.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'BUTTON') {
      event.preventDefault()
      choose(items[active])
    }
  }

  function reset() {
    setQ('')
    setBuilding('')
    setFloor('')
  }

  const activeSpot = items[active]
  const stoppedActive = activeSpot && availabilityOf(activeSpot, added) === 'stopped'

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <RadixDialog.Content
          onKeyDown={handleKeyDown}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocusTo.current?.focus()
          }}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-32px)] w-[760px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl border border-border bg-surface p-6 shadow-[0_18px_16px_rgb(20_31_51/0.18)] focus:outline-none"
        >
          <RadixDialog.Title className="text-[18px] leading-[26px] font-bold text-text-primary">会場を追加</RadixDialog.Title>
          <RadixDialog.Description className="text-[12px] leading-5 text-text-secondary">
            名称・別名・canonical IDで検索し、建物と階で絞り込みます。
          </RadixDialog.Description>

          <InputField
            label="検索"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="w-[320px]"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeSpot ? `${listId}-${active}` : undefined}
            autoComplete="off"
          />
          <div className="flex gap-3">
            <SelectField label="建物" value={building} onChange={(event) => setBuilding(event.target.value)} className="w-[320px]">
              <option value="">すべて</option>
              {result.data?.buildings.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
            <SelectField label="階" value={floor} onChange={(event) => setFloor(event.target.value)} className="w-[320px]">
              <option value="">すべて</option>
              {result.data?.floors.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
          </div>

          {result.isPending ? (
            <>
              <p className="text-[12px] leading-5 font-medium text-text-primary">読み込み中</p>
              <NoticeBanner>会場候補を読み込んでいます。</NoticeBanner>
            </>
          ) : result.isError && !result.data ? (
            <>
              <p className="text-[12px] leading-5 font-medium text-text-primary">取得失敗</p>
              <NoticeBanner tone="blocking">
                会場候補を取得できません。選択済み会場は保持して再試行してください。
                <Button variant="secondary" className="ml-3" onClick={() => void result.refetch()}>
                  再試行
                </Button>
              </NoticeBanner>
            </>
          ) : items.length === 0 ? (
            filtered ? (
              <>
                <p className="text-[12px] leading-5 font-medium text-text-primary">検索結果 0件</p>
                <NoticeBanner>
                  一致するSpotはありません。条件を解除して再検索してください。
                  <Button variant="secondary" className="ml-3" onClick={reset}>
                    条件を解除
                  </Button>
                </NoticeBanner>
              </>
            ) : (
              <>
                <p className="text-[12px] leading-5 font-medium text-text-primary">登録済みSpot 0件</p>
                <NoticeBanner>会場候補のSpotは正式に0件です。</NoticeBanner>
              </>
            )
          ) : (
            <>
              <p className="text-[12px] leading-5 font-medium text-text-primary" aria-live="polite">
                検索結果 {result.data.totalCount}件
                {result.data.totalCount > items.length && `（先頭の${items.length}件を表示。条件を絞り込んでください）`}
              </p>
              <ul id={listId} ref={listRef} role="listbox" aria-label="会場候補" className="flex min-h-0 flex-col gap-2 overflow-auto">
                {items.map((spot, index) => {
                  const availability = availabilityOf(spot, added)
                  return (
                    <li
                      key={spot.canonicalId}
                      id={`${listId}-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={index === active}
                      aria-disabled={availability !== 'available' || undefined}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(spot)}
                      className={cn(
                        'flex h-16 w-[680px] max-w-full shrink-0 items-center gap-2 rounded-lg border px-3',
                        availability === 'available' ? 'cursor-pointer bg-surface' : 'cursor-not-allowed bg-surface-subtle',
                        index === active ? 'border-brand outline-2 outline-brand' : 'border-border',
                      )}
                    >
                      <VenueRowContent spot={spot} />
                      {availability === 'added' ? (
                        <StatusBadge>この枠に追加済み</StatusBadge>
                      ) : availability === 'stopped' ? (
                        <StatusBadge>新規選択停止</StatusBadge>
                      ) : spot.isPublished ? (
                        <StatusBadge tone="success">公開中</StatusBadge>
                      ) : (
                        <StatusBadge tone="warning">未公開：このままでは公開できません</StatusBadge>
                      )}
                    </li>
                  )
                })}
              </ul>
              {stoppedActive && <NoticeBanner>新規選択停止のSpotは選べません。</NoticeBanner>}
            </>
          )}

          <p className="text-[11px] leading-[19px] text-text-secondary">↑↓で候補を移動、Enterで追加、Escで閉じます。閉じると元の［会場を追加］へ戻ります。</p>
          <RadixDialog.Close asChild>
            <Button variant="secondary" className="self-start">
              閉じる
            </Button>
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

/** Figma `Venue Row`（72:260）の名称・建物と階・canonical ID。同名のSpotを建物・階・IDで区別する。 */
export function VenueRowContent({ spot, canonicalId }: { spot?: SpotItem; canonicalId?: string }) {
  return (
    <>
      <p className="w-[94px] shrink-0 truncate text-[13px] leading-[21px] font-medium text-text-primary">{spot?.name ?? '（不明なSpot）'}</p>
      <p className="w-[115px] shrink-0 truncate text-[11px] leading-[19px] text-text-secondary">
        {[spot?.buildingName, spot?.floorName].filter(Boolean).join('・')}
      </p>
      <p className="w-[145px] shrink-0 truncate text-[11px] leading-[19px] text-text-secondary" title={spot?.canonicalId ?? canonicalId}>
        {spot?.canonicalId ?? canonicalId}
      </p>
    </>
  )
}
