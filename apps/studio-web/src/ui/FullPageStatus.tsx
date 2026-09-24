import type { ReactNode } from 'react'

/** 画面全体を使う読み込み中・取得失敗の表示。App Shellを描く前（ログイン確認中など）に使う。 */
export function FullPageStatus({ title, message, busy, children }: { title: string; message: string; busy?: boolean; children?: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas p-4">
      <div
        role={busy ? 'status' : 'alert'}
        aria-busy={busy || undefined}
        className="flex w-[440px] max-w-full flex-col items-start gap-3 rounded-2xl border border-border bg-surface px-[38px] py-8 shadow-floating"
      >
        <p className="text-[16px] leading-6 font-bold text-text-primary">{title}</p>
        <p className="text-[13px] leading-[21px] text-text-secondary">{message}</p>
        {children}
      </div>
    </main>
  )
}
