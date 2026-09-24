import { useQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { fetchSession } from '../api/auth'
import { ApiError } from '../api/client'

export const sessionQueryKey = ['session'] as const

export function useSessionQuery() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSession,
    retry: false,
    staleTime: 60_000,
    // 別タブでのログアウト・無効化・期限切れを、画面へ戻ったときに（キャッシュの鮮度に関係なく）検知する。
    refetchOnWindowFocus: 'always',
  })
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

export type SessionExpiryContextValue = {
  /** 認証済みの画面でセッション切れを検知し、再ログインを求めている。 */
  expired: boolean
  markExpired: () => void
  /** 再ログインせずにダイアログを閉じる。次にAPIが401を返したら再び表示する。 */
  dismiss: () => void
  resolve: () => void
}

export const SessionExpiryContext = createContext<SessionExpiryContextValue | null>(null)

export function useSessionExpiry(): SessionExpiryContextValue {
  const value = useContext(SessionExpiryContext)
  if (!value) throw new Error('SessionExpiryProvider が必要です。')
  return value
}
