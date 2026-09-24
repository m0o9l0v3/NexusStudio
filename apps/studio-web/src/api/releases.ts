import { apiJson } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

export type PublishEntry = Schemas['PublishEntry']
export type PublishPreview = Schemas['PublishPreview']
export type PreviewItem = Schemas['PreviewItem']
export type PreviewReferences = Schemas['PreviewReferences']
export type ValidationRunResult = Schemas['ValidationRunResult']
export type ValidationFinding = Schemas['ValidationFinding']
export type OperationResult = Schemas['OperationResult']
export type ReleaseSummary = Schemas['ReleaseSummary']
export type PublishRejected = Schemas['PublishRejected']
export type ReleasePage = Schemas['ReleasePage']
export type ReleaseDetail = Schemas['ReleaseDetail']
export type ReleaseEntryDetail = Schemas['ReleaseEntryDetail']
export type ReleaseEntrySummary = Schemas['ReleaseEntrySummary']
export type PayloadSides = Schemas['PayloadSides']

export type TargetKind = 'event' | 'occurrence' | 'categories' | 'spot'
export type PublishAction = 'publish' | 'withdraw' | 'restore'

/** 公開候補を組み立てて検証する（左：差分、右：検証と関連影響）。 */
export function previewPublish(entries: PublishEntry[]): Promise<PublishPreview> {
  return apiJson<PublishPreview>('POST', '/api/releases/preview', { entries })
}

/** 確認した候補を公開する。同じ operationId の再送は新しい公開を作らず、最初の結果を返す。 */
export function publish(operationId: string, entries: PublishEntry[], confirmedValidationId: string): Promise<OperationResult> {
  return apiJson<OperationResult>('POST', '/api/releases', { operationId, entries, confirmedValidationId, message: null })
}

/** 結果確認中からの照会。404はその操作がサーバーに届いていない（何も反映していない）。 */
export function getOperation(operationId: string): Promise<OperationResult> {
  return apiJson<OperationResult>('GET', `/api/operations/${encodeURIComponent(operationId)}`)
}

export type ReleaseQuery = { targetKind?: string; action?: string; targetId?: string; before?: number | null }

/** 公開履歴（新しい順）。before より古い Release を返す。 */
export function listReleases(query: ReleaseQuery): Promise<ReleasePage> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const search = params.toString()
  return apiJson<ReleasePage>('GET', `/api/releases${search ? `?${search}` : ''}`)
}

export function getRelease(id: string): Promise<ReleaseDetail> {
  return apiJson<ReleaseDetail>('GET', `/api/releases/${encodeURIComponent(id)}`)
}
