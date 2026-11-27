import { ArrowDown, ArrowUp, ChevronLeft, Plus } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { getCategories, saveCategories, type CategoryConflict, type CategoryDraft, type CategoryListDetail } from '../../api/categories'
import { CompareRows } from '../../editing/CompareRows'
import { ConflictNotice } from '../../editing/ConflictNotice'
import { LeaveGuard } from '../../editing/LeaveGuard'
import { useDraftEditor } from '../../editing/useDraftEditor'
import { publicationBadge, reviewPath } from '../../publishing/publication'
import { Toolbar } from '../../shell/Toolbar'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { NoticeBanner } from '../../ui/NoticeBanner'
import { StatusLabel } from '../../ui/StatusLabel'
import { SegmentedControl } from '../../ui/SegmentedControl'

/** `/events/categories`。カテゴリ一覧全体を1つの下書きとして編集する（08 CAT-01〜CAT-05）。 */
export function CategoriesPage() {
  const navigate = useNavigate()
  const categories = useQuery({ queryKey: ['categories'], queryFn: getCategories, staleTime: Infinity, refetchOnWindowFocus: false })

  if (categories.data) return <CategoriesEditor initial={categories.data} />
  return (
    <>
      <CategoryToolbar />
      <main className="min-h-0 flex-1 overflow-auto bg-canvas px-4 pt-[22px] pb-10 sm:px-6">
        <div className="flex w-[1020px] max-w-full flex-col items-start gap-3">
          {categories.isPending ? (
            <NoticeBanner>カテゴリ一覧を読み込んでいます。</NoticeBanner>
          ) : (
            <NoticeBanner tone="blocking">
              カテゴリ一覧を取得できませんでした。0件とは扱わず、再試行してください。
              <Button variant="secondary" size="sm" className="ml-3" onClick={() => void categories.refetch()}>
                再試行
              </Button>
            </NoticeBanner>
          )}
          <Button variant="secondary" onClick={() => void navigate('/events')}>
            イベント一覧に戻る
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
      <CategoryToolbar publication={publication}>
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" className="text-[12px] text-text-secondary">
            {editor.statusBadge.label}
          </span>
          {blockingCount > 0 && <StatusLabel tone="danger">未入力 {blockingCount}件</StatusLabel>}
          <Button variant="secondary" onClick={() => void save()} disabled={editor.saveState === 'saving' || editor.conflictOpen}>
            {editor.saveState === 'saving' ? '保存中…' : editor.conflictOpen ? '保存不可' : '下書き保存'}
          </Button>
          <Button onClick={() => void review()} disabled={editor.saveState === 'saving' || editor.conflictOpen}>
            {editor.dirty ? '保存して確認' : '公開内容を確認'}
          </Button>
        </div>
      </CategoryToolbar>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas lg:flex-row lg:overflow-hidden">
        <main className="min-w-0 flex-1 px-6 pt-[22px] pb-10 lg:min-h-0 lg:overflow-y-auto">
          <div className="flex w-[1020px] max-w-full flex-col gap-3">
            <div>
              <h2 className="text-[14px] font-bold text-text-primary">
                カテゴリ <span className="ml-1 font-normal text-text-secondary">{rows.length}件</span>
              </h2>
              <p className="text-[12px] leading-5 text-text-secondary">
                カテゴリ一覧は全体で1つの下書きとして保存します。使わなくなったカテゴリは削除せず、新規選択停止にします（既存の参照は維持）。
              </p>
            </div>
            {editor.failure && <NoticeBanner tone="blocking">{editor.failure}</NoticeBanner>}
            {editor.conflictOpen && editor.conflict && (
              <ConflictNotice latestById={editor.conflict.latest.updatedBy?.id} next="右の比較で最新の内容を確認してから読み込んでください。" />
            )}

            <div
              aria-hidden
              className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.7fr)_minmax(80px,.7fr)_minmax(120px,1fr)] gap-4 border-b border-border-subtle pb-2 text-[12px] text-text-secondary md:grid"
            >
              <span>名称</span>
              <span>利用状態</span>
              <span>参照イベント</span>
              <span>順序</span>
            </div>
            <ol className="divide-y divide-border-subtle border-b border-border-subtle" aria-label="カテゴリ（表示順）">
              {rows.map((row, index) => {
                const existing = saved.get(row.id)
                const name = row.name?.trim() || '（未入力）'
                const duplicate = Boolean(row.name?.trim() && (nameCounts.get(row.name.trim()) ?? 0) > 1)
                return (
                  <li
                    key={row.id}
                    className="grid gap-3 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.7fr)_minmax(80px,.7fr)_minmax(120px,1fr)] md:gap-4"
                  >
                    <div className="min-w-0 space-y-1">
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
                          'h-9 w-full rounded-md border bg-canvas px-3 text-[13px] text-text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
                          !row.name?.trim() ? 'border-danger' : 'border-border-input',
                        )}
                      />
                      {!existing && <StatusLabel>新規・未保存</StatusLabel>}
                      {!row.name?.trim() && <p className="text-[11px] leading-[18px] text-danger">カテゴリ名が未入力です。下書き保存はできます。</p>}
                      {duplicate && <p className="text-[11px] leading-[18px] text-warning">同じ名前のカテゴリがあります。選択時に誤りやすいため確認してください。</p>}
                      {existing && existing.name !== (row.name ?? '') && (
                        <p className="text-[11px] leading-[18px] text-text-secondary">
                          変更前「{existing.name}」。名前を変えてもIDは変わりません。参照している{existing.referenceCount}件のイベントは、公開後に新しい名前で表示されます。
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <SegmentedControl
                        name={`category-state-${row.id}`}
                        aria-label={`${name}の利用状態`}
                        value={row.selectable ? 'selectable' : 'stopped'}
                        options={[
                          { value: 'selectable', label: '選択できます' },
                          { value: 'stopped', label: '新規選択停止' },
                        ]}
                        onChange={(value) => updateRow(row.id, { selectable: value === 'selectable' })}
                      />
                      {!row.selectable && (
                        <p className="text-[11px] leading-[18px] text-text-secondary">
                          {existing && existing.referenceCount > 0 ? `既存の${existing.referenceCount}件はそのまま表示されます。` : ''}
                          新しいイベントでは選べません。
                        </p>
                      )}
                    </div>
                    <p className="text-[12px] tabular-nums text-text-secondary md:pt-2">
                      <span className="md:hidden">参照イベント： </span>
                      {existing ? `${existing.referenceCount}件` : '未保存'}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 md:items-start md:pt-0.5">
                      <button
                        type="button"
                        className="inline-grid size-[30px] place-items-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={index === 0}
                        onClick={() => move(index, index - 1)}
                        aria-label={`${name}を上へ`}
                      >
                        <ArrowUp aria-hidden size={16} />
                      </button>
                      <button
                        type="button"
                        className="inline-grid size-[30px] place-items-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={index === rows.length - 1}
                        onClick={() => move(index, index + 1)}
                        aria-label={`${name}を下へ`}
                      >
                        <ArrowDown aria-hidden size={16} />
                      </button>
                      {!existing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-text-secondary hover:text-danger"
                          onClick={() => editor.update((current) => current.filter((item) => item.id !== row.id))}
                        >
                          取り消す
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
            {rows.length === 0 && <NoticeBanner>カテゴリは正式に0件です。［カテゴリを追加］から作成できます。</NoticeBanner>}
            <Button
              variant="ghost"
              className="self-start font-bold text-text-primary"
              onClick={() => {
                const id = crypto.randomUUID()
                focusName.current = id
                editor.update((current) => [...current, { id, name: '', selectable: true }])
              }}
            >
              <Plus aria-hidden size={15} /> カテゴリを追加
            </Button>
            <p className="text-[12px] leading-5 text-text-secondary">
              名前と並び順の変更は、公開するまでアプリに反映されません。公開すると、このカテゴリを参照している公開中のイベントの表示も変わります。
            </p>
          </div>
        </main>
        {editor.conflict && (
          <aside
            aria-label="最新の保存内容と比較"
            className="flex w-full min-w-0 shrink-0 flex-col gap-3 border-t border-border-subtle bg-canvas p-[18px] wrap-anywhere lg:w-[400px] lg:overflow-y-auto lg:border-t-0 lg:border-l"
          >
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

function CategoryToolbar({ publication, children }: { publication?: ReturnType<typeof publicationBadge>; children?: ReactNode }) {
  return (
    <Toolbar
      className="flex-wrap"
      title="カテゴリ管理"
      leading={
        <div className="flex items-center gap-2 text-[13px] leading-5 text-text-secondary">
          <Link
            to="/events"
            className="inline-flex items-center gap-1 rounded-sm hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <ChevronLeft aria-hidden size={15} strokeWidth={1.75} />
            イベント
          </Link>
          <span aria-hidden className="text-text-muted">
            /
          </span>
        </div>
      }
      titleNode={
        <span className="inline-flex flex-wrap items-center gap-2">
          カテゴリ管理 {publication && <StatusLabel tone={publication.tone}>{publication.label}</StatusLabel>}
        </span>
      }
    >
      {children}
    </Toolbar>
  )
}
