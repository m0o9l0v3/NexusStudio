/**
 * Studio APIへの共通リクエスト。
 * - Cookie認証（同一オリジン）。状態を変更するリクエストにはCSRFトークンを付ける。
 * - 通信できなかった場合と、サーバーが応答した失敗を区別する（UI-13・UI-14）。
 * - 401を受けたらセッション切れとして通知する。成功扱いにはしない（15 Step 1-b）。
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  /** 応答本文（JSON）。409の最新内容や400の項目別エラーを読むために使う。 */
  readonly body: unknown

  constructor(status: number, code: string | undefined, title: string | undefined, body?: unknown) {
    super(title ?? `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

/** サーバーへ到達できなかった（オフライン・サーバー停止・プロキシ失敗）。 */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('サーバーに接続できません。', { cause })
    this.name = 'NetworkError'
  }
}

type UnauthorizedListener = () => void
const unauthorizedListeners = new Set<UnauthorizedListener>()

/** 認証が必要なAPIが401を返したときに呼ばれる。ログイン自体の失敗では呼ばれない。 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

let csrfToken: Promise<string> | null = null

/** ログイン・ログアウトで認証状態が変わるとトークンも無効になるため、次回は取り直す。 */
export function resetCsrfToken(): void {
  csrfToken = null
}

async function getCsrfToken(): Promise<string> {
  csrfToken ??= send('GET', '/api/auth/csrf')
    .then((response) => response.json() as Promise<{ token: string }>)
    .then((body) => body.token)
    .catch((error: unknown) => {
      csrfToken = null
      throw error
    })
  return csrfToken
}

async function send(method: string, path: string, body?: unknown, csrf?: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (csrf) headers['X-XSRF-TOKEN'] = csrf

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch (error) {
    throw new NetworkError(error)
  }

  // Viteの開発プロキシは、APIが起動していないと502/504を返す。本番のゲートウェイも同様なので、到達不能として扱う。
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    throw new NetworkError(new Error(`HTTP ${response.status}`))
  }

  if (!response.ok) {
    const problem = await readProblem(response)
    throw new ApiError(response.status, problem.code, problem.title, problem)
  }

  return response
}

async function readProblem(response: Response): Promise<{ code?: string; title?: string }> {
  try {
    return (await response.json()) as { code?: string; title?: string }
  } catch {
    return {}
  }
}

type RequestOptions = {
  /** 401をセッション切れとして通知しない（ログインAPIなど、401が通常の結果であるもの）。 */
  expectUnauthorized?: boolean
}

export async function apiRequest(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<Response> {
  const unsafe = method !== 'GET' && method !== 'HEAD'
  try {
    if (!unsafe) return await send(method, path)
    try {
      return await send(method, path, body, await getCsrfToken())
    } catch (error) {
      // トークンの期限切れ・認証状態の変化で拒否された場合だけ、取り直して1回だけ再送する。
      // サーバーは処理前に拒否しているため、再送しても二重に反映されない。
      if (error instanceof ApiError && error.code === 'csrf_invalid') {
        resetCsrfToken()
        return await send(method, path, body, await getCsrfToken())
      }
      throw error
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && !options.expectUnauthorized) {
      unauthorizedListeners.forEach((listener) => listener())
    }
    throw error
  }
}

export async function apiJson<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  const response = await apiRequest(method, path, body, options)
  return (await response.json()) as T
}
