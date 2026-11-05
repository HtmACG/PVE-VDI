import type { ApiError, ApiResult } from '@shared/types'

export class ClientApiError extends Error {
  readonly code: string
  readonly detail?: string
  readonly status?: number

  constructor(error: ApiError) {
    super(error.message)
    this.name = 'ClientApiError'
    this.code = error.code
    this.detail = error.detail
    this.status = error.status
  }
}

export async function unwrap<T>(promise: Promise<ApiResult<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new ClientApiError(result.error)
  return result.data
}

export function errorDetail(error: unknown): string {
  if (error instanceof ClientApiError) {
    return [error.message, error.detail].filter(Boolean).join(' · ')
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ClientApiError && (error.code === 'AUTH_REQUIRED' || error.code === 'AUTH_FAILED')
}
