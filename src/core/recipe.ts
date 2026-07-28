import type { DevelopResult, PoolType, Resources } from './types'
import { EQUIP_96_LAND_ATTACKER } from './poolMatching'

interface EquipLike { broken: number[] }

/** 九六式陸攻的专用配方（油/弹/铝）。硬编码在参考实现里，不在数据表中。 */
const RECIPE_96: Readonly<Record<number, number>> = { 0: 240, 1: 260, 3: 250 }

/**
 * 按资源配比决定落入哪个开发池。
 * 刻意复刻参考实现：严格大于 + 短路顺序，并列时落到后一档。
 */
export function selectPoolType(res: Resources): PoolType {
  if (res[3] > res[0] && res[3] > res[1] && res[3] > res[2]) return 1
  if (res[1] > res[0] && res[1] > res[2]) return 2
  return 3
}

/**
 * 由目标装备反推最省资源的配方。
 * 池 3 在油、钢都不占优时返回两个候选（一个抬油、一个抬钢）。
 *
 * 遍历 targets 而非 dropRates.keys ∩ targets —— 二者等价，
 * 因为准入判断已保证 targets ⊆ {k | dropRates[k] > 0} ⊆ dropRates.keys。
 */
export function deriveRecipes(
  poolType: PoolType,
  targets: number[],
  equipList: Record<number, EquipLike>,
): number[][] {
  const base = [10, 10, 10, 10]

  // 168 特判必须在 max 之前作为初值，且对三个池都生效
  if (targets.includes(EQUIP_96_LAND_ATTACKER))
    for (const [i, v] of Object.entries(RECIPE_96)) base[Number(i)] = v

  for (const id of targets) {
    const e = equipList[id]
    if (!e) continue
    for (let i = 0; i < 4; i++) base[i] = Math.max(base[i], e.broken[i] * 10)
  }

  if (poolType === 1) {
    const r = [...base]
    if (r[3] <= r[0]) r[3] = r[0] + 1
    if (r[3] <= r[1]) r[3] = r[1] + 1
    if (r[3] <= r[2]) r[3] = r[2] + 1
    return [r]
  }

  if (poolType === 2) {
    const r = [...base]
    if (r[1] <= r[0]) r[1] = r[0] + 1
    if (r[1] <= r[2]) r[1] = r[2] + 1
    if (r[1] < r[3]) r[1] = r[3]
    return [r]
  }

  // 池 3：油或钢已经占优则直接用，否则给两个候选
  const oilDominant = base[0] >= base[1] && base[0] >= base[3]
  const steelDominant = base[2] >= base[1] && base[2] >= base[3]
  if (oilDominant || steelDominant) return [[...base]]

  const byOil = [...base]
  if (byOil[0] < byOil[1]) byOil[0] = byOil[1]
  if (byOil[0] < byOil[3]) byOil[0] = byOil[3]

  const bySteel = [...base]
  if (bySteel[2] < bySteel[1]) bySteel[2] = bySteel[1]
  if (bySteel[2] < bySteel[3]) bySteel[2] = bySteel[3]

  return [byOil, bySteel]
}

/** 评估一个配方：目标出货率、陪跑率、失败率、总资源。 */
export function evaluateRecipe(
  poolName: string,
  poolId: PoolType,
  recipe: number[],
  dropRates: Map<number, number>,
  targets: number[],
  equipList: Record<number, EquipLike>,
): DevelopResult {
  let targetRate = 0
  let otherRate = 0

  for (const [id, rate] of dropRates) {
    if (targets.includes(id)) { targetRate += rate; continue }
    const e = equipList[id]
    if (!e) continue
    let affordable = true
    for (let i = 0; i < 4; i++) if (recipe[i] < e.broken[i] * 10) { affordable = false; break }
    if (affordable) otherRate += rate
  }

  return {
    池名: poolName,
    池ID: poolId,
    公式: [...recipe],
    总资源: recipe.reduce((s, v) => s + v, 0),
    出货率: targetRate,
    失败率: 100 - targetRate - otherRate,
  }
}

/**
 * 结果排序。刻意复刻参考实现的比较器 —— 注意它**违反传递性**
 * （总资源差 <= 1 视为相等，故 a~b、b~c 但 a<c 可能同时成立）。
 * 因此比较器判为相等的那些结果之间，显示顺序是未定义的。
 * 需要确定顺序的场合（如测试对拍）请用 canonicalSortResults。
 */
export function sortResults(results: DevelopResult[]): DevelopResult[] {
  return [...results].sort((a, b) => {
    if (a.出货率 !== b.出货率) return b.出货率 - a.出货率
    if (Math.abs(a.总资源 - b.总资源) > 1) return a.总资源 - b.总资源
    return b.失败率 - a.失败率
  })
}

/** 在原比较器之上追加确定性 tiebreak，仅用于测试比较，不用于展示。 */
export function canonicalSortResults(results: DevelopResult[]): DevelopResult[] {
  return [...results].sort((a, b) => {
    if (a.出货率 !== b.出货率) return b.出货率 - a.出货率
    if (a.总资源 !== b.总资源) return a.总资源 - b.总资源
    if (a.失败率 !== b.失败率) return b.失败率 - a.失败率
    if (a.池名 !== b.池名) return a.池名 < b.池名 ? -1 : 1
    return a.公式.join(',') < b.公式.join(',') ? -1 : 1
  })
}
