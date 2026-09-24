import { apiJson } from './client'
import type { SpotSearchResult } from './reference'
import type { components } from './schema'

type Schemas = components['schemas']

export type SpotDraft = Schemas['SpotDraft']
export type SpotDetail = Schemas['SpotDetail']
export type SpotConflict = Schemas['ReferenceConflictOfSpotDetail']

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
