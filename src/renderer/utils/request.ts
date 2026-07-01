import platform from '@/platform'
import { ApiError, BaseError, NetworkError } from '../../shared/models/errors'
import { isLocalHost } from '../../shared/utils/network_utils'
import { handleMobileRequest } from './mobile-request'

interface RequestOptions {
  method: string
  headers?: RequestInit['headers']
  body?: RequestInit['body']
  signal?: AbortSignal
  retry?: number
  useProxy?: boolean
}

async function retryRequest<T>(fn: () => Promise<T>, retry: number, url: string): Promise<T> {
  let requestError: BaseError | null = null

  for (let i = 0; i <= retry; i++) {
    const attemptStart = Date.now()
    try {
      const result = await fn()
      console.debug(`[request] Success: ${url.split('?')[0]} in ${Date.now() - attemptStart}ms (attempt ${i + 1}/${retry + 1})`)
      return result
    } catch (e) {
      const durationMs = Date.now() - attemptStart
      // 对 ApiError（通常代表 4xx/业务错误）不重试
      if (e instanceof ApiError) {
        console.debug(`[request] ApiError (no retry): ${e.message.slice(0, 200)} in ${durationMs}ms`, { url: url.split('?')[0] })
        throw e
      }
      let origin = 'unknown'
      try {
        origin = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').origin
      } catch {}
      const err = e as Error
      console.debug(`[request] Network error on attempt ${i + 1}/${retry + 1}: ${err.name}: ${err.message} in ${durationMs}ms`, { url: url.split('?')[0] })
      requestError = e instanceof BaseError ? e : new NetworkError(err.message, origin)

      if (i < retry) {
        console.debug(`[request] Waiting 500ms before retry ${i + 2}/${retry + 1}…`)
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }

  throw requestError || new Error('Unknown error')
}

function buildHeaders(options: RequestOptions, url: string): Headers {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')

  if (options.useProxy && !isLocalHost(url) && platform.type !== 'mobile') {
    headers.set('CHATBOX-TARGET-URI', url)
    headers.set('CHATBOX-PLATFORM', platform.type)
  }

  return headers
}

async function doRequest(url: string, options: RequestOptions): Promise<Response> {
  const { signal, retry = 3, useProxy = false, body, method } = options
  let requestUrl = url
  const headers = buildHeaders(options, url)

  if (useProxy && !isLocalHost(url) && platform.type !== 'mobile') {
    const version = await platform.getVersion()
    headers.set('CHATBOX-VERSION', version || 'unknown')
    requestUrl = 'https://cors-proxy.chatboxai.app/proxy-api/completions'
  }

  const safeUrl = url.split('?')[0]
  console.debug(`[request] ${method} ${safeUrl}${useProxy && !isLocalHost(url) && platform.type !== 'mobile' ? ' (via proxy)' : ''}`)

  const makeRequest = async () => {
    if (platform.type === 'mobile' && useProxy) {
      return handleMobileRequest(requestUrl, method, headers, body, signal)
    }

    const res = await fetch(requestUrl, { method, headers, body, signal })
    if (!res.ok) {
      const err = await res.text().catch(() => null)
      console.debug(`[request] Response error: ${res.status} ${method} ${safeUrl}`, {
        cfRay: res.headers.get('cf-ray'),
        xRequestId: res.headers.get('x-request-id'),
        contentType: res.headers.get('content-type'),
        retryAfter: res.headers.get('retry-after'),
        bodyPreview: (err ?? '').slice(0, 500),
      })
      throw new ApiError(`Status Code ${res.status}`, err ?? undefined)
    }
    return res
  }

  return retryRequest(makeRequest, retry, requestUrl)
}

export const apiRequest = {
  async post(
    url: string,
    headers: Record<string, string>,
    body: RequestInit['body'],
    options?: Partial<RequestOptions>
  ) {
    return doRequest(url, { ...options, method: 'POST', headers, body })
  },

  async get(url: string, headers: Record<string, string>, options?: Partial<RequestOptions>) {
    return doRequest(url, { ...options, method: 'GET', headers })
  },
}

export async function fetchWithProxy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return doRequest(input.toString(), {
    method: init?.method || 'GET',
    headers: init?.headers,
    body: init?.body,
    signal: init?.signal || undefined,
    useProxy: true,
  })
}
