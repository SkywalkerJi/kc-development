/**
 * sync-data.mjs 的校验组合逻辑：把三份数据（DevelopmentPool.json / ctype.json /
 * start2.json）交给 src/core/dataSchema.js 里同一套校验器（运行时 store 用的
 * 也是这一套），再补上一项只有在"三份数据摆在一起"时才能做的跨文件校验——
 * DevelopmentPool 的 出货率 引用的装备 ID 必须真的存在于 start2。
 *
 * 拆成单独文件（而不是内联在 sync-data.mjs 里）是为了能脱离 `node
 * scripts/sync-data.mjs --from <dir>` 的命令行入口单独测试：sync-data.mjs
 * 顶层直接执行 argv 解析、文件读写、process.exit，不适合被当模块 import；
 * 这个文件只导出纯函数，没有任何顶层副作用。
 */
import { validateStart2Payload, validateCtypeMap, validateDevelopmentPools } from '../src/core/dataSchema.js'

/**
 * @param {unknown} pools DevelopmentPool.json 解析结果
 * @param {unknown} start2 start2.json 解析结果
 * @param {unknown} ctype ctype.json 解析结果
 * @returns {string[]} 校验错误列表，长度为 0 表示三份数据都合法
 */
export function validate(pools, start2, ctype) {
  const errors = []

  const start2Result = validateStart2Payload(start2)
  if (!start2Result.ok) {
    errors.push(...start2Result.errors.map((e) => `start2.json: ${e}`))
  }

  const ctypeResult = validateCtypeMap(ctype)
  if (!ctypeResult.ok) {
    errors.push(...ctypeResult.errors.map((e) => `ctype.json: ${e}`))
  }

  // 跨文件的装备 ID 校验：只有在 start2 的 api_mst_slotitem 至少是个数组时
  // 才能提取出装备 ID 集合。start2 结构本身已经不合法的情况下，没必要再
  // 硬凑一个装备 ID 集合去校验 pool——那只会在真正的问题（start2 本身
  // 不合法）之外，派生出一堆多半没什么信息量的"装备 X 不存在于 start2"
  // 噪音，掩盖真正需要修的地方。
  const equipIds =
    start2 && typeof start2 === 'object' && Array.isArray(/** @type {{api_mst_slotitem?: unknown}} */ (start2).api_mst_slotitem)
      ? new Set(
          /** @type {{api_mst_slotitem: {api_id: unknown}[]}} */ (start2).api_mst_slotitem
            .map((e) => e && typeof e === 'object' ? e.api_id : undefined)
            .filter((id) => typeof id === 'number'),
        )
      : null

  const poolResult = validateDevelopmentPools(pools, equipIds)
  if (!poolResult.ok) {
    errors.push(...poolResult.errors.map((e) => `DevelopmentPool.json: ${e}`))
  }

  return errors
}
