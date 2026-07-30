import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchJson, assertResponseOk } from '../fetchJson'

function stubResponse(init: { ok: boolean; status?: number; statusText?: string; json?: () => Promise<unknown> }) {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    statusText: init.statusText ?? (init.ok ? 'OK' : 'Internal Server Error'),
    json: init.json ?? (async () => ({})),
  } as Response
}

describe('assertResponseOk', () => {
  it('response.ok 为 true 时不抛错', () => {
    expect(() => assertResponseOk(stubResponse({ ok: true }), 'x.json')).not.toThrow()
  })

  it.each([404, 500, 502])('response.ok 为 false（状态码 %i）时抛错，不区分具体状态码', (status) => {
    expect(() => assertResponseOk(stubResponse({ ok: false, status }), 'x.json')).toThrow()
  })
})

describe('fetchJson', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('HTTP 200 且响应体是合法 JSON 时返回解析结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => stubResponse({ ok: true, json: async () => ({ a: 1 }) })))
    await expect(fetchJson('x.json')).resolves.toEqual({ a: 1 })
  })

  // P2-1 的核心场景：HTTP 500 但响应体恰好是结构合法的 JSON（比如网关的
  // 错误页被解析成 `{}`）——旧代码（裸 fetch + .json()，不检查 response.ok）
  // 会把这当成正常数据返回，交给下游 schema 校验；不少畸形 payload
  // （比如 `{}`）本身还可能恰好通过某些字段本来就允许为空的校验分支，
  // 最终把一次服务端错误当成"没有新数据"悄悄放过。fetchJson 必须在
  // 解析响应体之前就因为状态码拒绝，根本不会走到 .json() 这一步。
  it('HTTP 500 但响应体是结构合法的 JSON 时仍然拒绝，不会把服务端错误当成正常数据', async () => {
    const jsonSpy = vi.fn(async () => ({}))
    vi.stubGlobal('fetch', vi.fn(async () => stubResponse({ ok: false, status: 500, json: jsonSpy })))
    await expect(fetchJson('x.json')).rejects.toThrow(/HTTP 500/)
    // 状态码检查必须先于响应体解析——不能是"解析完了发现有问题才报错"。
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it('HTTP 404 时拒绝', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => stubResponse({ ok: false, status: 404, statusText: 'Not Found' })))
    await expect(fetchJson('x.json')).rejects.toThrow(/HTTP 404/)
  })

  it('错误信息包含请求的 URL，便于定位是哪个数据文件请求失败', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => stubResponse({ ok: false, status: 500 })))
    await expect(fetchJson('data/start2.json')).rejects.toThrow(/data\/start2\.json/)
  })
})
