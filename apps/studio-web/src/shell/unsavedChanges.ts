import { createContext, useContext, useEffect } from 'react'

export type UnsavedChangesRegistry = {
  /** いま未保存の変更を持つ画面があるか。 */
  hasUnsavedChanges: () => boolean
  register: (id: string, hasChanges: boolean) => void
}

export const UnsavedChangesContext = createContext<UnsavedChangesRegistry | null>(null)

export function useUnsavedChangesRegistry(): UnsavedChangesRegistry {
  const registry = useContext(UnsavedChangesContext)
  if (!registry) throw new Error('UnsavedChangesProvider が必要です。')
  return registry
}

/** 編集画面が未保存の変更を登録する。ログアウト（E32）やタブを閉じる操作の前に確認するために使う。 */
export function useRegisterUnsavedChanges(id: string, hasChanges: boolean): void {
  const registry = useUnsavedChangesRegistry()
  useEffect(() => {
    registry.register(id, hasChanges)
    return () => registry.register(id, false)
  }, [registry, id, hasChanges])

  useEffect(() => {
    if (!hasChanges) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasChanges])
}
