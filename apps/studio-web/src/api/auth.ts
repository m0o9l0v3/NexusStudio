import { apiJson, apiRequest, resetCsrfToken } from './client'
import type { components } from './schema'

/** environmentLabel：検証環境などの表示名。未設定（本番想定）ならSidebarにバッジを出さない（UI-22）。 */
export type Session = components['schemas']['SessionResponse']

export function fetchSession(): Promise<Session> {
  // 未ログインでの401は「ログイン画面へ」の通常経路。セッション切れの通知は認証済み画面側で判断する。
  return apiJson<Session>('GET', '/api/auth/me', undefined, { expectUnauthorized: true })
}

export async function login(email: string, password: string): Promise<void> {
  try {
    await apiRequest('POST', '/api/auth/login', { email, password }, { expectUnauthorized: true })
  } finally {
    resetCsrfToken()
  }
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('POST', '/api/auth/logout', undefined, { expectUnauthorized: true })
  } finally {
    resetCsrfToken()
  }
}
