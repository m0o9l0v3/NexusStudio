import { useMemo, useRef, type ReactNode } from 'react'
import { UnsavedChangesContext, type UnsavedChangesRegistry } from './unsavedChanges'

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<string, boolean>())
  const registry = useMemo<UnsavedChangesRegistry>(
    () => ({
      hasUnsavedChanges: () => [...entries.current.values()].some(Boolean),
      register: (id, hasChanges) => {
        if (hasChanges) entries.current.set(id, true)
        else entries.current.delete(id)
      },
    }),
    [],
  )
  return <UnsavedChangesContext.Provider value={registry}>{children}</UnsavedChangesContext.Provider>
}
