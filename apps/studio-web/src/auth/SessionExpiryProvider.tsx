import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onUnauthorized } from '../api/client'
import { SessionExpiryContext, type SessionExpiryPurpose } from './session'

type ExpiryState = 'active' | 'expired' | 'dismissed'

export function SessionExpiryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ExpiryState>('active')
  const [resolvedCount, setResolvedCount] = useState(0)
  const [registered, setRegistered] = useState<SessionExpiryPurpose | null>(null)
  const markExpired = useCallback(() => setState('expired'), [])
  const dismiss = useCallback(() => setState('dismissed'), [])
  const resolve = useCallback(() => {
    setState('active')
    setResolvedCount((count) => count + 1)
  }, [])

  useEffect(() => onUnauthorized(markExpired), [markExpired])

  const value = useMemo(
    () => ({ expired: state === 'expired', markExpired, dismiss, resolve, resolvedCount, purpose: registered ?? 'editing', setPurpose: setRegistered }),
    [state, markExpired, dismiss, resolve, resolvedCount, registered],
  )
  return <SessionExpiryContext.Provider value={value}>{children}</SessionExpiryContext.Provider>
}
