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

export type TargetKind = 'event' | 'occurrence' | 'categories' | 'spot'
export type PublishAction = 'publish' | 'withdraw'

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
