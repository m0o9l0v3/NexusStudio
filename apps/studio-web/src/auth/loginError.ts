import { ApiError, NetworkError } from '../api/client'

/**
 * ログイン失敗の種類。
 * - invalid：認証情報の誤り（未登録・パスワード違い・無効化・ロックアウトをAPIは区別しない）。L02
 * - network：サーバーへ到達できない。L04
 * - server：サーバーには届いたが処理できなかった。L04と同じ表現で文言だけを変える
 * - missing：未入力
 */
export type LoginError = 'invalid' | 'network' | 'server' | 'missing'

const messages: Record<LoginError, string> = {
  invalid: 'メールアドレスまたはパスワードが\n正しくありません。',
  network: 'サーバーに接続できません。\nしばらくしてから再度お試しください。',
  server: 'サーバーでエラーが発生しました。\nしばらくしてから再度お試しください。',
  missing: 'メールアドレスとパスワードを入力してください。',
}

export function describeLoginError(error: unknown): LoginError {
  if (error instanceof NetworkError) return 'network'
  if (error instanceof ApiError) {
    if (error.status === 401) return 'invalid'
    if (error.code === 'missing_credentials') return 'missing'
  }
  return 'server'
}

export function loginErrorMessage(error: LoginError): string {
  return messages[error]
}
