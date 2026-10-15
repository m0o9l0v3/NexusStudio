import { useSyncExternalStore } from 'react'

/**
 * 右パネルを本文の横に並べられる幅か（1280px以上）。Tailwind の `xl` と同じ境界。
 * 1280px未満（200%拡大など）では右パネルを重ねて表示する（2026-10-15 利用者判断、検証記録 A-5 D9）。
 */
const query = '(min-width: 1280px)'

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(query)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function useWideLayout(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true)
}
