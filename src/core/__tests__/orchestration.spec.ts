import { describe, it, expect } from 'vitest'
import { createPools } from '@/core/developmentPool'
import { computePoolRates, computeRecipes } from '@/core/orchestration'
import type { DevelopmentPoolData, Resources } from '@/core/types'

function pool(name: string, id: number, ships: number[], rates: Record<string, number>) {
  const d: DevelopmentPoolData = { 开发池名称: name, 开发池ID: id, 舰ID: ships, 出货率: rates }
  return createPools([d])[0]
}

describe('computePoolRates', () => {
  it('单池：totals 与 details 一致，且是同一份数据的两种投影', () => {
    const base = pool('基', 3, [1], {})
    const p = pool('基', 3, [1], { '10': 8, '20': 4 })
    const res = [10, 10, 10, 10] as unknown as Resources // 全相等 -> 油钢池(3)
    const { totals, details } = computePoolRates([p], base, res)
    expect(totals[10]).toBe(8)
    expect(totals[20]).toBe(4)
    expect(details[10]).toEqual([8])
    expect(details[20]).toEqual([4])
  })

  it('会对兼容池排序后再合并明细 —— 顺序改变明细数组内容，不只是改变遍历顺序', () => {
    // 两池舰ID数量相同，按出货率条目数降序：Many(3项) 应排在 Few(1项) 之前。
    // pools 数组本身按 Few, Many 的顺序传入（模拟"未排序"的原始查找结果），
    // 若 computePoolRates 内部不做 sortCompatiblePools，会按输入顺序合并，
    // 产出 details[10] = [3, 8]；正确实现应先排序，产出 [8, 3]。
    const base = pool('基', 3, [1], {})
    const few = pool('少', 3, [1, 2], { '10': 3 })
    const many = pool('多', 3, [1, 2], { '10': 8, '20': 4, '30': 2 })
    const res = [10, 10, 10, 10] as unknown as Resources
    const { totals, details } = computePoolRates([few, many], base, res)
    expect(details[10]).toEqual([8, 3])
    expect(totals[10]).toBe(11)
  })

  it('会用资源驱动的池类型（selectPoolType）过滤不同类型的池', () => {
    const base = pool('基', 1, [1], {})
    const aluminum = pool('铝', 1, [1], { '10': 8 })
    const oilSteel = pool('油钢', 3, [1], { '20': 4 })
    const res = [10, 10, 10, 11] as unknown as Resources // 铝严格最大 -> 铝池(1)
    const { totals } = computePoolRates([aluminum, oilSteel], base, res)
    expect(totals[10]).toBe(8)
    expect(totals[20]).toBeUndefined()
  })

  it('会按最低资源过滤（findCompatiblePools 的 resources 参数确实被传入）', () => {
    const base = pool('基', 3, [1], {})
    const gated = pool('门槛', 3, [1], { '10': 8 })
    gated.最低资源 = [300, 0, 0, 0]
    const low = [10, 10, 10, 10] as unknown as Resources
    const high = [300, 10, 10, 10] as unknown as Resources
    expect(computePoolRates([gated], base, low).totals[10]).toBeUndefined()
    expect(computePoolRates([gated], base, high).totals[10]).toBe(8)
  })
})

const equips: Record<number, { broken: number[] }> = {
  500: { broken: [0, 0, 0, 0] },
  700: { broken: [0, 0, 0, 0] },
}

describe('computeRecipes', () => {
  it('无目标时直接返回空数组，不遍历池', () => {
    expect(computeRecipes([pool('P', 3, [1], { '500': 5 })], ['P'], [], equips)).toEqual([])
  })

  it('准入判断：目标出货率为 0（或未登记）的池类型组合会被剔除', () => {
    // 同名池在类型 3 下目标出货率为 5（准入），类型 1 下登记了目标但出货率为 0（不准入）。
    // 若编排跳过 poolAdmits，类型 1 也会被 deriveRecipes/evaluateRecipe 处理成一条
    // 出货率 0% 的多余结果 —— 用长度断言把这一步锁住。
    const p3 = pool('P', 3, [1], { '500': 5 })
    const p1 = pool('P', 1, [1], { '500': 0 })
    const out = computeRecipes([p3, p1], ['P'], [500], equips)
    expect(out).toHaveLength(1)
    expect(out[0].池ID).toBe(3)
  })

  it('最终顺序遵循 sortResults（展示顺序），而非 canonicalSortResults（对拍全序）——\n' +
     '两者在本用例上给出相反顺序，用于锁住"编排末尾必须调用 sortResults"这一步', () => {
    // 构造两条结果：出货率相同(5)，总资源相差 1（40 与 41，sortResults 视为相等），
    // 失败率不同（45 与 95）。
    // sortResults 在总资源差 <=1 时按失败率降序：期望 [PB(95), PA(45)]。
    // canonicalSortResults 精确比较总资源升序：期望 [PA(40), PB(41)]，与上面相反。
    const pa = pool('PA', 3, [1], { '500': 5, '700': 50 }) // 附带装备700，压低失败率到45
    const pb = pool('PB', 1, [1], { '500': 5 })            // 无附带装备，失败率95
    const out = computeRecipes([pa, pb], ['PA', 'PB'], [500], equips)

    expect(out.map((r) => ({ pool: r.池名, total: r.总资源, fail: r.失败率 }))).toEqual([
      { pool: 'PB', total: 41, fail: 95 },
      { pool: 'PA', total: 40, fail: 45 },
    ])
  })
})
