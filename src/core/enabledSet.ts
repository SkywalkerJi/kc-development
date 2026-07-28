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
