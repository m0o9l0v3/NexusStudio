import { useRef, useState } from 'react'
import { ApiError } from '../api/client'
import type { StatusTone } from '../ui/StatusBadge'

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'conflict'

export type ConflictState<TDetail, TDraft> = { latest: TDetail; mine: TDraft; resolved: boolean }

type Options<TDetail, TDraft> = {
  initial: TDetail | null
  /** 新規作成の初期値（initial が null の場合）。 */
  newDraft: () => TDraft
  draftOf: (detail: TDetail) => TDraft
  persist: (args: { operationId: string; base: TDetail | null; draft: TDraft }) => Promise<TDetail>
  /** 409応答の本文から最新の内容を取り出す。 */
  latestFromConflict: (body: unknown) => TDetail
}

const SAVE_FAILED = '保存できませんでした。入力は保持されています。接続を確認して再試行してください。'

function problemsOf(body: unknown): string {
  const problems = (body as { problems?: { message: string }[] } | undefined)?.problems ?? []
  return problems.map((problem) => problem.message).join(' ')
}

/**
 * 下書きの編集と保存（未保存・保存中・保存済み・保存失敗・保存競合）。Events・Open Campus・カテゴリ・Spotで共通。
 * - 同じ内容の保存を再試行するときは同じ operationId を使い、応答が失われた保存を二重に作らない。
 * - 409では自分の入力を保持し、上書き保存は出さない。［最新の内容を読み込む］で最新版を基準に編集を再開する。
 * - 401は失敗として扱い、成功とは表示しない（再ログインダイアログは共通の仕組みで出る）。
 */
export function useDraftEditor<TDetail, TDraft>({ initial, newDraft, draftOf, persist, latestFromConflict }: Options<TDetail, TDraft>) {
  const [initialNew] = useState(() => (initial ? null : newDraft()))
  const [draft, setDraft] = useState<TDraft>(() => (initial ? draftOf(initial) : initialNew!))
  const [base, setBase] = useState<TDetail | null>(initial)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictState<TDetail, TDraft> | null>(null)
  const pendingOperation = useRef<{ id: string; key: string } | null>(null)

  const savedDraft = base ? draftOf(base) : initialNew!
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft)
  const conflictOpen = conflict !== null && !conflict.resolved

  function update(updater: (current: TDraft) => TDraft) {
    setDraft(updater)
    setSaveState((state) => (state === 'saved' ? 'idle' : state))
  }

  /** 保存に成功したら保存後の内容を返す。 */
  async function save(): Promise<TDetail | null> {
    if (saveState === 'saving' || conflictOpen) return null
    const snapshot = draft
    const key = JSON.stringify(snapshot)
    const operationId = pendingOperation.current?.key === key ? pendingOperation.current.id : crypto.randomUUID()
    pendingOperation.current = { id: operationId, key }
    setSaveState('saving')
    setFailure(null)

    try {
      const detail = await persist({ operationId, base, draft: snapshot })
      pendingOperation.current = null
      setBase(detail)
      // サーバーは保存時に並びや前後の空白を整える。保存中に入力が無ければ、保存された内容をそのまま表示する。
      setDraft((current) => (JSON.stringify(current) === key ? draftOf(detail) : current))
      setSaveState('saved')
      return detail
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        pendingOperation.current = null
        setConflict({ latest: latestFromConflict(error.body), mine: snapshot, resolved: false })
        setSaveState('conflict')
      } else if (error instanceof ApiError && error.status === 401) {
        setSaveState('failed')
        setFailure('ログインの有効期限が切れたため保存できませんでした。入力は保持されています。再ログイン後、あらためて保存してください。')
      } else if (error instanceof ApiError && error.status === 400) {
        pendingOperation.current = null
        setSaveState('failed')
        setFailure(`保存できない入力があります。${problemsOf(error.body)}`)
      } else if (error instanceof ApiError && error.status === 404) {
        setSaveState('failed')
        setFailure('対象が見つからないため保存できませんでした。入力は保持されています。')
      } else {
        setSaveState('failed')
        setFailure(SAVE_FAILED)
      }
      return null
    }
  }

  function loadLatest() {
    if (!conflict) return
    setBase(conflict.latest)
    setDraft(draftOf(conflict.latest))
    setConflict({ ...conflict, resolved: true })
    setSaveState('idle')
    setFailure(null)
  }

  const statusBadge: { label: string; tone: StatusTone } =
    saveState === 'saving'
      ? { label: '保存中', tone: 'neutral' }
      : saveState === 'conflict'
        ? { label: '保存競合', tone: 'warning' }
        : saveState === 'failed' && dirty
          ? { label: '保存失敗', tone: 'danger' }
          : dirty || !base
            ? { label: '未保存', tone: 'warning' }
            : { label: '保存済み', tone: 'success' }

  return {
    draft,
    update,
    base,
    dirty,
    saveState,
    failure,
    conflict,
    conflictOpen,
    statusBadge,
    save,
    loadLatest,
    closeConflict: () => setConflict(null),
  }
}
