import type { DevelopmentPoolClass } from './developmentPool'
import type { DevelopResult, PoolType, Resources } from './types'
import {
  findCompatiblePools, sortCompatiblePools, mergeDropRates, mergeDropRateDetails, poolAdmits,
  EQUIP_96_LAND_ATTACKER,
} from './poolMatching'
import { selectPoolType, deriveRecipes, evaluateRecipe, sortResults } from './recipe'

interface EquipLike { broken: number[] }

/**
 * 编排层：把 View 与对拍（oracle）共用的两段「调用一串叶函数」的胶水代码
 * 收敛到这一处。之前这段编排各自在 DevelopmentView.vue 与 tests/oracle.spec.ts
 * 里手写了一份，753 组基准向量只验证了叶函数本身、验证不到编排顺序、
 * 排序、准入判断这些环节——两处调用点现在都指向本文件，对拍才真的会经过
 * 生产入口。
 *
 * 零 Vue/Pinia 依赖：入参、返回值全是普通数据结构。
 */

export interface PoolRatesResult {
  /** 每件装备在当前选中池下的出货率合计 */
  totals: Record<number, number>
  /** 每件装备逐池的出货率明细（供 UI 叠加显示，如 "6%-2%"） */
  details: Record<number, number[]>
}

/**
 * 正向：给定选中池与当前资源，算出各装备的出货率合计与逐池明细。
 * 对应 DevelopmentView.vue 原 refreshCurrentPool 的编排：
 * selectPoolType → findCompatiblePools → sortCompatiblePools → mergeDropRateDetails。
 */
export function computePoolRates(
  pools: DevelopmentPoolClass[],
  selectedPool: DevelopmentPoolClass,
  resources: Resources,
): PoolRatesResult {
  const poolType = selectPoolType(resources)
  const compatible = sortCompatiblePools(
    findCompatiblePools(pools, selectedPool, poolType, resources),
  )

  const detailsMap = mergeDropRateDetails(compatible)
  const totals: Record<number, number> = {}
  const details: Record<number, number[]> = {}
  for (const [id, list] of detailsMap) {
    totals[id] = list.reduce((s, v) => s + v, 0)
    details[id] = list
  }
  return { totals, details }
}

/**
 * 反推：给定目标装备，算出全部候选配方，已按 sortResults 的展示顺序排序。
 * 对应 DevelopmentView.vue 原 refreshResults 的编排：
 * 遍历 existPool × 池类型 → findCompatiblePools → mergeDropRates → poolAdmits 准入 →
 * deriveRecipes → evaluateRecipe → sortResults。
 */
export function computeRecipes(
  pools: DevelopmentPoolClass[],
  existPool: string[],
  targets: number[],
  equipList: Record<number, EquipLike>,
): DevelopResult[] {
  if (targets.length === 0) return []

  const has168 = targets.includes(EQUIP_96_LAND_ATTACKER)
  const out: DevelopResult[] = []
  for (const name of existPool) {
    for (let t = 1 as PoolType; t <= 3; t = (t + 1) as PoolType) {
      const base = pools.find((p) => p.开发池名称 === name && p.开发池ID === t)
      if (!base) continue

      const compatible = findCompatiblePools(pools, base, t)
      const rates = mergeDropRates(compatible, has168)
      if (!poolAdmits(rates, targets)) continue

      for (const recipe of deriveRecipes(t, targets, equipList))
        out.push(evaluateRecipe(name, t, recipe, rates, targets, equipList))
    }
  }
  return sortResults(out)
}
