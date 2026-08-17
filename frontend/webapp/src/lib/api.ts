const TOKEN_KEY = 'wqms_access_token'

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export class ApiError extends Error {
  status: number
  errors: string[]

  constructor(message: string, status: number, errors: string[] = []) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  auth?: boolean
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (options.auth !== false) {
    const token = getAccessToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  const response = await fetch(`/api${path}`, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    let message = 'Request failed'
    let errors: string[] = []
    try {
      const data = (await response.json()) as {
        message?: string | string[]
        errors?: string[]
      }
      if (Array.isArray(data.message)) {
        message = data.message.join(', ')
      } else if (data.message) {
        message = data.message
      }
      if (Array.isArray(data.errors)) {
        errors = data.errors
      }
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, response.status, errors)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  const token = getAccessToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const body = new FormData()
  body.append('file', file)

  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers,
    body,
  })

  if (!response.ok) {
    let message = 'Upload failed'
    let errors: string[] = []
    try {
      const data = (await response.json()) as {
        message?: string | string[]
        errors?: string[]
      }
      if (Array.isArray(data.message)) {
        message = data.message.join(', ')
      } else if (data.message) {
        message = data.message
      }
      if (Array.isArray(data.errors)) {
        errors = data.errors
      }
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, response.status, errors)
  }

  return (await response.json()) as T
}
