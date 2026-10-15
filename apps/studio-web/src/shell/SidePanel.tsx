import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useWideLayout } from './useWideLayout'

type SidePanelProps = {
  id: string
  /** 重ねて表示したときに読み上げるパネル名。 */
  label: string
  /** 1280px未満で開いているか。1280px以上では常に本文の横に並べる。 */
  open: boolean
  onClose: () => void
  /** 閉じたときにフォーカスを戻す要素（Toolbar の開閉ボタン）。 */
  returnFocusTo: RefObject<HTMLElement | null>
  children: ReactNode
}

/**
 * 右パネル（iOS Preview・最新の保存内容との比較など、幅400px）の置き場所。
 * 1280px以上では従来どおり本文の横に並べる。1280px未満では Toolbar の下に重ねて表示し、ボタンと Esc で開閉する
 * （2026-10-15 利用者判断、検証記録 A-5 D9）。重ねている間も本文は操作できる（入力しながら Preview を見るため）。
 */
export function SidePanel({ id, label, open, onClose, returnFocusTo, children }: SidePanelProps) {
  const wide = useWideLayout()
  const panel = useRef<HTMLDivElement>(null)
  const overlay = !wide && open
  // 親の再描画のたびに effect を走らせ直さない（走るとパネルへフォーカスを奪い返し、本文に入力できなくなる）。
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    if (!overlay) return
    // 開いたときに1回だけパネルへフォーカスを移す。
    panel.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      // ダイアログが開いている間の Esc はダイアログに任せる。
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[role="dialog"]')) return
      close.current()
      returnFocusTo.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [overlay, returnFocusTo])

  if (wide) return <>{children}</>
  if (!open) return null
  return (
    <div
      id={id}
      ref={panel}
      role="region"
      aria-label={label}
      tabIndex={-1}
      className="fixed top-16 right-0 bottom-0 z-20 flex max-w-[calc(100vw-216px)] shadow-floating focus:outline-none"
    >
      {children}
      <button
        type="button"
        onClick={() => {
          onClose()
          returnFocusTo.current?.focus()
        }}
        className="absolute top-3.5 right-4 flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-[12px] leading-5 font-medium text-text-primary hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        閉じる
      </button>
    </div>
  )
}
