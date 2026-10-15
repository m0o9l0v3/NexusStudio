import { NetworkError } from '../api/client'

/**
 * 保存の応答が届かなかった（サーバーで保存済みの場合がある）。成功を推測せず、同じ内容の再保存が重複しないことを伝える。
 * 2026-10-15 利用者判断（検証記録 A-4 D6）。
 */
const SAVE_RESULT_UNKNOWN = '保存できたか確認できませんでした。入力は保持されています。もう一度保存すると、同じ内容なら重複せずに保存されます。'
const SAVE_FAILED = '保存できませんでした。入力は保持されています。接続を確認して再試行してください。'

/** 401・400・404・409 以外で保存できなかったときの案内。 */
export function saveFailureMessage(error: unknown): string {
  return error instanceof NetworkError ? SAVE_RESULT_UNKNOWN : SAVE_FAILED
}
