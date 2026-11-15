import type { ReactNode } from 'react'
import { useState } from 'react'

/**
 * iPhone 17（縦向き）の枠の中に children を表示する。
 *
 * 枠には Apple の製品ベゼル画像（Apple Design Resources「Product Bezels」の
 * `iPhone 17 - Black - Portrait.png`、1350×2760px）を使う。ただしこの画像は Apple の利用条件により
 * リポジトリに入れない（README「iPhone のベゼル画像」）。`npm run bezel:link` でローカルにコピーしたときだけ
 * `__IPHONE_BEZEL_URL__` が設定され、無いとき（CI・Docker・ほかの開発機）は同じ寸法の簡易フレームを描く。
 * 画像は加工せず、CSS で縮小するだけにする。
 *
 * 下の数値は画像の透明部分（画面の切り抜き）を実測したもの（2026-11-16）。
 * 画面は 1206×2622px（= 402×874pt @3x）で、左右 72px・上下 69px の位置にある。
 */
const DEVICE = { width: 1350, height: 2760 }
const SCREEN = { left: 72, top: 69, width: 1206, height: 2622 }
/** 画面の角丸（実測で約188px）。ベゼル内側の黒い縁（切り抜きの手前約54pxまで不透明）の下に収まるよう少し小さくする。 */
const SCREEN_RADIUS = 180
/** Dynamic Island（画像では不透明な黒。簡易フレームでだけ描く）。 */
const ISLAND = { left: 488, top: 112, width: 374, height: 108 }
/** 本体の外形（簡易フレーム用）。 */
const BODY = { left: 28, top: 26 }
/** iPhone 17 の safe area（pt）。画面幅 402pt に対する割合で余白にする。 */
const LOGICAL_WIDTH = 402
const SAFE_AREA = { top: 62, bottom: 34 }

const pct = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`
const cqw = (pt: number) => `${((pt / LOGICAL_WIDTH) * 100).toFixed(2)}cqw`

const screenStyle = {
  left: pct(SCREEN.left, DEVICE.width),
  top: pct(SCREEN.top, DEVICE.height),
  width: pct(SCREEN.width, DEVICE.width),
  height: pct(SCREEN.height, DEVICE.height),
  borderRadius: `${pct(SCREEN_RADIUS, SCREEN.width)} / ${pct(SCREEN_RADIUS, SCREEN.height)}`,
  containerType: 'inline-size',
} as const

const bodyRadius = SCREEN_RADIUS + (SCREEN.left - BODY.left)
const bodyStyle = {
  left: pct(BODY.left, DEVICE.width),
  right: pct(BODY.left, DEVICE.width),
  top: pct(BODY.top, DEVICE.height),
  bottom: pct(BODY.top, DEVICE.height),
  borderRadius: `${pct(bodyRadius, DEVICE.width - BODY.left * 2)} / ${pct(bodyRadius, DEVICE.height - BODY.top * 2)}`,
} as const

const islandStyle = {
  left: pct(ISLAND.left - SCREEN.left, SCREEN.width),
  top: pct(ISLAND.top - SCREEN.top, SCREEN.height),
  width: pct(ISLAND.width, SCREEN.width),
  height: pct(ISLAND.height, SCREEN.height),
} as const

export const IPHONE_LOGICAL_VIEWPORT = '402×874'

export function IPhoneFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  // 画像が読めなかったとき（ビルド後に消された等）も簡易フレームに戻す。
  const [failed, setFailed] = useState(false)
  const bezel = __IPHONE_BEZEL_URL__ && !failed ? __IPHONE_BEZEL_URL__ : null

  return (
    <div
      className={`relative w-full shrink-0 ${className}`}
      style={{ aspectRatio: `${DEVICE.width} / ${DEVICE.height}` }}
      data-iphone-frame={bezel ? 'bezel' : 'outline'}
    >
      {!bezel && <div aria-hidden className="absolute bg-border" style={bodyStyle} />}
      <div className="absolute overflow-hidden bg-surface" style={screenStyle}>
        <div
          className="flex h-full flex-col gap-3 overflow-auto px-4"
          style={{ paddingTop: cqw(SAFE_AREA.top), paddingBottom: cqw(SAFE_AREA.bottom) }}
        >
          {children}
        </div>
        {!bezel && <div aria-hidden className="pointer-events-none absolute rounded-full bg-text-primary" style={islandStyle} />}
      </div>
      {bezel && (
        <img
          src={bezel}
          alt=""
          aria-hidden
          draggable={false}
          onError={() => setFailed(true)}
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
        />
      )}
    </div>
  )
}
