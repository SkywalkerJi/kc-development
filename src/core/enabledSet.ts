import type { DevelopmentPoolClass } from './developmentPool'
import type { PoolType } from './types'
import {
  findCompatiblePools, mergeDropRates, poolAdmits, allEquipIds,
  EQUIP_96_LAND_ATTACKER,
} from './poolMatching'

/**
 * 计算「在当前已选组合下，还有哪些装备可能同时出」。
 *
 * 刻意复刻参考实现的不对称：
 * - 池的**准入**判断用出货率 > 0 的集合（严格）
 * - 收集到的**启用列表**用全部 key（宽松）—— 被负池归零的装备仍应可点
 */
export function computeEnabledEquipIds(
  pools: DevelopmentPoolClass[],
  existPool: string[],
  selected: number[],
): number[] {
  // 注意：selected 为空时本函数返回的是「全部登记过的装备」（所有池都通过
  // 准入），不是空集。这段遍历要跑 existPool × 3 轮池匹配，调用方在这种
  // 情况下根本用不到结果 —— 它应该直接走「全部可用」分支，不要调用本函数。
  // 参考实现也是在调用点分支的，见 DevelopmentView 的 refreshEnabled。
  //
  // 这里刻意**不**加 `if (selected.length === 0) return []` 的提前返回：
  // 那会让返回值的含义在「无约束」与「什么都不可用」之间重载，调用方稍有
  // 不慎就会把空集当成后者。省下的开销由调用点的分支去省，语义留在这里。
  const has168 = selected.includes(EQUIP_96_LAND_ATTACKER)
  const out = new Set<number>()

  for (const name of existPool) {
    for (let t = 1 as PoolType; t <= 3; t = (t + 1) as PoolType) {
      const base = pools.find((p) => p.开发池名称 === name && p.开发池ID === t)
      if (!base) continue

      const compatible = findCompatiblePools(pools, base, t)
      const rates = mergeDropRates(compatible, has168)
      if (!poolAdmits(rates, selected)) continue

      for (const id of allEquipIds(rates)) out.add(id)
    }
  }

  return [...out]
}
