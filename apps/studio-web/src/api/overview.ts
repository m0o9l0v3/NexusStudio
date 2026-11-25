import { apiJson } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

export type OverviewResponse = Schemas['OverviewResponse']
export type OverviewRelease = Schemas['OverviewRelease']
export type OverviewReleaseKindCount = Schemas['OverviewReleaseKindCount']
export type OverviewOccurrence = Schemas['OverviewOccurrence']
export type OverviewOccurrenceDay = Schemas['OverviewOccurrenceDay']
export type OverviewDataHealth = Schemas['OverviewDataHealth']
export type OverviewAreaCount = Schemas['OverviewAreaCount']
export type OverviewAreaStatus = Schemas['OverviewAreaStatus']

export function getOverview(): Promise<OverviewResponse> {
  return apiJson<OverviewResponse>('GET', '/api/overview')
}
