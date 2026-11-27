import { Map, Search, TriangleAlert } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '../../api/client'
import type { SpotSearchResult } from '../../api/reference'
import { getSpot, listSpotDirectory, saveSpot, spotKindLabel, spotKindLabels, type SpotConflict, type SpotDetail, type SpotDraft } from '../../api/spots'
import { CompareRows } from '../../editing/CompareRows'
import { DraftSaveStatus } from '../../editing/DraftSaveStatus'
import { LeaveGuard } from '../../editing/LeaveGuard'
import { useDraftEditor } from '../../editing/useDraftEditor'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { cn } from '../../ui/cn'
import { InputField, SelectField, TextAreaField } from '../../ui/Field'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StaleListNotice } from '../../ui/StaleListNotice'
import { isLive, publicationBadge, reviewPath } from '../../publishing/publication'
import { StatusLabel } from '../../ui/StatusLabel'

/** 移行元で取り下げ済み（utilization=withdrawn）の地点は、公開状態に関わらず取り下げ済みと表示する。 */
function spotBadge(publication: string, utilization: string) {
  return utilization === 'withdrawn' ? publicationBadge('withdrawn') : publicationBadge(publication)
}

type SpotConditions = { q: string; building: string; floor: string }
type SpotDirectorySnapshot = { data: SpotSearchResult; query: SpotConditions; updatedAt: number }

function describeConditions({ q, building, floor }: SpotConditions): string {
  return [q && `検索「${q}」`, building && `建物「${building}」`, floor && `階「${floor}」`].filter(Boolean).join('／') || '絞り込みなし'
}

function includeSelection(options: string[] = [], selected: string): string[] {
  return selected && !options.includes(selected) ? [...options, selected] : options
}

/**
 * Figma v2 SP01（126:2605）。一覧 300px・詳細 380px・中央に地図を配置する。
 * Step 3 では一覧・検索・Inspectorでの属性の下書き編集まで（2026-09-24 利用者判断）。
 * 地図の表示と位置の変更（SP02〜SP04）は 地図 の技術検証と公開単位の判断の後に実装する。
 */
export function SpotsPage() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')
  const [q, setQ] = useState('')
  const [building, setBuilding] = useState('')
  const [floor, setFloor] = useState('')
  const [lastSuccess, setLastSuccess] = useState<SpotDirectorySnapshot | null>(null)
  const deferredQ = useDeferredValue(q).trim()
  const query = { q: deferredQ, building, floor }
  const directory = useQuery({
    queryKey: ['spot-directory', query],
    queryFn: () => listSpotDirectory(deferredQ, building, floor),
  })
  const { data, dataUpdatedAt, isSuccess } = directory

  // データ・条件・時刻を同じ成功レスポンスの組として保持する。
  if (isSuccess && (!lastSuccess || lastSuccess.data !== data || lastSuccess.updatedAt !== dataUpdatedAt
    || lastSuccess.query.q !== deferredQ || lastSuccess.query.building !== building || lastSuccess.query.floor !== floor)) {
    setLastSuccess({ data, query, updatedAt: dataUpdatedAt })
  }

  const displayedData = lastSuccess?.data
  const displayedQuery = lastSuccess?.query
  const options = data ?? lastSuccess?.data

  function select(canonicalId: string) {
    const next = new URLSearchParams(params)
    next.set('id', canonicalId)
    setParams(next)
  }

  return (
    <>
      <Toolbar title="地点" subtitle="地点・会場の公開版と下書きを管理" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-canvas xl:flex-row xl:overflow-hidden">
        <section aria-label="地点一覧" className="flex w-full min-w-0 shrink-0 flex-col gap-2 border-b border-border-subtle bg-canvas px-4 py-4 xl:w-[300px] xl:min-h-0 xl:overflow-y-auto xl:border-r xl:border-b-0">
          <label htmlFor="spot-search" className="sr-only">
            名称・別名・建物・階・IDで検索
          </label>
          <div className="relative min-w-0"><Search aria-hidden size={16} className="absolute top-2.5 left-3 text-text-muted" /><input
            id="spot-search"
            type="search"
            placeholder="名称・別名・建物・階・IDで検索"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="h-9 w-full min-w-0 rounded-md border border-border-input bg-canvas pr-2 pl-9 text-[12px] text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          /></div>
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <SelectField label="建物" controlSize="sm" value={building} onChange={(event) => setBuilding(event.target.value)} className="min-w-0 [&>label]:sr-only [&_select]:truncate [&_select]:text-[12px]">
              <option value="">建物：すべて</option>
              {includeSelection(options?.buildings, building).map((name) => (
                <option key={name} value={name}>
                  建物：{name}
                </option>
              ))}
            </SelectField>
            <SelectField label="階" controlSize="sm" value={floor} onChange={(event) => setFloor(event.target.value)} className="min-w-0 [&>label]:sr-only [&_select]:truncate [&_select]:text-[12px]">
              <option value="">階：すべて</option>
              {includeSelection(options?.floors, floor).map((name) => (
                <option key={name} value={name}>
                  階：{name}
                </option>
              ))}
            </SelectField>
          </div>

          {directory.isError && lastSuccess && (
            <StaleListNotice
              listName="地点一覧"
              updatedAt={lastSuccess.updatedAt}
              conditions={{ failed: describeConditions(query), shown: describeConditions(lastSuccess.query) }}
              onRetry={() => void directory.refetch()}
            />
          )}
          {displayedData && (
            <p className="text-[10px] leading-[18px] text-text-secondary tabular-nums" aria-live="polite">
              {displayedData.totalCount}件{displayedData.totalCount > displayedData.items.length && `（先頭の${displayedData.items.length}件を表示）`}
            </p>
          )}
          {!displayedData && directory.isPending ? (
            <p role="status" className="text-[11px] leading-[19px] text-text-secondary">
              地点を読み込んでいます
            </p>
          ) : !displayedData ? (
            <NoticeBanner tone="blocking">
              地点を取得できませんでした。0件とは扱わず、再試行してください。
              <Button variant="secondary" className="mt-2" onClick={() => void directory.refetch()}>
                再試行
              </Button>
            </NoticeBanner>
          ) : displayedData.items.length === 0 ? (
            <NoticeBanner>{displayedQuery?.q || displayedQuery?.building || displayedQuery?.floor ? '一致する地点はありません。条件を変えて検索してください。' : '地点は正式に0件です。'}</NoticeBanner>
          ) : (
            <>
              <ul className="divide-y divide-border-subtle border-b border-border-subtle">
                {displayedData.items.map((spot) => {
                  const selected = spot.canonicalId === selectedId
                  const badge = spotBadge(spot.publication, spot.utilization)
                  return (
                    <li key={spot.canonicalId}>
                      <button
                        type="button"
                        aria-current={selected || undefined}
                        onClick={() => select(spot.canonicalId)}
                        className={cn(
                          'flex w-full min-w-0 flex-col gap-1 rounded-md px-2.5 py-2 text-left wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                          selected ? 'bg-nav-active' : 'hover:bg-surface-subtle',
                        )}
                      >
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={cn('min-w-0 text-[13px] leading-[21px] text-text-primary', selected ? 'font-bold' : 'font-normal')}>{spot.name || '（名称未入力）'}</span>
                          <StatusLabel tone={badge.tone}>{badge.label === '取り下げ済み' ? '公開停止' : badge.label}</StatusLabel>
                          {spot.utilization === 'noNewSelection' && <span className="text-[11px] text-text-muted">· 新規選択停止</span>}
                        </span>
                        <span className={cn("text-[11px] leading-4", !spot.buildingName || !spot.floorName || !spot.kind ? "text-warning" : "text-text-secondary")}>
                          {[spot.buildingName ?? '建物未確認', spot.floorName ?? '階未確認', spot.kind ? spotKindLabel(spot.kind) : '種別未設定'].join('・')}
                        </span>
                        <span className="min-w-0 font-mono text-[10px] leading-[18px] text-text-secondary">{spot.canonicalId}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="text-[10px] leading-6 text-text-secondary">同名でも建物・階・IDで区別します。</p>
            </>
          )}
        </section>

        <section aria-label="地図" className="flex min-h-[260px] min-w-0 flex-1 flex-col bg-surface-subtle p-4 xl:min-h-0 xl:overflow-y-auto">
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center"><Map aria-hidden size={22} /><p className="text-[13px] font-bold">地図の表示は準備中です</p><p className="max-w-[420px] text-[11px] text-text-secondary">地図の表示と位置の変更は、地図データの構成確定後に実装します。位置を推測して表示することはしません。</p></div>
          <p className="text-center text-[10px] text-text-secondary">表示用のピン位置と経路の到着点は別に検証します。</p>
        </section>

        <aside aria-label="地点の詳細" className="flex w-full min-w-0 shrink-0 flex-col border-t border-border-subtle bg-canvas wrap-anywhere xl:w-[380px] xl:min-h-0 xl:border-t-0 xl:border-l">
          {selectedId ? (
            <SpotInspectorLoader key={selectedId} canonicalId={selectedId} />
          ) : (
            <p className="p-4 text-[12px] leading-5 text-text-secondary">一覧から地点を選ぶと、ここに詳細を表示します。</p>
          )}
        </aside>
      </div>
    </>
  )
}

function SpotInspectorLoader({ canonicalId }: { canonicalId: string }) {
  const spot = useQuery({ queryKey: ['spot', canonicalId], queryFn: () => getSpot(canonicalId), staleTime: Infinity, refetchOnWindowFocus: false })
  if (spot.data) return <SpotInspector initial={spot.data} />
  if (spot.isPending) return <p role="status" className="text-[12px] leading-5 text-text-secondary">地点を読み込んでいます。</p>
  const notFound = spot.error instanceof ApiError && spot.error.status === 404
  return (
    <NoticeBanner tone="blocking">
      {notFound ? `ID「${canonicalId}」の地点は見つかりません。別の地点に置き換えずに、一覧から選び直してください。` : '地点を取得できませんでした。'}
      {!notFound && (
        <Button variant="secondary" className="mt-2" onClick={() => void spot.refetch()}>
          再試行
        </Button>
      )}
    </NoticeBanner>
  )
}

function SpotInspector({ initial }: { initial: SpotDetail }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
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
  const current = base ?? initial
  const { placement } = current
  const badge = spotBadge(current.publication.state, draft.utilization)

  async function save(): Promise<boolean> {
    return (await saveDetail()) !== null
  }

  async function saveDetail(): Promise<SpotDetail | null> {
    const detail = await editor.save()
    if (!detail) return null
    setAliasText(detail.draft.aliases.join('\n'))
    queryClient.setQueryData(['spot', detail.canonicalId], detail)
    void queryClient.invalidateQueries({ queryKey: ['spot-directory'] })
    void queryClient.invalidateQueries({ queryKey: ['spots'] })
    void queryClient.invalidateQueries({ queryKey: ['spot-lookup'] })
    return detail
  }

  /** 公開確認へ。未保存の変更があれば先に保存する（11 §5）。 */
  async function review() {
    const saved = editor.dirty ? await saveDetail() : current
    if (saved) void navigate(reviewPath('spot', saved.canonicalId), { state: { skipUnsavedGuard: true } })
  }

  if (editor.conflict) {
    const describe = (spot: SpotDraft) =>
      [
        `名称：${spot.name || '（未入力）'}`,
        `別名：${spot.aliases.join('、') || 'なし'}`,
        `利用状態：${spot.utilization === 'withdrawn' ? '公開停止' : spot.utilization === 'noNewSelection' ? '新規選択停止' : '選択できる'}`,
        `説明：${spot.description?.trim() || 'なし'}`,
        `種別：${spotKindLabel(spot.kind)}`,
      ].join('\n')
    return (
      <><div className="min-w-0 p-4 xl:overflow-y-auto"><CompareRows
        rows={[{ label: '地点の属性', mine: describe(editor.conflict.mine), latest: describe(editor.conflict.latest.draft) }]}
        latestBy={editor.conflict.latest.updatedBy?.displayName ?? '取り込み'}
        resolved={editor.conflict.resolved}
        onLoadLatest={() => {
          editor.loadLatest()
          setAliasText(editor.conflict!.latest.draft.aliases.join('\n'))
        }}
        onClose={editor.closeConflict}
      /></div><LeaveGuard id="spot-editor" dirty={editor.dirty} saving={editor.saveState === 'saving'} canSave={!editor.conflictOpen} onSave={save} /></>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-4 pb-3 xl:pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 text-[17px] font-bold">{draft.name || '（名称未入力）'}</h2>
          <StatusLabel tone={badge.tone}>{badge.label === '取り下げ済み' ? '公開停止' : badge.label}</StatusLabel>
          {draft.utilization === 'noNewSelection' && <span className="text-[11px] text-text-muted">· 新規選択停止</span>}
        </div>
        <DraftSaveStatus className="mt-1 text-[11px]" label={editor.statusBadge.label} dirty={editor.dirty} updatedAt={current.updatedAt} />
      </div>
      <div className="flex min-w-0 flex-col gap-3 px-4 pb-4 xl:min-h-0 xl:flex-1 xl:gap-2.5 xl:overflow-y-auto">
      {editor.failure && <NoticeBanner tone="blocking">{editor.failure}</NoticeBanner>}
      <div className="rounded-lg bg-surface-subtle p-3 text-[11px] text-text-secondary"><div className="grid grid-cols-[52px_1fr] gap-y-1.5"><span>ID</span><span className="break-all font-mono text-text-primary">{initial.canonicalId}</span><span>建物</span><span className={placement.buildingName ? 'text-text-primary' : 'font-bold text-warning'}>{!placement.buildingName && <TriangleAlert aria-hidden size={13} className="mr-1 inline" />}{placement.buildingName ?? '未確認'}</span><span>階</span><span className={placement.floorName ? 'text-text-primary' : 'font-bold text-warning'}>{!placement.floorName && <TriangleAlert aria-hidden size={13} className="mr-1 inline" />}{placement.floorName ?? '未確認'}</span></div><p className="mt-2">IDは変更できません。建物・階は地図と一緒に公開するため、地図画面で変更します。</p></div>
      <div className="rounded-lg bg-surface-subtle p-3 text-[11px] text-text-secondary"><p className="mb-1 text-[13px] font-bold text-text-primary">位置・経路関係</p><p>座標系：floor-local（m）</p><p className="mt-1 font-bold text-warning">X：未確認　Y：未確認</p><p className="mt-1 text-warning">到着点・入口・経路の接続：未確認</p><p className="mt-1">ピンを置いただけでは接続済みにしません。</p></div>
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
      {draft.utilization === 'withdrawn' ? (
        <NoticeBanner>この地点は公開停止されています。再開は公開確認で扱います。</NoticeBanner>
      ) : (
        <div><p className="mb-1 text-[12px] text-text-secondary">会場としての利用</p><SegmentedControl<'available' | 'noNewSelection'>
          aria-label="会場としての利用"
          name={`utilization-${initial.canonicalId}`}
          value={draft.utilization as 'available' | 'noNewSelection'}
          options={[
            { value: 'available', label: '選択できる' },
            { value: 'noNewSelection', label: '新規選択停止' },
          ]}
          onChange={(utilization) => editor.update((current) => ({ ...current, utilization }))}
        /></div>
      )}
      {draft.utilization === 'noNewSelection' && (
        <p className="-mt-1 text-[11px] leading-[19px] text-text-secondary">新しいイベントの会場には選べなくなります。既存のイベントの会場参照は維持します。</p>
      )}

      {/* 種別は地図の Feature の型から導出しない（E2-5 O-2 K1）。未設定では公開できない（O-2c C4、決定事項33）。 */}
      <SelectField
        label="種別"
        value={draft.kind ?? ''}
        onChange={(event) => editor.update((current) => ({ ...current, kind: event.target.value || null }))}
        message={draft.kind ? '参加者向けアプリの種別の表示に使います。' : <span className="font-bold"><TriangleAlert aria-hidden size={13} className="mr-1 inline" />公開には種別が必要です。</span>}
        messageTone={draft.kind ? 'secondary' : 'warning'}
      >
        <option value="">未設定</option>
        {Object.entries(spotKindLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      {/* 説明文は供給体制（NexusMobile #49）が決まるまで公開しない取り決め（E2-5 O-2d）。入力は止めず、公開確認で警告する。 */}
      <TextAreaField
        label="説明"
        rows={3}
        value={draft.description ?? ''}
        onChange={(event) => editor.update((current) => ({ ...current, description: event.target.value || null }))}
        message="説明文の供給体制（NexusMobile #49）が決まるまで公開しない取り決めです。"
        messageTone="secondary"
      />
      <div className="flex flex-col gap-1">
        <p className="text-[11px] leading-[19px] font-bold text-text-secondary">関連イベント</p>
        <p className="text-[11px] leading-[19px] text-text-secondary">公開中の関連イベント：公開確認の画面で確認できます</p>
        <p className="text-[11px] leading-[19px] text-text-primary">下書き：{base?.draftEvents.length ?? 0}件</p>
        <ul className="text-[11px] leading-[19px] text-text-secondary">
          {base?.draftEvents.map((reference) => (
            <li key={reference.eventId}>
              ・{reference.eventTitle?.trim() || '無題のイベント'}（日時 {reference.slotCount}件）
            </li>
          ))}
        </ul>
      </div>

      </div>
      <div className="min-w-0 shrink-0 border-t border-border-subtle bg-canvas px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="flex-[1_1_7rem]" onClick={() => void save()} disabled={editor.saveState === 'saving' || editor.conflictOpen}>{editor.saveState === 'saving' ? '保存中…' : '下書き保存'}</Button>
          <Button className="flex-[1_1_7rem]" onClick={() => void review()} disabled={editor.saveState === 'saving' || editor.conflictOpen}>{editor.dirty ? '保存して確認' : '公開内容を確認'}</Button>
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2">
          <Button variant="danger" disabled={!isLive(current.publication.state)} onClick={() => void navigate(reviewPath('spot', current.canonicalId, 'withdraw'))}>公開をやめる</Button>
          <Button variant="secondary" className="ml-auto" disabled title="地図データの構成確定後に実装します">位置を変更</Button>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-text-secondary">名称・別名・利用状態・説明・種別はこの地点だけで公開します。位置・建物・階・経路は地図と一緒に公開します。</p>
      </div>

      <LeaveGuard id="spot-editor" dirty={editor.dirty} saving={editor.saveState === 'saving'} canSave={!editor.conflictOpen} onSave={save} />
    </div>
  )
}
