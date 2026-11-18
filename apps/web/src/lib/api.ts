export class ApiError extends Error {
  status: number
  code?: string
  currentVersion?: number
  errors: string[]
  correlationId?: string

  constructor(status: number, detail: string, extra?: Partial<Pick<ApiError, 'code' | 'currentVersion' | 'errors' | 'correlationId'>>) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.errors = extra?.errors ?? []
    this.code = extra?.code
    this.currentVersion = extra?.currentVersion
    this.correlationId = extra?.correlationId
  }
}

let csrfToken = ''

type Problem = {
  title?: string
  detail?: string
  code?: string
  currentVersion?: number
  errors?: string[]
  correlationId?: string
}

export function csrf() {
  return csrfToken
}

export async function bootCsrf() {
  const response = await fetch('/api/v1/auth/csrf', { credentials: 'include' })
  if (!response.ok) {
    throw new ApiError(response.status, 'Die Sitzung konnte nicht vorbereitet werden.')
  }
  const body = (await response.json()) as { token?: string }
  csrfToken = body.token ?? ''
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; allowUnauthorized?: boolean } = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers = new Headers()
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-CSRF-TOKEN', csrfToken)
  }

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const data = text ? (JSON.parse(text) as unknown) : null
  if (data && typeof data === 'object' && 'token' in data && typeof data.token === 'string' && path.includes('/auth/')) {
    csrfToken = data.token
  }

  if (response.status === 401 && options.allowUnauthorized) {
    return null as T
  }

  if (!response.ok) {
    const problem = (data ?? {}) as Problem
    const errors = Array.isArray(problem.errors) ? problem.errors : []
    throw new ApiError(response.status, problem.detail || problem.title || 'Die Aktion ist fehlgeschlagen.', {
      code: problem.code,
      currentVersion: problem.currentVersion,
      errors,
      correlationId: problem.correlationId,
    })
  }

  return data as T
}

export function errorText(error: unknown) {
  if (error instanceof ApiError) {
    return error.errors.length > 0 ? error.errors.join(' ') : error.message
  }
  if (error instanceof TypeError) {
    return 'Die Verbindung zur Anwendung ist fehlgeschlagen. Prüfe, ob die API erreichbar ist.'
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Die Daten konnten nicht geladen werden.'
}
