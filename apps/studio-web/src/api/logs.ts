import { apiJson } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

export type LogItem = Schemas['LogItem']
export type LogPage = Schemas['LogPage']

export type LogQuery = { action?: string; status?: string; actorId?: string; targetKind?: string; date?: string; offset?: number | null }

/** 操作ログ（新しい順）。 */
export function listLogs(query: LogQuery): Promise<LogPage> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const search = params.toString()
  return apiJson<LogPage>('GET', `/api/logs${search ? `?${search}` : ''}`)
}

export function getLog(id: string): Promise<LogItem> {
  return apiJson<LogItem>('GET', `/api/logs/${encodeURIComponent(id)}`)
}
