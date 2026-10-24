import { apiJson } from './client'
import type { SpotSearchResult } from './reference'
import type { components } from './schema'

type Schemas = components['schemas']

export type SpotDraft = Schemas['SpotDraft']
export type SpotDetail = Schemas['SpotDetail']
export type SpotConflict = Schemas['ReferenceConflictOfSpotDetail']

/** Spot の種別（nexus-mobile E2-5 O-2a の初期の候補）。値はAPIの SpotKind と一致させる。 */
export const spotKindLabels: Record<string, string> = { classroom: '教室', facility: '施設', service: 'サービス' }

/** 種別の表示。未設定・未知の値は「未設定」とする（値を推測しない）。 */
export function spotKindLabel(kind: string | null | undefined): string {
  return (kind && spotKindLabels[kind]) || '未設定'
}

/** Spots画面の一覧（取り下げ済みも含む）。 */
export function listSpotDirectory(q: string, building: string, floor: string): Promise<SpotSearchResult> {
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  if (building) params.set('building', building)
  if (floor) params.set('floor', floor)
  return apiJson<SpotSearchResult>('GET', `/api/spots/directory?${params.toString()}`)
}

/** canonical ID の厳密一致で引く（大文字小文字を区別する）。 */
export function getSpot(canonicalId: string): Promise<SpotDetail> {
  return apiJson<SpotDetail>('GET', `/api/spots/item?id=${encodeURIComponent(canonicalId)}`)
}

export function saveSpot(canonicalId: string, operationId: string, rowVersion: number, draft: SpotDraft): Promise<SpotDetail> {
  return apiJson<SpotDetail>('PUT', `/api/spots/item?id=${encodeURIComponent(canonicalId)}`, { operationId, rowVersion, draft })
}
