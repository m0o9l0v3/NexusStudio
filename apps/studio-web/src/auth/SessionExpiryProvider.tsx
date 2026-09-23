import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onUnauthorized } from '../api/client'
import { SessionExpiryContext } from './session'

type ExpiryState = 'active' | 'expired' | 'dismissed'

export function SessionExpiryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ExpiryState>('active')
  const markExpired = useCallback(() => setState('expired'), [])
  const dismiss = useCallback(() => setState('dismissed'), [])
  const resolve = useCallback(() => setState('active'), [])

  useEffect(() => onUnauthorized(markExpired), [markExpired])

  const value = useMemo(
    () => ({ expired: state === 'expired', markExpired, dismiss, resolve }),
    [state, markExpired, dismiss, resolve],
  )
  return <SessionExpiryContext.Provider value={value}>{children}</SessionExpiryContext.Provider>
}
