import { useSessionQuery } from '../auth/session'
import { NoticeBanner } from '../ui/NoticeBanner'

type ConflictNoticeProps = {
  /** 最新の内容を保存した管理者のID（取り込みなど管理者でない場合は null）。 */
  latestById: string | null | undefined
  /** 次にすべき操作の案内。 */
  next: string
}

/**
 * 保存競合（409）の帯。保存者がログイン中の管理者自身なら、別の画面か応答が届かなかった自分の保存と競合している。
 * 2026-10-15 利用者判断（検証記録 A-4 D6）。
 */
export function ConflictNotice({ latestById, next }: ConflictNoticeProps) {
  const { data: session } = useSessionQuery()
  const byMe = session !== undefined && latestById === session.id
  const cause = byMe ? '別の画面または応答が届かなかった保存で、先に保存されています。' : '他の管理者が先に保存しました。'
  return <NoticeBanner tone="warning">{`${cause}あなたの入力は保持されています。${next}`}</NoticeBanner>
}
