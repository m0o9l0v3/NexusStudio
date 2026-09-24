import { useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { fetchSession, login } from '../api/auth'
import lockIcon from '../assets/icons/lock.svg'
import mailIcon from '../assets/icons/mail.svg'
import { describeLoginError, loginErrorMessage, type LoginError } from '../auth/loginError'
import { isUnauthorized, sessionQueryKey, useSessionExpiry, useSessionQuery } from '../auth/session'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { Dialog, DialogActions, DialogClose } from '../ui/Dialog'

/** ログイン後の戻り先。外部サイトへ飛ばされないよう、アプリ内のパスだけを受け付ける。 */
function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) return '/overview'
  return value
}

/**
 * Figma L01〜L04（54:2・55:2・55:31・55:58）とL06（93:1763）。
 * 公開サインアップ・パスワードの自己リセットは設けない。
 */
export function LoginPage() {
  const [params] = useSearchParams()
  const returnTo = safeReturnTo(params.get('returnTo'))
  const session = useSessionQuery()
  const expiry = useSessionExpiry()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<LoginError | null>(null)
  const [recoveryOpen, setRecoveryOpen] = useState(false)

  if (session.data && !isUnauthorized(session.error)) {
    return <Navigate to={returnTo} replace />
  }

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
      queryClient.clear()
      queryClient.setQueryData(sessionQueryKey, await fetchSession())
      expiry.resolve()
      void navigate(returnTo, { replace: true })
    } catch (caught) {
      setError(describeLoginError(caught))
      setPassword('')
      setSubmitting(false)
    }
  }

  const connectionProblem = error === 'network' || error === 'server'
  const credentialsProblem = error === 'invalid' || error === 'missing'

  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas p-4">
      <section
        aria-labelledby="login-title"
        className="flex w-[440px] max-w-full flex-col rounded-2xl border border-border bg-surface px-[38px] pt-[38px] pb-[21px] shadow-floating"
      >
        <header className="flex flex-col gap-[9px]">
          <p className="flex gap-[7px] text-[26px] leading-[35px] font-bold">
            <span className="text-brand">Nexus</span>
            <span className="text-text-primary">Studio</span>
          </p>
          <h1 id="login-title" className="text-[14px] leading-[23px] font-medium text-text-primary">
            管理者ログイン
          </h1>
          <p className="text-[12px] leading-[21px] text-text-secondary">登録済み管理者のアカウントでログイン</p>
        </header>

        <form className="flex w-[360px] max-w-full flex-col" onSubmit={(event) => void handleSubmit(event)} noValidate>
          {connectionProblem && (
            <div role="alert" className="mt-2 flex items-center gap-[9px] rounded-lg bg-warning-subtle px-3 py-2.5 font-medium text-warning">
              <span aria-hidden className="text-[19px] leading-[25px]">
                △
              </span>
              <p className="text-[11px] leading-[17px] whitespace-pre-line">{loginErrorMessage(error)}</p>
            </div>
          )}
          {credentialsProblem && (
            <p role="alert" className="pt-2.5 text-[12px] leading-5 font-medium whitespace-pre-line text-danger">
              {loginErrorMessage(error)}
            </p>
          )}

          <fieldset
            disabled={submitting}
            className={cn('flex flex-col gap-[18px] disabled:opacity-55', connectionProblem ? 'pt-2.5' : error ? 'pt-4' : 'pt-[31px]')}
          >
            <LoginField
              label="メールアドレス"
              icon={mailIcon}
              type="email"
              autoComplete="username"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              invalid={error === 'missing' && !email.trim()}
              autoFocus
            />
            <LoginField
              label="パスワード"
              icon={lockIcon}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={error === 'invalid' || (error === 'missing' && !password)}
            />
          </fieldset>

          <div className="flex flex-col gap-[17px] pt-[25px]">
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting || undefined}
              className={cn(
                'flex h-12 w-full items-center justify-center gap-[9px] rounded-lg bg-brand text-surface',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                submitting ? 'cursor-wait opacity-45' : 'hover:bg-brand/90',
              )}
            >
              <span className="text-[14px] leading-[22px] font-medium">{submitting ? 'ログイン中…' : 'ログイン'}</span>
              <span aria-hidden className={cn('text-[17px] leading-[25px]', submitting && 'animate-spin')}>
                {submitting ? '◌' : '→'}
              </span>
            </button>
            {!submitting && (
              <button
                type="button"
                onClick={() => setRecoveryOpen(true)}
                className="self-center text-[12px] leading-5 font-medium text-brand underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                パスワードを忘れた場合
              </button>
            )}
          </div>
        </form>

        <p className="pt-[15px] text-center text-[11px] leading-[19px] text-text-secondary">登録済み管理者専用</p>
      </section>

      <Dialog
        open={recoveryOpen}
        onOpenChange={setRecoveryOpen}
        title="パスワードを忘れた場合"
        description="管理者アカウントの再発行は運用担当者へ依頼してください。Studio上での自己リセットは設けていません。"
      >
        <DialogActions>
          <DialogClose asChild>
            <Button variant="secondary">ログインへ戻る</Button>
          </DialogClose>
        </DialogActions>
      </Dialog>
    </main>
  )
}

type LoginFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; icon: string; invalid?: boolean }

function LoginField({ label, icon, invalid, ...props }: LoginFieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-[7px]">
      <label htmlFor={id} className={cn('text-[12px] leading-5 font-medium', invalid ? 'text-danger' : 'text-text-primary')}>
        {label}
      </label>
      <div
        className={cn(
          'flex h-12 items-center gap-2.5 rounded-lg border bg-surface px-3.5',
          'focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand',
          invalid ? 'border-danger' : 'border-border',
        )}
      >
        <img src={icon} alt="" width={18} height={18} className="shrink-0" />
        <input
          id={id}
          aria-invalid={invalid || undefined}
          className="min-w-0 flex-1 bg-transparent text-[13px] leading-[21px] text-text-primary outline-none placeholder:text-text-secondary"
          {...props}
        />
      </div>
    </div>
  )
}
