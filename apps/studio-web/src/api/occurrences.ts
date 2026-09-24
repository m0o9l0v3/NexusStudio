import { apiJson } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

export type OccurrenceDraft = Schemas['OccurrenceDraft']
export type OcDayDraft = Schemas['OcDayDraft']
export type OccurrenceDetail = Schemas['OccurrenceDetail']
export type OccurrenceListItem = Schemas['OccurrenceListItem']
export type SlotReference = Schemas['SlotReference']
export type OccurrenceConflict = Schemas['ReferenceConflictOfOccurrenceDetail']

export function listOccurrences(): Promise<OccurrenceListItem[]> {
  return apiJson<OccurrenceListItem[]>('GET', '/api/occurrences')
}

export function getOccurrence(id: string): Promise<OccurrenceDetail> {
  return apiJson<OccurrenceDetail>('GET', `/api/occurrences/${encodeURIComponent(id)}`)
}

export function createOccurrence(operationId: string, draft: OccurrenceDraft): Promise<OccurrenceDetail> {
  return apiJson<OccurrenceDetail>('POST', '/api/occurrences', { operationId, draft })
}

export function updateOccurrence(id: string, operationId: string, rowVersion: number, draft: OccurrenceDraft): Promise<OccurrenceDetail> {
  return apiJson<OccurrenceDetail>('PUT', `/api/occurrences/${encodeURIComponent(id)}`, { operationId, rowVersion, draft })
}
