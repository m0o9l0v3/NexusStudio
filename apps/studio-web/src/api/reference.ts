import { apiJson } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

export type ReferenceData = Schemas['ReferenceData']
export type OccurrenceItem = Schemas['OccurrenceItem']
export type OcDayItem = Schemas['OcDayItem']
export type CategoryItem = Schemas['CategoryItem']
export type SpotItem = Schemas['SpotItem']
export type SpotSearchResult = Schemas['SpotSearchResult']

export function getReference(): Promise<ReferenceData> {
  return apiJson<ReferenceData>('GET', '/api/reference')
}

export function searchSpots(q: string, building: string, floor: string): Promise<SpotSearchResult> {
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  if (building) params.set('building', building)
  if (floor) params.set('floor', floor)
  return apiJson<SpotSearchResult>('GET', `/api/spots?${params.toString()}`)
}

/** canonical IDの厳密一致で引く。見つからないIDは結果に含まれない（別のSpotで代替しない）。 */
export function lookupSpots(ids: string[]): Promise<SpotItem[]> {
  const params = new URLSearchParams()
  for (const id of ids) params.append('id', id)
  return apiJson<SpotItem[]>('GET', `/api/spots/lookup?${params.toString()}`)
}
