import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError } from '../../api/client'
import type { SpotItem } from '../../api/reference'
import { getSpot, listSpotDirectory, saveSpot, type SpotConflict, type SpotDetail, type SpotDraft } from '../../api/spots'
import { CompareRows } from '../../editing/CompareRows'
import { LeaveGuard } from '../../editing/LeaveGuard'
import { useDraftEditor } from '../../editing/useDraftEditor'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { ChoiceGroup } from '../../ui/ChoiceGroup'
import { cn } from '../../ui/cn'
import { FilterChip } from '../../ui/FilterChip'
import { InputField, SelectField, TextAreaField } from '../../ui/Field'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusBadge, type StatusTone } from '../../ui/StatusBadge'

function publicationBadge(spot: Pick<SpotItem, 'isPublished' | 'utilization'>): { label: string; tone: StatusTone } {
  if (spot.utilization === 'withdrawn') return { label: '取り下げ済み', tone: 'neutral' }
  return spot.isPublished ? { label: '公開中', tone: 'success' } : { label: '未公開', tone: 'warning' }
}

/**
 * Figma SP01「Spots — 選択・Inspector」（42:2）。一覧 320px・地図 560px・Inspector 344px。
 * Step 3 では一覧・検索・Inspectorでの属性の下書き編集まで（2026-09-24 利用者判断）。
 * 地図の表示と位置の変更（SP02〜SP04）は Map Data の技術検証と公開単位の判断の後に実装する。
 */
export function SpotsPage() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')
  const [q, setQ] = useState('')
  const [building, setBuilding] = useState('')
  const [floor, setFloor] = useState('')
  const deferredQ = useDeferredValue(q)
  const directory = useQuery({
    queryKey: ['spot-directory', { q: deferredQ, building, floor }],
    queryFn: () => listSpotDirectory(deferredQ, building, floor),
    placeholderData: keepPreviousData,
  })

  function select(canonicalId: string) {
    const next = new URLSearchParams(params)
    next.set('id', canonicalId)
    setParams(next)
  }

  return (
    <>
      <Toolbar title="Spots" subtitle="地点・会場の公開版と下書きを管理" />
      <div className="flex min-h-0 flex-1">
        <section aria-label="Spot一覧" className="flex w-[320px] shrink-0 flex-col gap-3 overflow-auto border-r border-border bg-surface px-4 pt-[18px] pb-6">
          <h2 className="text-[20px] leading-7 font-bold text-text-primary">Spots</h2>
          <label htmlFor="spot-search" className="text-[11px] leading-[19px] text-text-secondary">
            名称・別名・canonical IDで検索
          </label>
          <input
            id="spot-search"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="h-10 rounded-[7px] border border-border bg-surface px-[11px] text-[12px] leading-5 text-text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          />
          <div className="flex flex-wrap gap-1.5">
            <FilterChip label="建物" value={building} onChange={setBuilding}>
              <option value="">建物：すべて</option>
              {directory.data?.buildings.map((name) => (
                <option key={name} value={name}>
                  建物：{name}
                </option>
              ))}
            </FilterChip>
            <FilterChip label="階" value={floor} onChange={setFloor}>
              <option value="">階：すべて</option>
              {directory.data?.floors.map((name) => (
                <option key={name} value={name}>
                  階：{name}
                </option>
              ))}
            </FilterChip>
          </div>

          {directory.isPending ? (
            <p role="status" className="text-[11px] leading-[19px] text-text-secondary">
              Spotを読み込んでいます
            </p>
          ) : directory.isError && !directory.data ? (
            <NoticeBanner tone="blocking">
              Spotを取得できませんでした。0件とは扱わず、再試行してください。
              <Button variant="secondary" className="mt-2" onClick={() => void directory.refetch()}>
                再試行
              </Button>
            </NoticeBanner>
          ) : directory.data.items.length === 0 ? (
            <NoticeBanner>{q || building || floor ? '一致するSpotはありません。条件を変えて検索してください。' : 'Spotは正式に0件です。'}</NoticeBanner>
          ) : (
            <>
              <p className="text-[10px] leading-[18px] text-text-secondary" aria-live="polite">
                {directory.data.totalCount}件{directory.data.totalCount > directory.data.items.length && `（先頭の${directory.data.items.length}件を表示）`}
              </p>
              <ul className="flex flex-col gap-3">
                {directory.data.items.map((spot) => {
                  const selected = spot.canonicalId === selectedId
                  const badge = publicationBadge(spot)
                  return (
                    <li key={spot.canonicalId}>
                      <button
                        type="button"
                        aria-current={selected || undefined}
                        onClick={() => select(spot.canonicalId)}
                        className={cn(
                          'relative flex w-full flex-col gap-[5px] rounded-lg border px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                          selected ? 'border-brand bg-brand-subtle' : 'border-border bg-surface hover:bg-surface-subtle',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className={cn('text-[13px] leading-[21px] font-medium', selected ? 'text-brand' : 'text-text-primary')}>{spot.name || '（名称未入力）'}</span>
                          {selected ? <StatusBadge tone="info">選択中</StatusBadge> : <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
                          {spot.utilization === 'noNewSelection' && <StatusBadge>新規選択停止</StatusBadge>}
                        </span>
                        <span className="text-[10px] leading-6 text-text-secondary">
                          {[spot.buildingName ?? '建物未確認', spot.floorName ?? '階未確認', '種別未確認'].join('・')}
                        </span>
                        <span className="truncate text-[10px] leading-[18px] font-medium text-text-secondary">{spot.canonicalId}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="text-[10px] leading-6 text-text-secondary">同名でも建物・階・IDで区別します。</p>
            </>
          )}
        </section>

        <section aria-label="地図" className="flex w-[560px] shrink-0 flex-col gap-3 bg-canvas p-3">
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface-subtle p-6 text-center">
            <p className="text-[13px] leading-[21px] font-medium text-text-primary">地図の表示は準備中です</p>
            <p className="max-w-[420px] text-[11px] leading-[19px] text-text-secondary">
              地図の表示と位置の変更は、Map Data の技術検証と Spot の公開単位の判断の後に実装します。位置を推測して表示することはしません。
            </p>
          </div>
          <p className="text-[10px] leading-[18px] text-text-secondary">表示用のピン位置と経路の到着点は別に検証します。</p>
        </section>

        <aside aria-label="Spotの詳細" className="flex w-[344px] shrink-0 flex-col overflow-auto border-l border-border bg-surface px-4 pt-[18px] pb-6">
          {selectedId ? (
            <SpotInspectorLoader key={selectedId} canonicalId={selectedId} buildings={directory.data?.buildings ?? []} floors={directory.data?.floors ?? []} />
          ) : (
            <p className="text-[12px] leading-5 text-text-secondary">一覧からSpotを選ぶと、ここに詳細を表示します。</p>
          )}
        </aside>
      </div>
    </>
  )
}

function SpotInspectorLoader({ canonicalId, buildings, floors }: { canonicalId: string; buildings: string[]; floors: string[] }) {
  const spot = useQuery({ queryKey: ['spot', canonicalId], queryFn: () => getSpot(canonicalId), staleTime: Infinity, refetchOnWindowFocus: false })
  if (spot.data) return <SpotInspector initial={spot.data} buildings={buildings} floors={floors} />
  if (spot.isPending) return <p role="status" className="text-[12px] leading-5 text-text-secondary">Spotを読み込んでいます。</p>
  const notFound = spot.error instanceof ApiError && spot.error.status === 404
  return (
    <NoticeBanner tone="blocking">
      {notFound ? `canonical ID「${canonicalId}」のSpotは見つかりません。別のSpotに置き換えずに、一覧から選び直してください。` : 'Spotを取得できませんでした。'}
      {!notFound && (
        <Button variant="secondary" className="mt-2" onClick={() => void spot.refetch()}>
          再試行
        </Button>
      )}
    </NoticeBanner>
  )
}

function SpotInspector({ initial, buildings, floors }: { initial: SpotDetail; buildings: string[]; floors: string[] }) {
  const queryClient = useQueryClient()
  const editor = useDraftEditor<SpotDetail, SpotDraft>({
    initial,
    newDraft: () => initial.draft,
    draftOf: (detail) => detail.draft,
    persist: ({ operationId, base, draft }) => saveSpot(base!.canonicalId, operationId, base!.rowVersion, draft),
    // 409では常に最新内容が返る（OpenAPIではジェネリック型のためnull許容になっている）。
    latestFromConflict: (body) => (body as SpotConflict).latest!,
  })
  const { draft, base } = editor
  const [aliasText, setAliasText] = useState(() => draft.aliases.join('\n'))
  const badge = publicationBadge({ isPublished: initial.isPublished, utilization: draft.utilization })

  async function save(): Promise<boolean> {
    const detail = await editor.save()
    if (!detail) return false
    setAliasText(detail.draft.aliases.join('\n'))
    queryClient.setQueryData(['spot', detail.canonicalId], detail)
    void queryClient.invalidateQueries({ queryKey: ['spot-directory'] })
    void queryClient.invalidateQueries({ queryKey: ['spots'] })
    void queryClient.invalidateQueries({ queryKey: ['spot-lookup'] })
    return true
  }

  if (editor.conflict) {
    const describe = (spot: SpotDraft) =>
      [`名称：${spot.name || '（未入力）'}`, `別名：${spot.aliases.join('、') || 'なし'}`, `建物・階：${spot.buildingName ?? '未確認'}・${spot.floorName ?? '未確認'}`, `利用状態：${spot.utilization === 'noNewSelection' ? '新規選択停止' : '選択できる'}`].join('\n')
    return (
      <CompareRows
        rows={[{ label: 'Spotの属性', mine: describe(editor.conflict.mine), latest: describe(editor.conflict.latest.draft) }]}
        latestBy={editor.conflict.latest.updatedBy?.displayName ?? '取り込み'}
        resolved={editor.conflict.resolved}
        onLoadLatest={() => {
          editor.loadLatest()
          setAliasText(editor.conflict!.latest.draft.aliases.join('\n'))
        }}
        onClose={editor.closeConflict}
      />
    )
  }

  return (
    <div className="flex flex-col gap-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[18px] leading-[26px] font-bold text-text-primary">{draft.name || '（名称未入力）'}</h2>
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        <StatusBadge tone={editor.statusBadge.tone}>
          <span role="status">{editor.statusBadge.label}</span>
        </StatusBadge>
      </div>
      {editor.failure && <NoticeBanner tone="blocking">{editor.failure}</NoticeBanner>}

      <ReadOnlyField label="canonical ID・通常編集不可" value={initial.canonicalId} />
      <InputField label="名称" value={draft.name ?? ''} onChange={(event) => editor.update((current) => ({ ...current, name: event.target.value }))} />
      <TextAreaField
        label="別名（1行に1つ）"
        rows={2}
        value={aliasText}
        onChange={(event) => {
          setAliasText(event.target.value)
          const aliases = [...new Set(event.target.value.split('\n').map((alias) => alias.trim()).filter(Boolean))]
          editor.update((current) => ({ ...current, aliases }))
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="建物"
          value={draft.buildingName ?? ''}
          onChange={(event) => editor.update((current) => ({ ...current, buildingName: event.target.value || null }))}
        >
          <option value="">未確認</option>
          {buildings.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectField>
        <SelectField label="階" value={draft.floorName ?? ''} onChange={(event) => editor.update((current) => ({ ...current, floorName: event.target.value || null }))}>
          <option value="">未確認</option>
          {floors.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectField>
      </div>
      {draft.utilization === 'withdrawn' ? (
        <NoticeBanner>このSpotは取り下げ済みです。再開は公開機能（Step 4）と合わせて扱います。</NoticeBanner>
      ) : (
        <ChoiceGroup<'available' | 'noNewSelection'>
          label="会場としての利用"
          name={`utilization-${initial.canonicalId}`}
          value={draft.utilization as 'available' | 'noNewSelection'}
          choices={[
            { value: 'available', label: '選択できる' },
            { value: 'noNewSelection', label: '新規選択停止' },
          ]}
          onChange={(utilization) => editor.update((current) => ({ ...current, utilization }))}
          optionWidthClass="w-[151px]"
        />
      )}
      {draft.utilization === 'noNewSelection' && (
        <p className="-mt-1 text-[11px] leading-[19px] text-text-secondary">新しいイベントの会場には選べなくなります。既存のイベントの会場参照は維持します。</p>
      )}

      <ReadOnlyField label="種別" value="未確認" tone="warning" />
      <div className="flex flex-col gap-[7px] self-start rounded-lg bg-surface-subtle px-3 py-2.5">
        <p className="text-[13px] leading-[21px] font-bold text-text-primary">位置</p>
        <p className="text-[11px] leading-[19px] text-text-secondary">座標系：floor-local（m）</p>
        <p className="text-[12px] leading-5 font-medium text-warning">X：未確認　Y：未確認</p>
        <p className="text-[11px] leading-[19px] text-warning">出典：未確認</p>
      </div>
      <div className="flex flex-col gap-[5px] rounded-lg border border-warning bg-surface px-3 py-2.5">
        <p className="text-[13px] leading-[21px] font-bold text-text-primary">経路関係</p>
        <p className="text-[11px] leading-[19px] text-warning">到着点・入口・Graph接続：未確認</p>
        <p className="text-[10px] leading-6 text-text-secondary">ピンを置いただけでは接続済みにしません。</p>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-[11px] leading-[19px] font-medium text-text-secondary">関連イベント</p>
        <p className="text-[11px] leading-[19px] text-text-secondary">公開中：公開機能（Step 4）の実装後に表示します</p>
        <p className="text-[11px] leading-[19px] text-text-primary">下書き：{base?.draftEvents.length ?? 0}件</p>
        <ul className="text-[11px] leading-[19px] text-text-secondary">
          {base?.draftEvents.map((reference) => (
            <li key={reference.eventId}>
              ・{reference.eventTitle?.trim() || '無題のイベント'}（{reference.slotCount}枠）
            </li>
          ))}
        </ul>
      </div>

      <Button className="w-full" onClick={() => void save()} disabled={editor.saveState === 'saving'}>
        {editor.saveState === 'saving' ? '保存中…' : '下書き保存'}
      </Button>
      <Button variant="secondary" className="w-full" disabled title="Map Data と合わせて実装します">
        位置を変更
      </Button>
      <p className="text-[10px] leading-6 text-text-secondary">位置の変更は Map Data と合わせて実装します。Spotの変更は地図全体の公開確認へ含める案です。</p>

      <LeaveGuard id="spot-editor" dirty={editor.dirty} saving={editor.saveState === 'saving'} canSave={!editor.conflictOpen} onSave={save} />
    </div>
  )
}

function ReadOnlyField({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] leading-[18px] font-medium text-text-secondary">{label}</p>
      <p
        aria-readonly
        className={cn(
          'flex h-[38px] items-center rounded-[7px] border bg-surface px-2.5 text-[12px] leading-5 break-all',
          tone === 'warning' ? 'border-warning text-warning' : 'border-border text-text-primary',
        )}
      >
        {value}
      </p>
    </div>
  )
}
