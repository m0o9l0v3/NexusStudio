import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

/** 画面全体を使う読み込み中・取得失敗の表示。App Shellを描く前（ログイン確認中など）に使う。 */
export function FullPageStatus({ title, message, busy, children }: { title: string; message: string; busy?: boolean; children?: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-surface-subtle p-4">
      <div
        role={busy ? 'status' : 'alert'}
        aria-busy={busy || undefined}
        className="flex w-[440px] max-w-full flex-col items-start gap-3 rounded-lg border border-border bg-canvas px-6 py-7 sm:px-9 sm:py-8 shadow-floating"
      >
        <h1 className="flex items-center gap-2 text-[16px] leading-6 font-bold text-text-primary">{busy && <LoaderCircle aria-hidden size={16} className="shrink-0 animate-spin text-brand" />}{title}</h1>
        <p className="text-[13px] leading-[21px] text-text-secondary">{message}</p>
        {children}
      </div>
    </main>
  )
}
