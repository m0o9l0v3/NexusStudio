import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, LoaderCircle, Lock, Mail, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type InputHTMLAttributes, type Ref } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { fetchSession, login } from '../api/auth'
import { describeLoginError, loginErrorMessage, type LoginError } from '../auth/loginError'
import { isUnauthorized, sessionQueryKey, useSessionExpiry, useSessionQuery } from '../auth/session'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { Dialog, DialogActions, DialogClose } from '../ui/Dialog'
import { NoticeBanner } from '../ui/NoticeBanner'

/** ログイン後の戻り先。外部サイトへ飛ばされないよう、アプリ内のパスだけを受け付ける。 */
function safeReturnTo(value: string | null): string {
  // eslint-disable-next-line no-control-regex
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) {
    return '/overview'
  }

  const origin = 'https://studio.invalid'
  try {
    const parsed = new URL(value, origin)
    // React Router はパスをデコードし、大文字と小文字を区別せずに照合する。
    const routePath = decodeURI(parsed.pathname).toLowerCase()
    if (
      parsed.origin === origin &&
      parsed.pathname.startsWith('/') &&
      !parsed.pathname.startsWith('//') &&
      routePath !== '/login' && !routePath.startsWith('/login/')
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {
    return '/overview'
  }
  return '/overview'
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
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // 認証・接続に失敗したらパスワード欄へフォーカスを戻す。送信中は欄が無効になり、フォーカスが外れるため（A-2 D2）。
  // 送信のたびに error を null に戻すので、同じ失敗が続いても毎回走る。入力不足は handleSubmit で直接扱う。
  useEffect(() => {
    if (!error || error === 'missing' || submitting) return
    passwordRef.current?.focus()
  }, [error, submitting])

  if (session.data && !isUnauthorized(session.error)) {
    return <Navigate to={returnTo} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError('missing')
      // 未入力が続くと error が変わらず effect が走らないため、送信のたびに空の欄へ直接フォーカスする。
      const empty = email.trim() ? passwordRef : emailRef
      empty.current?.focus()
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
    <main className="flex min-h-svh items-center justify-center bg-surface-subtle p-4">
      <section aria-labelledby="login-title" className="w-full max-w-[440px] rounded-lg border border-border bg-canvas px-6 pt-8 pb-7 shadow-floating sm:px-9">
        <header className="flex flex-col gap-1.5">
          <p className="flex gap-[7px] text-[24px] leading-[32px] font-bold tracking-[-0.02em] sm:text-[26px] sm:leading-[35px]">
            <span className="text-brand">Nexus</span><span className="text-text-primary">Studio</span>
          </p>
          <h1 id="login-title" className="text-[15px] leading-[22px] font-bold text-text-primary">管理者ログイン</h1>
          <p className="text-[12px] leading-[19px] text-text-secondary">登録済み管理者のアカウントでログイン</p>
        </header>
        <form className="mt-[22px] flex w-full flex-col" onSubmit={(event) => void handleSubmit(event)} noValidate>
          {connectionProblem && <NoticeBanner tone="warning" className="mb-4"><span className="whitespace-pre-line">{loginErrorMessage(error)}</span></NoticeBanner>}
          {credentialsProblem && <NoticeBanner tone="blocking" className="mb-4"><span className="whitespace-pre-line">{loginErrorMessage(error)}</span></NoticeBanner>}
          <fieldset disabled={submitting} className="flex flex-col gap-4 disabled:opacity-55">
            <LoginField label="メールアドレス" icon={Mail} type="email" autoComplete="username" placeholder="name@example.com"
              value={email} onChange={(event) => setEmail(event.target.value)} invalid={error === 'missing' && !email.trim()} inputRef={emailRef} autoFocus />
            <LoginField label="パスワード" icon={Lock} type="password" autoComplete="current-password"
              value={password} onChange={(event) => setPassword(event.target.value)} invalid={error === 'invalid' || (error === 'missing' && !password)} inputRef={passwordRef} />
          </fieldset>
          <div className="flex flex-col gap-4 pt-6">
            <Button type="submit" disabled={submitting} aria-busy={submitting || undefined} className="h-11 w-full text-[14px]">
              {submitting ? <><LoaderCircle aria-hidden size={16} strokeWidth={2} className="animate-spin" />ログイン中…</> : <>ログイン<ArrowRight aria-hidden size={16} strokeWidth={2} /></>}
            </Button>
            {!submitting && <button type="button" onClick={() => setRecoveryOpen(true)} className="self-center rounded-sm text-[12px] leading-5 font-normal text-brand underline hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">パスワードを忘れた場合</button>}
          </div>
        </form>
        <p className="pt-[22px] text-center text-[11px] leading-[18px] text-text-muted">登録済み管理者専用</p>
      </section>

      <Dialog
        open={recoveryOpen}
        onOpenChange={setRecoveryOpen}
        title="パスワードを忘れた場合"
        description={'管理者アカウントの再発行は運用担当者へ依頼してください。\nStudio上での自己リセットは設けていません。'}
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

type LoginFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; icon: LucideIcon; invalid?: boolean; inputRef?: Ref<HTMLInputElement> }

function LoginField({ label, icon: Icon, invalid, inputRef, ...props }: LoginFieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={cn('text-[12px] leading-[17px] font-normal', invalid ? 'text-danger' : 'text-text-secondary')}>
        {label}
      </label>
      <div
        className={cn(
          'flex h-10 items-center gap-2.5 rounded-md border bg-canvas px-3',
          'focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand',
          invalid ? 'border-danger' : 'border-border-input focus-within:border-brand',
        )}
      >
        <Icon aria-hidden size={16} className={cn('shrink-0', invalid ? 'text-danger' : 'text-text-muted')} />
        <input
          ref={inputRef}
          id={id}
          aria-invalid={invalid || undefined}
          className="min-w-0 flex-1 bg-transparent text-[13px] leading-[21px] text-text-primary outline-none placeholder:text-text-muted"
          {...props}
        />
      </div>
    </div>
  )
}
