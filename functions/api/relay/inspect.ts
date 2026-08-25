import type { RelayInspectFailure, RelayInspectSuccess } from '../../../src/features/novice/relay.types'
import {
  inspectRelay,
  readInspectBody,
  RelayInspectionError,
} from '../../_lib/relay-inspect'

const JSON_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Content-Type': 'application/json; charset=utf-8',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}
const MAX_OUTPUT_BYTES = 256 * 1024

async function handlePost(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')
  const ownOrigin = new URL(request.url).origin
  const fetchSite = request.headers.get('sec-fetch-site')
  if (origin !== ownOrigin || (fetchSite && fetchSite !== 'same-origin')) {
    return failure('INVALID_REQUEST', '只允许从本站页面发起读取', 403)
  }

  try {
    const { baseUrl } = await readInspectBody(request)
    const data = await inspectRelay(
      baseUrl,
      fetch,
      new URL(request.url).hostname,
      request.signal,
    )
    const body: RelayInspectSuccess = { success: true, data }
    const serialized = JSON.stringify(body)
    if (new TextEncoder().encode(serialized).byteLength > MAX_OUTPUT_BYTES) {
      return failure('UPSTREAM_INVALID', '站点返回的可用配置过多，暂时无法安全展示', 422)
    }
    return new Response(serialized, { status: 200, headers: JSON_HEADERS })
  } catch (error) {
    if (error instanceof RelayInspectionError) {
      return failure(error.code, error.message, error.httpStatus)
    }
    return failure('INTERNAL_ERROR', '站点读取失败，请稍后重试', 500)
  }
}

interface PagesRequestContext {
  request: Request
}

export const onRequest = async ({ request }: PagesRequestContext): Promise<Response> => {
  if (request.method === 'POST') return handlePost(request)
  return failure('INVALID_REQUEST', '仅支持 POST 请求', 405)
}

function failure(
  code: RelayInspectFailure['code'],
  message: string,
  status: number,
): Response {
  const body: RelayInspectFailure = { success: false, code, message }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, Allow: 'POST' },
  })
}
