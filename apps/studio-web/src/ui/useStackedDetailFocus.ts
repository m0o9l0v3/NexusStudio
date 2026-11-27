import { useLayoutEffect, useRef, useState } from 'react'

const desktopQuery = '(min-width: 1024px)'

export function useStackedDetailFocus(selectedId: string | null, detailReady: boolean) {
  const listRef = useRef<HTMLElement>(null)
  const detailRef = useRef<HTMLElement>(null)
  const [selection, setSelection] = useState<{ id: string } | null>(null)
  const handled = useRef<typeof selection>(null)

  useLayoutEffect(() => {
    const detail = detailRef.current
    if (!detail || !selection || selection.id !== selectedId || window.matchMedia(desktopQuery).matches) return
    const heading = detail.querySelector<HTMLHeadingElement>('h2')
    if (handled.current !== selection) {
      handled.current = selection
      detail.scrollIntoView({ block: 'start' })
      const target = heading ?? detail
      target.focus({ preventScroll: true })
    } else if (heading && document.activeElement === detail) {
      // 読み込み中や再試行後も、利用者が詳細から移動していなければ見出しに進める。
      detail.scrollIntoView({ block: 'start' })
      heading.focus({ preventScroll: true })
    }
  }, [selection, selectedId, detailReady])

  function requestDetailFocus(id: string) {
    if (!window.matchMedia(desktopQuery).matches) setSelection({ id })
  }

  function returnToList() {
    setSelection(null)
    const target = listRef.current?.querySelector<HTMLElement>('button[aria-current="true"]') ?? listRef.current?.querySelector('h2')
    target?.scrollIntoView({ block: 'start' })
    target?.focus({ preventScroll: true })
  }

  return { listRef, detailRef, requestDetailFocus, returnToList }
}
