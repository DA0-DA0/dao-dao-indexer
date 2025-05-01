// Ported from @shopify/jest-koa-mocks to be used with Vitest.

import { IncomingMessage, ServerResponse } from 'http'
import stream from 'stream'
import { URL } from 'url'

import Koa, { Context } from 'koa'
import httpMocks, { RequestMethod } from 'node-mocks-http'
import { vi } from 'vitest'

export type Cookies = Context['cookies']
export interface MockCookies extends Cookies {
  requestStore: Map<string, string>
  responseStore: Map<string, string>
}

export interface MockContext extends Context {
  cookies: MockCookies
  request: Context['request'] & {
    body?: any
    rawBody?: string
    session?: any
  }
}
export interface Options<
  CustomProperties extends object,
  RequestBody = undefined
> {
  url?: string
  method?: RequestMethod
  statusCode?: number
  session?: Record<string, any>
  headers?: Record<string, string>
  cookies?: Record<string, string>
  state?: Record<string, any>
  encrypted?: boolean
  host?: string
  requestBody?: RequestBody
  rawBody?: string
  throw?: Function
  redirect?: Function
  customProperties?: CustomProperties
}

export function createMockCookies(
  request: IncomingMessage,
  response: ServerResponse,
  cookies: Record<string, string> = {},
  secure = true
): MockCookies {
  const cookieEntries: [string, string][] = Object.keys(cookies).map((key) => [
    key,
    cookies[key],
  ])
  const requestStore = new Map(cookieEntries)
  const responseStore = new Map(cookieEntries)
  const mockCookies: MockCookies = {
    set: vi.fn((name, value) => {
      responseStore.set(name, value)
      return mockCookies as any
    }),
    get: vi.fn((name) => {
      return requestStore.get(name)
    }),
    requestStore,
    responseStore,
    secure,
    request,
    response,
  }
  return mockCookies
}

export function createMockContext<
  CustomProperties extends object,
  RequestBody = undefined
>(options: Options<CustomProperties, RequestBody> = {}): MockContext {
  const app = new Koa()
  const {
    cookies,
    method,
    statusCode,
    session,
    requestBody,
    rawBody = '',
    url = '',
    host = 'test.com',
    encrypted = false,
    throw: throwFn = vi.fn(),
    redirect = vi.fn(),
    headers = {},
    state = {},
    customProperties = {},
  } = options
  const extensions = {
    ...customProperties,
    throw: throwFn,
    session,
    redirect,
    state,
  }
  const protocolFallback = encrypted ? 'https' : 'http'
  const urlObject = new URL(url, `${protocolFallback}://${host}`)
  const req = httpMocks.createRequest({
    url: urlObject.toString(),
    method,
    statusCode,
    session,
    headers: {
      // Koa determines protocol based on the `Host` header.
      Host: urlObject.host,
      ...headers,
    },
  }) // Some functions we call in the implementations will perform checks for `req.encrypted`, which delegates to the socket.
  // MockRequest doesn't set a fake socket itself, so we create one here.

  req.socket = new stream.Duplex() as any
  Object.defineProperty(req.socket, 'encrypted', {
    writable: false,
    value: urlObject.protocol === 'https:',
  })
  const res = httpMocks.createResponse() // Koa sets a default status code of 404, not the node default of 200
  // https://github.com/koajs/koa/blob/master/docs/api/response.md#responsestatus

  res.statusCode = 404 // This is to get around an odd behavior in the `cookies` library, where if `res.set` is defined, it will use an internal
  // node function to set headers, which results in them being set in the wrong place.

  res.set = undefined as any
  const context = app.createContext(req, res)
  Object.assign(context, extensions)
  context.cookies = createMockCookies(req, res, cookies) // ctx.request.body is a common enough custom property for middleware to add that it's handy to just support it by default

  context.request.body = requestBody
  ;(context.request as any).rawBody = rawBody
  return context as MockContext
}
