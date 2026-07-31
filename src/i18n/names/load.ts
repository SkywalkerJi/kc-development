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
 * 校验一张**真的发出过 HTTP 请求、拿到响应体**的名称表的形状：必须是普通
 * 对象（排除 `null`/数组/字符串/数字等其它合法 JSON 值），每个键是规范
 * 数值字符串，每个值是去掉首尾空白后非空的字符串，且**表本身不能是空
 * 对象**——真的发起过的请求，响应体不该是零条目：那与"这份表暂时没有
 * 任何译名"是同一种可观测结果，也是同一种故障（下面 fetchNameTable 那段
 * 的 P1 分析同样适用），却会被 `setLocale` 当成成功，locale 切换生效、
 * 但每一个名字都悄悄回退成日文——用户完全看不出"翻译功能坏了"和"这门
 * 语言真的还没翻译"的区别。
 *
 * 「真的发出过请求」是这条校验的前提，不是可选项：ja 的 items/ships、
 * zh-Hans 的 ctype 这三张表按设计就是空对象（ja 的日文名直接来自
 * start2.json，复制一份到 items/ships.json 会造成第二个真值源；zh-Hans
 * 的舰级名读 developmentStore 已加载的 ctypeMap，不读 i18n 目录下的
 * ctype.json），下面 `loadNameTables` 对这三张表走的是
 * `Promise.resolve({})`，**根本不调用 `fetchNameTable`/这个函数**——
 * 空表是"跳过请求"这个决策本身产出的常量，不是这个函数校验之后放行的
 * 结果，两者在代码路径上就是分开的，不存在"这个函数需要放行 {}
 * 才能兼容那三张表"这回事。
 *
 * 具名导出（而不是只在本文件内用）是为了让
 * `src/i18n/names/__tests__/load.spec.ts` 能直接拿它跑一遍
 * `public/data/i18n/**\/*.json` 这几份真实产出——校验规则不能只在 mock
 * 数据上验证过，见该测试文件里"正式产出数据全部通过校验"那条用例的注释。
 * 那条用例因此要跳过 ja 的 items/ships.json 与 zh-Hans 的 ctype.json——
 * 它们是磁盘上确实存在的空对象文件，符合"按设计为空"，但不符合"经过这个
 * 函数校验"的前提，这里也不是它们该被校验的地方。
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
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return false
  return entries.every(
    ([key, v]) => isCanonicalNumericKey(key) && typeof v === 'string' && v.trim() !== '',
  )
}

/** `fetchJson` + 形状校验的组合：校验失败与 fetch 失败一样，直接 throw。 */
async function fetchNameTable(url: string): Promise<Record<number, string>> {
  const json = await fetchJson(url)
  if (!isValidNameTable(json)) {
    throw new Error(`名称表格式不合法（须为「规范数值字符串 → 非空字符串」、且非空的普通对象）: ${url}`)
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
 * 跳过请求时的 `Promise.resolve({})` 是这三个组合"按设计为空"这件事本身
 * 的直接体现——常量、不经过 `fetchNameTable`/`isValidNameTable`，**不是**
 * "反正 `{}` 会通过校验所以偷懒复用同一个值"：`isValidNameTable` 现在会
 * 拒绝空对象（见其注释），两条路径因此在返回值形状上分道扬镳，调用方需要
 * 也确实能区分"真的请求过、拿到的是有内容的表"与"跳过了、给一个已知为空的
 * 占位值"——只是调用方（`equipName`/`shipName`/`ctypeName` 查表）不关心
 * 这个区别，缺键统一回退 start2 原名，才显得两条路径"看起来一样"。
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
