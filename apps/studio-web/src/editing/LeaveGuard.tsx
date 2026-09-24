import { useBlocker, type Location } from 'react-router'
import { useRegisterUnsavedChanges } from '../shell/unsavedChanges'
import { Button } from '../ui/Button'
import { Dialog, DialogActions } from '../ui/Dialog'

type LeaveGuardProps = {
  /** ログアウト確認（E32）で使う登録名。画面ごとに一意にする。 */
  id: string
  dirty: boolean
  saving: boolean
  canSave: boolean
  /** 保存に成功したら true。 */
  onSave: () => Promise<boolean>
}

/**
 * 未保存の変更がある画面から移動するときの確認（Figma S03 `12:232`）。保存に失敗したら画面に留まる（12 UI-12）。
 * `navigate(..., { state: { skipUnsavedGuard: true } })` の移動は確認しない（保存直後やログアウト時）。
 */
export function LeaveGuard({ id, dirty, saving, canSave, onSave }: LeaveGuardProps) {
  useRegisterUnsavedChanges(id, dirty)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const skip = (nextLocation as Location<{ skipUnsavedGuard?: boolean } | null>).state?.skipUnsavedGuard
    return dirty && !skip && nextLocation.pathname + nextLocation.search !== currentLocation.pathname + currentLocation.search
  })

  return (
    <Dialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => !open && blocker.reset?.()}
      dismissible={!saving}
      title="未保存の変更があります"
      description="この画面を離れる前に、変更を保存するか破棄するか選択してください。保存に失敗した場合はこの画面に留まります。"
    >
      <DialogActions>
        <Button variant="secondary" onClick={() => blocker.reset?.()} disabled={saving}>
          編集へ戻る
        </Button>
        <Button variant="danger" onClick={() => blocker.proceed?.()} disabled={saving}>
          変更を破棄
        </Button>
        <Button
          disabled={saving || !canSave}
          onClick={async () => {
            if (await onSave()) blocker.proceed?.()
            else blocker.reset?.()
          }}
        >
          {saving ? '保存中…' : '保存して移動'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
