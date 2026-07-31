import type { Locale, NameTables } from '../types'
import { fetchJson } from '@/stores/fetchJson'

/**
 * 名称表键的合法形状：规范数值字符串——不接受 `"01"`（前导零）、`"1.5"`、
 * `"+1"`、`"1e2"` 这类"看起来像数字但不是 `String(Number(k))` 本身"的键。
 * equipName()/shipName()/ctypeName() 一律用 `table[id]`（`id` 是 number）
 * 查表，JS 会把 `id` 转成规范数值字符串再去对象上找键——键不是这个规范形式
 * 的话，数据本身没错，但永远查不到，与键缺失是同一种故障表现，必须一并拒绝。
 */
function isCanonicalNumericKey(key: string): boolean {
  return /^(0|[1-9]\d*)$/.test(key)
}

/**
 * 校验一张名称表的形状：必须是普通对象（排除 `null`/数组/字符串/数字等
 * 其它合法 JSON 值），每个键是规范数值字符串，每个值是非空字符串。空对象
 * `{}`（零个键）视为合法——ja/zh-Hans 两处跳过请求时人为构造的空表、以及
 * 上游数据本身暂时没有任何条目的表，都要走这条路径而不是被当成畸形拒绝。
 *
 * 具名导出（而不是只在本文件内用）是为了让
 * `src/i18n/names/__tests__/load.spec.ts` 能直接拿它跑一遍
 * `public/data/i18n/**\/*.json` 这几份真实产出——校验规则不能只在 mock
 * 数据上验证过，见该测试文件里"正式产出数据全部通过校验"那条用例的注释。
 *
 * 【为什么需要这层校验（P1）】`fetchJson()` 只保证"HTTP 2xx 且响应体是
 * 合法 JSON"，不保证响应体符合这里的业务形状。一个恰好返回 HTTP 200、
 * body 是 `null` 的陈旧 CDN 缓存条目，或恰好是合法 JSON 的反向代理错误页
 * （比如 `{"error":"not found"}`），都能穿过 `fetchJson()` 被判定为
 * "成功"。没有这层校验时，这类响应会被 `loadNameTables` 原样返回、被
 * `setLocale`/`doSwitch` 当成真实名称表原子发布——`equipName()`/
 * `shipName()` 要等到下一次渲染读 `tables.value.items[id]` 时才会因为
 * `items` 是 `null`（`null[id]` 抛 `TypeError`）或形状不对而炸掉，此时
 * locale 已经切换过去了。`setLocale` 设计稿里"失败就不切换"这条原子发布
 * 保证，对着一个"HTTP 成功但形状不对"的响应形同虚设——这层校验把形状检查
 * 挪到发布之前，形状不对就在这里 `throw`，与 `fetchJson()` 的 HTTP/JSON
 * 解析失败走同一条路径：`Promise.all` 因此 reject，`loadNameTables` 的
 * 调用方 `doSwitch`（`src/i18n/index.ts`）的 `catch` 分支照旧生效——
 * locale 不变、`tables` 不变、`setLocale` 返回 `false`，与任何一次
 * fetch 失败完全同等对待。
 */
export function isValidNameTable(value: unknown): value is Record<number, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.entries(value as Record<string, unknown>).every(
    ([key, v]) => isCanonicalNumericKey(key) && typeof v === 'string' && v !== '',
  )
}

/** `fetchJson` + 形状校验的组合：校验失败与 fetch 失败一样，直接 throw。 */
async function fetchNameTable(url: string): Promise<Record<number, string>> {
  const json = await fetchJson(url)
  if (!isValidNameTable(json)) {
    throw new Error(`名称表格式不合法（须为「规范数值字符串 → 非空字符串」的普通对象）: ${url}`)
  }
  return json
}

/**
 * 拉取某种语言的名称表。**只负责取数、校验形状与组装，不碰任何状态** ——
 * 原子发布由调用方（setLocale）在三份都成功之后统一完成，与
 * start2Store.readStart2() 同一套写法。
 *
 * 请求集合按语言裁剪（见设计稿 §4.2 / §4.2.1）：
 * - ja：items/ships 的产出是空对象，没必要发这两个请求；日文名回退 start2。
 * - zh-Hans：不请求 ctype，简体舰级名读 developmentStore 已加载的 ctypeMap。
 *
 * 跳过请求时人为构造的 `Promise.resolve({})` 不经过 `fetchNameTable`，
 * 但 `{}` 本身就是 `isValidNameTable` 会接受的合法值（见其注释），两条路径
 * 的返回值形状因此始终一致，调用方不需要区分"真的请求过"还是"跳过了"。
 */
export async function loadNameTables(locale: Locale): Promise<NameTables> {
  const base = `${import.meta.env.BASE_URL}data/i18n/${locale}/`
  const wantItems = locale !== 'ja'
  const wantCtype = locale !== 'zh-Hans'

  const [items, ships, ctype] = await Promise.all([
    wantItems ? fetchNameTable(base + 'items.json') : Promise.resolve({}),
    wantItems ? fetchNameTable(base + 'ships.json') : Promise.resolve({}),
    wantCtype ? fetchNameTable(base + 'ctype.json') : Promise.resolve({}),
  ])
  return { items, ships, ctype }
}
