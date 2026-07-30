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

  // dropRates 有近百项而 targets 通常只有一两件，用 Set 免掉循环里的线性查找。
  // 与 includes 语义完全相同（整数、与顺序无关）。
  const targetSet = new Set(targets)

  for (const [id, rate] of dropRates) {
    if (targetSet.has(id)) { targetRate += rate; continue }
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
 * 结果排序。刻意复刻参考实现的比较器。
 *
 * 比较器把「总资源差 <= 1」视为相等，这在理论上会破坏传递性（a~b、b~c 但
 * a<c）。不过实测下来，真实数据的 393 组结果集里**一次都没有出现**非传递
 * 三元组 —— 真正大量存在的是普通的「判为相等」：平均每组约 53 对。
 *
 * 所以「展示顺序无法与参考实现对齐」的成因不是非传递性，而是：
 * 1. 参考实现用的是**不稳定**排序，而 Array.prototype.sort 自 ES2019 起
 *    保证稳定 —— 并列元素之间参考实现给出的顺序本身就是未定义的，
 *    没有一个确定的顺序可供复刻；
 * 2. 对拍向量里根本没有记录参考实现排序后的顺序（生成向量的工具没有执行
 *    这一步），所以也无从比较。
 *
 * 结论：并列结果之间的相对顺序，本实现取「保持 computeRecipes 的产出顺序」
 * （稳定排序的自然结果），这是确定且可复现的。需要一个与展示无关的确定
 * 全序时（如测试对拍），用 canonicalSortResults。
 */
export function sortResults(results: DevelopResult[]): DevelopResult[] {
  return [...results].sort((a, b) => {
    if (a.出货率 !== b.出货率) return b.出货率 - a.出货率
    if (Math.abs(a.总资源 - b.总资源) > 1) return a.总资源 - b.总资源
    return b.失败率 - a.失败率
  })
}

/**
 * 供对拍比较用的规范全序。**仅用于测试，不要用于展示。**
 *
 * ⚠️ 它**不是** `sortResults` 的「加强版」，而是一个独立的、可能与之相反的排序：
 * `sortResults` 把「总资源差 ≤ 1」视为相等后按失败率降序，本函数则精确比较总资源。
 * 同一对结果两者可能给出**相反**顺序，这是有意的 ——
 * 展示走 `sortResults`（忠实复刻），比较走本函数（确定可重复），两者不可混用。
 *
 * 每一级都必须能分出胜负、且相等时返回 0，否则对拍会退化成「跟随输入顺序」而随机失败。
 */
export function canonicalSortResults(results: DevelopResult[]): DevelopResult[] {
  return [...results].sort((a, b) => {
    if (a.出货率 !== b.出货率) return b.出货率 - a.出货率
    if (a.总资源 !== b.总资源) return a.总资源 - b.总资源
    if (a.失败率 !== b.失败率) return b.失败率 - a.失败率
    if (a.池名 !== b.池名) return a.池名 < b.池名 ? -1 : 1
    if (a.池ID !== b.池ID) return a.池ID - b.池ID
    const fa = a.公式.join(',')
    const fb = b.公式.join(',')
    return fa === fb ? 0 : fa < fb ? -1 : 1
  })
}
