import type { DevelopmentPoolClass } from './developmentPool'
import type { PoolType, Resources } from './types'

/** 九六式陸攻。参考实现对它有硬编码的专用配方，见 core/recipe.ts */
export const EQUIP_96_LAND_ATTACKER = 168

/**
 * 找出与基准池兼容的所有池。
 * 兼容 = 候选池.舰ID ⊇ 基准池.舰ID（宽池是窄池的父集，窄池继承宽池的出货率）。
 * @param resources 传入才做最低资源过滤 —— 正向路径传，反推路径不传。
 */
export function findCompatiblePools(
  pools: DevelopmentPoolClass[],
  basePool: DevelopmentPoolClass,
  poolType: PoolType,
  resources?: Resources,
): DevelopmentPoolClass[] {
  // 用池上缓存好的 舰ID集（见 developmentPool.ts 里字段处的说明），不要在这里
  // 现场 new Set —— 本函数在一次反推里会被调用近百次，每次都为全部候选池重建
  // 集合的话，一次调用要往集合里插入十几万个元素。
  const baseIds = basePool.舰ID集
  return pools.filter((p) => {
    if (Math.abs(p.开发池ID) !== poolType) return false
    const candidate = p.舰ID集
    for (const id of baseIds) if (!candidate.has(id)) return false
    if (resources && p.最低资源)
      for (let i = 0; i < 4; i++) if (resources[i] < p.最低资源[i]) return false
    return true
  })
}

/**
 * 合并兼容池的出货率。
 * 负 ID 池仅在选中 168 时参与累加；否则只登记 key 并置 0（表示「存在但当前出不了」）。
 */
export function mergeDropRates(
  compatible: DevelopmentPoolClass[],
  has168: boolean,
): Map<number, number> {
  const out = new Map<number, number>()
  for (const p of compatible) {
    if (!p.出货率) continue
    if (has168 || p.开发池ID > 0) {
      for (const [k, v] of Object.entries(p.出货率)) {
        const id = Number(k)
        out.set(id, (out.get(id) ?? 0) + v)
      }
    } else {
      for (const k of Object.keys(p.出货率)) {
        const id = Number(k)
        if (!out.has(id)) out.set(id, 0)
      }
    }
  }
  return out
}

/**
 * 逐池保留出货率明细，供 UI 展示叠加过程（如 "6%-2%"）。
 * 装备首次出现在非首位池时前置一个 0，与参考实现一致。
 */
export function mergeDropRateDetails(
  compatible: DevelopmentPoolClass[],
): Map<number, number[]> {
  const out = new Map<number, number[]>()
  compatible.forEach((p, idx) => {
    if (!p.出货率) return
    for (const [k, v] of Object.entries(p.出货率)) {
      const id = Number(k)
      if (!out.has(id)) out.set(id, idx > 0 ? [0] : [])
      out.get(id)!.push(v)
    }
  })
  return out
}

/**
 * 兼容池的排列顺序：舰ID 多的（更宽的池）在前，数量相同则出货率条目多的在前。
 * 这不是显示细节 —— 它决定 mergeDropRateDetails 产出的序列，
 * 进而决定出货率明细的显示形态（如 "6%-2%" 与 "0%+6%"）。
 * 生产路径与对拍测试必须共用这一份，否则对拍覆盖不到生产实际走的排序。
 * 返回新数组，不修改入参。
 */
export function sortCompatiblePools(
  pools: DevelopmentPoolClass[],
): DevelopmentPoolClass[] {
  return [...pools].sort((a, b) =>
    a.舰ID.length === b.舰ID.length
      ? Object.keys(b.出货率 ?? {}).length - Object.keys(a.出货率 ?? {}).length
      : b.舰ID.length - a.舰ID.length,
  )
}

/** 准入判断：只有出货率 > 0 的装备才算「这个池能出」。 */
export function poolAdmits(dropRates: Map<number, number>, targets: number[]): boolean {
  for (const t of targets) if ((dropRates.get(t) ?? 0) <= 0) return false
  return true
}

/**
 * 启用列表：包含全部登记过的装备，**不过滤 0**。
 * 与 poolAdmits 的不对称是刻意的 —— 被负池归零的装备仍应可点。
 */
export function allEquipIds(dropRates: Map<number, number>): number[] {
  return [...dropRates.keys()]
}
