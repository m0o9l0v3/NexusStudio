import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { fetchSession, login, type Session } from '../api/auth'
import { Button } from '../ui/Button'
import { Dialog, DialogActions } from '../ui/Dialog'
import { NoticeBanner } from '../ui/NoticeBanner'
import { TextField } from '../ui/TextField'
import { describeLoginError, loginErrorMessage, type LoginError } from './loginError'
import { sessionQueryKey, useSessionExpiry, type SessionExpiryPurpose } from './session'

/** 場面ごとの文言。publishResult は Figma L07（105:3074）。publishReview は補完（UI補完記録 2026-10-15）。 */
const texts: Record<SessionExpiryPurpose, { title: string; description: string }> = {
  editing: { title: 'ログインの有効期限が切れました', description: '入力はこの画面に保持されています。再ログイン後、あらためて保存してください。' },
  publishReview: { title: 'ログインの有効期限が切れました', description: '公開内容は変わっていません。再ログイン後、公開内容を確認し直してください。' },
  publishResult: { title: '公開結果を確認するため再ログイン', description: '公開処理中にログイン期限が切れました。成功とは表示せず、再ログイン後に操作IDから結果を確認します。' },
}

/**
 * Figma L05「編集中に期限切れ」（93:1562）。画面を離れずに再ログインする。
 * 再ログインしても、保存・公開を自動で再実行しない（12 UI-04）。
 */
export function SessionExpiredDialog({ session }: { session: Session }) {
  const expiry = useSessionExpiry()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [email, setEmail] = useState(session.email)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<LoginError | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError('missing')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await login(email.trim(), password)
      const next = await fetchSession()
      if (next.id !== session.id) {
        // 別の管理者でログインした場合、前の管理者の画面状態を引き継がない。
        // 未保存の入力は確認せずに破棄する（S03 で「保存して移動」を選ぶと、前の管理者の入力を別の管理者として保存できてしまう）。
        // clear() は表示中の Sidebar 等が購読しているセッションのキャッシュまで切り離すため、セッション以外だけを捨てる。
        queryClient.setQueryData(sessionQueryKey, next)
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionQueryKey[0] })
        void navigate('/overview', { replace: true, state: { skipUnsavedGuard: true } })
      } else {
        queryClient.setQueryData(sessionQueryKey, next)
      }
      setPassword('')
      expiry.resolve()
    } catch (caught) {
      setError(describeLoginError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  const message = error ? loginErrorMessage(error) : null

  return (
    <Dialog
      open={expiry.expired}
      onOpenChange={(open) => !open && expiry.dismiss()}
      dismissible={!submitting}
      title={texts[expiry.purpose].title}
      description={texts[expiry.purpose].description}
    >
      <form className="flex flex-col gap-[18px]" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {message && (
          <p role="alert" className={`text-[12px] leading-5 font-medium whitespace-pre-line ${error === 'network' || error === 'server' ? 'text-warning' : 'text-danger'}`}>
            {message}
          </p>
        )}
        <TextField
          label="メールアドレス"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={submitting}
          invalid={error === 'invalid' || (error === 'missing' && !email.trim())}
        />
        <TextField
          label="パスワード"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting}
          invalid={error === 'invalid' || (error === 'missing' && !password)}
          autoFocus
        />
        <NoticeBanner>再ログインしても、保存や公開は自動で実行しません。</NoticeBanner>
        <DialogActions>
          <Button variant="secondary" onClick={expiry.dismiss} disabled={submitting}>
            戻る
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? '確認中…' : '再ログイン'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
