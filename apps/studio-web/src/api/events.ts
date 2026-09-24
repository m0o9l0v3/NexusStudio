import { apiJson } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

export type EventDraft = Schemas['EventDraft']
export type EventSlot = Schemas['EventSlot']
export type SlotVenue = Schemas['SlotVenue']
export type EventDetail = Schemas['EventDetail']
export type EventListItem = Schemas['EventListItem']
export type EventConflict = Schemas['EventConflict']
export type DraftValidationProblem = Schemas['DraftValidationProblem']

/** payloadの形式（15 v01 §4.2）。APIもこの値だけを受け付ける。 */
export const EVENT_SCHEMA_VERSION = 'studio.event/1'

export type TimeMode = 'fixed' | 'allDay'
export type Participation = 'atStart' | 'anytime'

export type EventListQuery = {
  q?: string
  occurrenceId?: string
  publication?: string
  sort?: 'updated' | 'schedule'
}

export function listEvents(query: EventListQuery): Promise<EventListItem[]> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value)
  }
  const search = params.toString()
  return apiJson<EventListItem[]>('GET', `/api/events${search ? `?${search}` : ''}`)
}

export function getEvent(id: string): Promise<EventDetail> {
  return apiJson<EventDetail>('GET', `/api/events/${encodeURIComponent(id)}`)
}

export function createEvent(operationId: string, draft: EventDraft): Promise<EventDetail> {
  return apiJson<EventDetail>('POST', '/api/events', { operationId, draft })
}

export function updateEvent(id: string, operationId: string, rowVersion: number, draft: EventDraft): Promise<EventDetail> {
  return apiJson<EventDetail>('PUT', `/api/events/${encodeURIComponent(id)}`, { operationId, rowVersion, draft })
}
