import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { FullPageStatus } from '../ui/FullPageStatus'
import { Button } from '../ui/Button'
import { isUnauthorized, useSessionExpiry, useSessionQuery } from './session'
import { SessionExpiredDialog } from './SessionExpiredDialog'

/**
 * 認証済みの管理者だけに画面を表示する（12 UI-03）。
 * - 最初から未ログイン：ログイン画面へ移動し、ログイン後に元の画面へ戻す。
 * - 利用中にセッションが切れた：画面を離れずに再ログインを求める（L05）。
 * - 確認できなかった（通信失敗）：未ログインとも問題なしとも扱わず、再試行を示す（UI-13）。
 */
export function RequireAuth() {
  const session = useSessionQuery()
  const expiry = useSessionExpiry()
  const location = useLocation()
  const sessionEndedWhileUsing = session.data !== undefined && isUnauthorized(session.error)

  const { markExpired } = expiry
  useEffect(() => {
    // errorUpdatedAt が変わるたびに（=401を受けるたびに）再表示する。
    if (sessionEndedWhileUsing) markExpired()
  }, [sessionEndedWhileUsing, session.errorUpdatedAt, markExpired])

  if (session.data) {
    return (
      <>
        <Outlet />
        <SessionExpiredDialog session={session.data} />
      </>
    )
  }

  if (session.isPending) {
    return <FullPageStatus title="読み込んでいます" message="ログイン状態を確認しています。" busy />
  }

  if (isUnauthorized(session.error)) {
    const returnTo = location.pathname + location.search
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }

  return (
    <FullPageStatus
      title="ログイン状態を確認できませんでした"
      message="サーバーに接続できません。未ログインと判断せず、接続を確認して再試行してください。"
    >
      <Button onClick={() => void session.refetch()} disabled={session.isFetching}>
        再試行
      </Button>
    </FullPageStatus>
  )
}
