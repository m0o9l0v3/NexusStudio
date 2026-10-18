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

/**
 * 期限切れのダイアログを出す場面。文言を変える（Figma L05 `93:1562`／L07 `105:3074`）。
 * - editing：編集中（L05）
 * - publishReview：公開確認の画面（公開は送っていない、または期限切れで拒否された）
 * - publishResult：公開の結果を待っている・照会している（L07）
 */
export type SessionExpiryPurpose = 'editing' | 'publishReview' | 'publishResult'

export type SessionExpiryContextValue = {
  /** 認証済みの画面でセッション切れを検知し、再ログインを求めている。 */
  expired: boolean
  markExpired: () => void
  /** 再ログインせずにダイアログを閉じる。次にAPIが401を返したら再び表示する。 */
  dismiss: () => void
  resolve: () => void
  /** 再ログインに成功した回数。画面がこれを見て、読み取りだけの処理（結果の照会）をやり直す。 */
  resolvedCount: number
  purpose: SessionExpiryPurpose
  /** 画面が今の場面を登録する。null で既定（editing）に戻す。 */
  setPurpose: (purpose: SessionExpiryPurpose | null) => void
}

export const SessionExpiryContext = createContext<SessionExpiryContextValue | null>(null)

export function useSessionExpiry(): SessionExpiryContextValue {
  const value = useContext(SessionExpiryContext)
  if (!value) throw new Error('SessionExpiryProvider が必要です。')
  return value
}
