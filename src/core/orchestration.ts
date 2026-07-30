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
 * 排序、准入判断这些环节——现在两处调用点都指向本文件，对拍与生产共用
 * 同一对编排函数（computePoolRates / computeRecipes）。
 *
 * 准确说明覆盖边界（不要在此基础上继续放大结论）：
 *
 * Oracle 验证了正向明细与规范化后的反推结果内容；总率聚合、实际展示顺序
 * 及 View 参数接线由独立测试承担，尚未获得同等强度的参考对拍。具体：
 *
 * - 正向对拍现在同时比较 details 与 totals（totals 直接对着向量明细求和
 *   校验），逐池 舰ID 也已有独立的对拍段落。
 * - 反推对拍两侧都先经 canonicalSortResults 再比较，这是有意为之——
 *   只用来屏蔽展示顺序差异、比较内容集合是否一致，不代表展示顺序本身
 *   被验证过。生成向量的工具在产出结果后没有执行参考实现的排序，向量
 *   记录的顺序不等于参考实现真实展示的顺序，无从拿它当展示顺序的 oracle。
 * - 展示顺序（sortResults）本质上无法与参考实现逐条对齐：参考实现用的是
 *   不稳定排序，并列元素之间它给出的顺序本身未定义。详见 recipe.ts 里
 *   sortResults 的注释（含实测数据）。
 * - View 到这两个函数的调用点——View 传给它们的实参（pools()/selectedPool/
 *   resources、existPool/targets/equipList 等）是否正确，对拍看不到（对拍
 *   用的是 loadFixtures() 自建的数据，不经过 DevelopmentView.vue 的
 *   refreshCurrentPool/refreshResults 那几行代码）。实测：只改 View 调用点
 *   的传参（不改这两个函数本身），对拍 753 组仍然全绿。
 *
 * `src/views/__tests__/DevelopmentView.spec.ts` 用真实 SFC 挂载（不依赖
 * @vue/test-utils，见其文件头注释）补上了这条缺口里的一部分：committedResources
 * 是否被正确传给 groupedEquipments/computePoolRates（即本文件 resources 这个
 * 参数）现在有可复现的挂载测试锁定。但 pools()/selectedPool/existPool/
 * targets/equipList 等其余实参传递是否正确，那份测试没有覆盖，仍是同一类
 * 盲区——整条「View 调用点传参」的覆盖缺口没有被完全补上，只是 resources
 * 这一项不再是盲区。见 tests/oracle.spec.ts 顶部对应的说明。
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
