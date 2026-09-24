import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'
import { getCategories, saveCategories, type CategoryConflict, type CategoryDraft, type CategoryListDetail } from '../../api/categories'
import { CompareRows } from '../../editing/CompareRows'
import { LeaveGuard } from '../../editing/LeaveGuard'
import { useDraftEditor } from '../../editing/useDraftEditor'
import { publicationBadge, reviewPath } from '../../publishing/publication'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusBadge } from '../../ui/StatusBadge'

/** `/events/categories`。カテゴリ一覧全体を1つの下書きとして編集する（08 CAT-01〜CAT-05）。 */
export function CategoriesPage() {
  const navigate = useNavigate()
  const categories = useQuery({ queryKey: ['categories'], queryFn: getCategories, staleTime: Infinity, refetchOnWindowFocus: false })

  if (categories.data) return <CategoriesEditor initial={categories.data} />
  return (
    <>
      <Toolbar title="Events / カテゴリ管理" />
      <main className="min-h-0 flex-1 overflow-auto px-6 pt-[22px] pb-10">
        <div className="flex w-[1020px] max-w-full flex-col items-start gap-3">
          {categories.isPending ? (
            <NoticeBanner>カテゴリ一覧を読み込んでいます。</NoticeBanner>
          ) : (
            <NoticeBanner tone="blocking">
              カテゴリ一覧を取得できませんでした。0件とは扱わず、再試行してください。
              <Button variant="secondary" className="ml-3" onClick={() => void categories.refetch()}>
                再試行
              </Button>
            </NoticeBanner>
          )}
          <Button variant="secondary" onClick={() => void navigate('/events')}>
            Eventsへ戻る
          </Button>
        </div>
      </main>
    </>
  )
}

type Row = CategoryDraft

function CategoriesEditor({ initial }: { initial: CategoryListDetail }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const editor = useDraftEditor<CategoryListDetail, Row[]>({
    initial,
    newDraft: () => [],
    draftOf: (detail) => detail.items.map((item) => ({ id: item.id, name: item.name, selectable: item.selectable })),
    persist: ({ operationId, base, draft }) => saveCategories(operationId, base!.rowVersion, draft),
    // 409では常に最新内容が返る（OpenAPIではジェネリック型のためnull許容になっている）。
    latestFromConflict: (body) => (body as CategoryConflict).latest!,
  })
  const rows = editor.draft
  const saved = useMemo(() => new Map((editor.base?.items ?? []).map((item) => [item.id, item])), [editor.base])
  const focusName = useRef<string | null>(null)

  useEffect(() => {
    if (!focusName.current) return
    document.getElementById(`category-name-${focusName.current}`)?.focus()
    focusName.current = null
  }, [rows.length])

  const nameCounts = new Map<string, number>()
  for (const row of rows) {
    const name = row.name?.trim()
    if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
  }
  const blockingCount = rows.filter((row) => !row.name?.trim()).length

  function updateRow(id: string, patch: Partial<Row>) {
    editor.update((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function move(index: number, to: number) {
    editor.update((current) => {
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  async function save(): Promise<boolean> {
    const detail = await editor.save()
    if (!detail) return false
    queryClient.setQueryData(['categories'], detail)
    void queryClient.invalidateQueries({ queryKey: ['reference'] })
    return true
  }

  /** 公開確認へ。未保存の変更があれば先に保存する（11 §5）。 */
  async function review() {
    if (editor.dirty && !(await save())) return
    void navigate(reviewPath('categories', 'categories'), { state: { skipUnsavedGuard: true } })
  }

  const publication = publicationBadge((editor.base ?? initial).publication.state)

  const describe = (items: Row[]) =>
    items.map((row, index) => `${index + 1}. ${row.name?.trim() || '（未入力）'}${row.selectable ? '' : '（新規選択停止）'}`).join('\n') || 'カテゴリなし'

  return (
    <>
      <Toolbar title="Events / カテゴリ管理">
        <StatusBadge tone={publication.tone}>{publication.label}</StatusBadge>
        <StatusBadge tone={editor.statusBadge.tone}>
          <span role="status">{editor.statusBadge.label}</span>
        </StatusBadge>
        {blockingCount > 0 && <StatusBadge tone="danger">公開阻止 {blockingCount}件</StatusBadge>}
        <Button className="min-w-[93px]" onClick={() => void save()} disabled={editor.saveState === 'saving' || editor.conflictOpen}>
          {editor.saveState === 'saving' ? '保存中…' : editor.conflictOpen ? '保存不可' : '下書き保存'}
        </Button>
        <Button variant="secondary" onClick={() => void navigate('/events')}>
          Eventsへ戻る
        </Button>
        <Button variant="secondary" onClick={() => void review()} disabled={editor.saveState === 'saving' || editor.conflictOpen}>
          {editor.dirty ? '保存して確認' : '公開内容を確認'}
        </Button>
      </Toolbar>

      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 flex-1 overflow-auto px-6 pt-[22px] pb-10">
          <div className="flex w-[1020px] max-w-full flex-col gap-3">
            <div>
              <h2 className="text-[22px] leading-[30px] font-bold text-text-primary">カテゴリ管理</h2>
              <p className="text-[12px] leading-5 text-text-secondary">
                カテゴリ一覧は全体で1つの下書きとして保存します。使わなくなったカテゴリは削除せず、新規選択停止にします（既存の参照は維持）。
              </p>
            </div>
            {editor.failure && <NoticeBanner tone="blocking">{editor.failure}</NoticeBanner>}
            {editor.conflictOpen && (
              <NoticeBanner tone="warning">他の管理者が先に保存しました。あなたの入力は保持されています。右の比較で最新の内容を確認してから読み込んでください。</NoticeBanner>
            )}

            <div aria-hidden className="flex h-8 items-center gap-3 px-3.5 text-[11px] leading-[19px] text-text-secondary">
              <span className="w-[320px]">名称</span>
              <span className="w-[200px]">利用状態</span>
              <span className="w-[90px]">参照</span>
              <span>順序</span>
            </div>
            <ol className="flex flex-col gap-3" aria-label="カテゴリ（表示順）">
              {rows.map((row, index) => {
                const existing = saved.get(row.id)
                const name = row.name?.trim() || '（未入力）'
                const duplicate = Boolean(row.name?.trim() && (nameCounts.get(row.name.trim()) ?? 0) > 1)
                return (
                  <li key={row.id} className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3">
                    <div className="flex w-[320px] flex-col gap-1">
                      <label htmlFor={`category-name-${row.id}`} className="sr-only">
                        {index + 1}番目のカテゴリ名
                      </label>
                      <input
                        id={`category-name-${row.id}`}
                        value={row.name ?? ''}
                        placeholder="（未入力）"
                        onChange={(event) => updateRow(row.id, { name: event.target.value })}
                        aria-invalid={!row.name?.trim() || undefined}
                        className={cn(
                          'h-10 rounded-[7px] border bg-surface px-3 text-[13px] leading-[21px] text-text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
                          !row.name?.trim() ? 'border-danger' : 'border-border',
                        )}
                      />
                      {!row.name?.trim() && <p className="text-[11px] leading-[19px] text-danger">カテゴリ名が未入力です。下書き保存はできます。</p>}
                      {duplicate && <p className="text-[11px] leading-[19px] text-warning">同じ名前のカテゴリがあります。選択時に誤りやすいため確認してください。</p>}
                      {existing && existing.name !== (row.name ?? '') && <p className="text-[11px] leading-[19px] text-text-secondary">IDは変わらず、参照しているイベントの表示名が変わります。</p>}
                    </div>
                    <div className="w-[200px]">
                      <label htmlFor={`category-state-${row.id}`} className="sr-only">
                        {name}の利用状態
                      </label>
                      <select
                        id={`category-state-${row.id}`}
                        value={row.selectable ? 'selectable' : 'stopped'}
                        onChange={(event) => updateRow(row.id, { selectable: event.target.value === 'selectable' })}
                        className="h-10 w-full rounded-[7px] border border-border bg-surface px-3 text-[13px] leading-[21px] text-text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                      >
                        <option value="selectable">選択できます</option>
                        <option value="stopped">新規選択停止</option>
                      </select>
                    </div>
                    <p className="w-[90px] text-[12px] leading-5 text-text-secondary">{existing ? `${existing.referenceCount}件` : '未保存'}</p>
                    <div className="flex gap-2">
                      <Button variant="secondary" className="min-w-0 px-3" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label={`${name}を上へ`}>
                        ↑
                      </Button>
                      <Button variant="secondary" className="min-w-0 px-3" disabled={index === rows.length - 1} onClick={() => move(index, index + 1)} aria-label={`${name}を下へ`}>
                        ↓
                      </Button>
                      {!existing && (
                        <Button variant="danger" onClick={() => editor.update((current) => current.filter((item) => item.id !== row.id))}>
                          追加を取り消す
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
            {rows.length === 0 && <NoticeBanner>カテゴリは正式に0件です。［カテゴリを追加］から作成できます。</NoticeBanner>}
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => {
                const id = crypto.randomUUID()
                focusName.current = id
                editor.update((current) => [...current, { id, name: '', selectable: true }])
              }}
            >
              カテゴリを追加
            </Button>
          </div>
        </main>
        {editor.conflict && (
          <aside aria-label="最新の保存内容と比較" className="flex w-[400px] shrink-0 flex-col gap-3 overflow-auto border-l border-border bg-surface p-[18px]">
            <CompareRows
              rows={[{ label: 'カテゴリ一覧', mine: describe(editor.conflict.mine), latest: describe(editor.conflict.latest.items) }]}
              latestBy={editor.conflict.latest.updatedBy?.displayName ?? '取り込み'}
              resolved={editor.conflict.resolved}
              onLoadLatest={editor.loadLatest}
              onClose={editor.closeConflict}
            />
          </aside>
        )}
      </div>

      <LeaveGuard id="categories-editor" dirty={editor.dirty} saving={editor.saveState === 'saving'} canSave={!editor.conflictOpen} onSave={save} />
    </>
  )
}
