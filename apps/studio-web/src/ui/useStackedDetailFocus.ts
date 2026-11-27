import { useLayoutEffect, useRef, useState } from 'react'

const desktopQuery = '(min-width: 1024px)'

type DetailStatus = 'empty' | 'loading' | 'ready' | 'notFound' | 'error'

export function useStackedDetailFocus(selectedId: string | null, detailStatus: DetailStatus, revisionKey: number) {
  const listRef = useRef<HTMLElement>(null)
  const detailRef = useRef<HTMLElement>(null)
  const [selection, setSelection] = useState<{ id: string } | null>(null)
  const handled = useRef<typeof selection>(null)
  const focusInsideDetailRef = useRef(false)
  const scrollAfterLoading = useRef<typeof selection>(null)

  useLayoutEffect(() => {
    function trackFocus(event: FocusEvent) {
      focusInsideDetailRef.current = event.target instanceof Node && !!detailRef.current?.contains(event.target)
      if (!focusInsideDetailRef.current) scrollAfterLoading.current = null
    }

    function clearFocusOnOutsideInteraction(event: Event) {
      // 詳細外の非フォーカス要素を押したときは focusin が発火しない。
      if (!(event.target instanceof Node && detailRef.current?.contains(event.target))) {
        focusInsideDetailRef.current = false
        scrollAfterLoading.current = null
      }
    }

    document.addEventListener('focusin', trackFocus)
    document.addEventListener('pointerdown', clearFocusOnOutsideInteraction, { capture: true })
    document.addEventListener('mousedown', clearFocusOnOutsideInteraction, { capture: true })
    document.addEventListener('click', clearFocusOnOutsideInteraction, { capture: true })
    return () => {
      document.removeEventListener('focusin', trackFocus)
      document.removeEventListener('pointerdown', clearFocusOnOutsideInteraction, { capture: true })
      document.removeEventListener('mousedown', clearFocusOnOutsideInteraction, { capture: true })
      document.removeEventListener('click', clearFocusOnOutsideInteraction, { capture: true })
    }
  }, [])

  useLayoutEffect(() => {
    const detail = detailRef.current
    if (!detail || !selectedId) return

    const stacked = !window.matchMedia(desktopQuery).matches
    const heading = detailStatus === 'ready' ? detail.querySelector('h2') : null
    const focusTarget = heading ?? detail
    if (stacked && selection?.id === selectedId && handled.current !== selection) {
      handled.current = selection
      scrollAfterLoading.current = detailStatus === 'loading' ? selection : null
      detail.scrollIntoView({ block: 'start' })
      focusTarget.focus({ preventScroll: true })
      focusInsideDetailRef.current = true
      return
    }

    const active = document.activeElement
    // 詳細内の要素が外れると、focusin を経ずにフォーカスが body へ戻る。
    const focusLost = focusInsideDetailRef.current && (active === document.body || active === null)
    if (active === detail || focusLost) {
      if (heading && stacked && scrollAfterLoading.current?.id === selectedId) detail.scrollIntoView({ block: 'start' })
      focusTarget.focus({ preventScroll: true })
    }
    if (detailStatus !== 'loading') scrollAfterLoading.current = null
  }, [selection, selectedId, detailStatus, revisionKey])

  function retainDetailFocus() {
    const detail = detailRef.current
    if (detail?.contains(document.activeElement)) detail.focus({ preventScroll: true })
  }

  function requestDetailFocus(id: string) {
    if (!window.matchMedia(desktopQuery).matches) setSelection({ id })
  }

  function returnToList() {
    focusInsideDetailRef.current = false
    scrollAfterLoading.current = null
    setSelection(null)
    const target = listRef.current?.querySelector<HTMLElement>('button[aria-current="true"]') ?? listRef.current?.querySelector('h2')
    target?.scrollIntoView({ block: 'start' })
    target?.focus({ preventScroll: true })
  }

  return { listRef, detailRef, requestDetailFocus, retainDetailFocus, returnToList }
}
