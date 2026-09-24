import { apiJson, apiRequest } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

export type DraftDiagnosis = Schemas['DraftDiagnosisResult']
export type DiagnosisArea = Schemas['DiagnosisArea']

/** 全下書き診断を実行する。 */
export function runDiagnosis(): Promise<DraftDiagnosis> {
  return apiJson<DraftDiagnosis>('POST', '/api/validation/draft', {})
}

/** 最後の診断結果。まだ診断していなければnull（未検証）。 */
export async function getLatestDiagnosis(): Promise<DraftDiagnosis | null> {
  const response = await apiRequest('GET', '/api/validation/draft/latest')
  return response.status === 204 ? null : ((await response.json()) as DraftDiagnosis)
}
