/**
 * 统一的数据请求状态码检查。
 *
 * 全项目此前没有任何一处 fetch 检查过 `response.ok`：HTTP 500 只要响应体
 * 恰好是一段结构合法的 JSON（比如网关返回的 `{}`、反向代理的错误页恰好被
 * 解析成功），就会被当成正常数据继续往下走，交给 schema 校验器时也可能
 * 恰好通过（比如错误页面就是 `{}`，遇到本来就允许空对象的字段会被放过），
 * 最终把一次服务端错误当成"没有新数据"缓存下来。
 *
 * `assertResponseOk` 只做状态码这一件事：非 2xx 一律视为失败并抛错，不解析
 * 响应体、不区分 404/500/其他具体状态码、不做重试或超时。请求体是否满足
 * 业务 schema，由调用方拿到解析后的数据后另行交给 dataSchema.js 处理——
 * 两层校验各管各的，故意不耦合在一起。
 */
export function assertResponseOk(response: Response, url: string): void {
  if (!response.ok) {
    throw new Error(`请求失败: ${url} 返回 HTTP ${response.status} ${response.statusText}`)
  }
}

/**
 * `fetch(url)` + 状态码检查 + `.json()` 解析的组合封装。
 *
 * 边界：只覆盖"这次 HTTP 请求本身有没有成功"和"响应体是不是合法 JSON"
 * 这两层，不做任何业务语义校验（那是 dataSchema.js 的职责，调用方在拿到
 * 这里返回的值之后自己接上）；也不做重试/超时/缓存——那些不在这四条要修的
 * 问题范围内，故意不在这次一起加，避免把不相关的行为变化混进同一次改动。
 */
export async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  assertResponseOk(response, url)
  return response.json()
}
