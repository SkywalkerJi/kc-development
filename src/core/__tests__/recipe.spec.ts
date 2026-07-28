import { describe, it, expect } from 'vitest'
import { selectPoolType, deriveRecipes, evaluateRecipe, sortResults, canonicalSortResults } from '@/core/recipe'
import type { DevelopResult } from '@/core/types'

const equips: Record<number, { broken: number[] }> = {
  10: { broken: [1, 1, 1, 1] },
  20: { broken: [3, 2, 1, 1] },
  30: { broken: [1, 1, 1, 12] },
  168: { broken: [7, 4, 0, 12] },
  999: { broken: [1, 1, 1, 30] }, // 合成装备：铝 300 > 168 特判的 250
}

describe('selectPoolType', () => {
  it('铝严格最大 → 铝池', () => expect(selectPoolType([10, 10, 10, 11])).toBe(1))
  it('弹严格大于油和钢 → 弹池', () => expect(selectPoolType([10, 11, 10, 10])).toBe(2))
  it('全相等 → 油钢池', () => expect(selectPoolType([10, 10, 10, 10])).toBe(3))
  it('铝与弹并列最大时落弹池（短路顺序）', () => expect(selectPoolType([10, 20, 10, 20])).toBe(2))
  it('铝并列不算严格最大', () => expect(selectPoolType([20, 10, 10, 20])).toBe(3))

  // 上面 5 条只锁住了第一个判断（铝 vs 其余）的并列语义。
  // 第二个判断里的两个「严格大于」同样不能放宽成 >=，各来一条反例：
  it('弹与油并列时不落弹池', () => expect(selectPoolType([10, 10, 5, 5])).toBe(3))
  it('弹与钢并列时不落弹池', () => expect(selectPoolType([5, 10, 10, 5])).toBe(3))
})

describe('deriveRecipes — 基础', () => {
  it('无目标时各项为 10，再按池约束抬升', () => {
    expect(deriveRecipes(1, [], equips)).toEqual([[10, 10, 10, 11]])
    expect(deriveRecipes(2, [], equips)).toEqual([[10, 11, 10, 10]])
    expect(deriveRecipes(3, [], equips)).toEqual([[10, 10, 10, 10]])
  })

  it('铝池把铝抬到严格大于其余三项', () => {
    const [r] = deriveRecipes(1, [20], equips) // broken*10 = [30,20,10,10]
    expect(r).toEqual([30, 20, 10, 31])
  })

  it('弹池把弹抬到严格大于油钢，且 >= 铝', () => {
    const [r] = deriveRecipes(2, [30], equips) // broken*10 = [10,10,10,120]
    expect(r).toEqual([10, 120, 10, 120])
  })
})

describe('deriveRecipes — B2：池 3 的双方案条件', () => {
  it('油已是最大值之一 → 单方案', () => {
    expect(deriveRecipes(3, [20], equips)).toEqual([[30, 20, 10, 10]])
  })

  it('油钢都不占优 → 双方案（一抬油、一抬钢）', () => {
    // broken*10 = [10,10,10,120]：油<铝 且 钢<铝
    expect(deriveRecipes(3, [30], equips)).toEqual([
      [120, 10, 10, 120],
      [10, 10, 120, 120],
    ])
  })

  it('条件是 || 不是 &&：油>=弹但油<铝，钢<铝 → 仍走双方案', () => {
    const local = { 1: { broken: [10, 5, 3, 20] } } // *10 = [100,50,30,200]
    const out = deriveRecipes(3, [1], local)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual([200, 50, 30, 200])
    expect(out[1]).toEqual([100, 50, 200, 200])
  })
})

describe('deriveRecipes — B1/B7：168 特判', () => {
  it('B1：铝池生效', () => {
    expect(deriveRecipes(1, [168], equips)[0]).toEqual([240, 260, 10, 261])
  })

  it('B1：弹池同样生效（原实现缺失）', () => {
    // 弹 260 已大于油 240、钢 10、铝 250，三条抬升规则均不触发，保持 260
    expect(deriveRecipes(2, [168], equips)[0]).toEqual([240, 260, 10, 250])
  })

  it('B1：油钢池同样生效（原实现缺失）', () => {
    const out = deriveRecipes(3, [168], equips)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual([260, 260, 10, 250])
    expect(out[1]).toEqual([240, 260, 260, 250])
  })

  it('B7：特判是初值，会被更高的 broken 抬升而非覆盖', () => {
    // 999 的铝 300 > 250，参考实现取 max 保留 300
    const [r] = deriveRecipes(1, [168, 999], equips)
    expect(r[3]).toBe(300)
    expect(r[0]).toBe(240)
    expect(r[1]).toBe(260)
  })
})

describe('evaluateRecipe', () => {
  it('划分目标/陪跑/失败三部分', () => {
    const rates = new Map([[10, 20], [20, 30], [30, 5]])
    // 配方 [30,20,10,10]：10 可负担、20 可负担、30 需铝 120 → 不可负担
    const r = evaluateRecipe('P', 1, [30, 20, 10, 10], rates, [10], equips)
    expect(r.出货率).toBe(20)
    expect(r.失败率).toBe(100 - 20 - 30)
    expect(r.总资源).toBe(70)
    expect(r.池名).toBe('P')
    expect(r.池ID).toBe(1)
  })
})

describe('sortResults', () => {
  const mk = (n: string, rate: number, total: number, fail: number): DevelopResult =>
    ({ 池名: n, 池ID: 1, 公式: [total, 0, 0, 0], 总资源: total, 出货率: rate, 失败率: fail })

  it('出货率降序优先', () => {
    expect(sortResults([mk('a', 5, 100, 10), mk('b', 9, 200, 10)]).map((r) => r.池名))
      .toEqual(['b', 'a'])
  })

  it('出货率相同时总资源升序，差 <= 1 视为相等', () => {
    const out = sortResults([mk('a', 5, 200, 10), mk('b', 5, 100, 10)])
    expect(out.map((r) => r.池名)).toEqual(['b', 'a'])
  })

  it('总资源差 <= 1 时按失败率降序', () => {
    const out = sortResults([mk('a', 5, 100, 10), mk('b', 5, 101, 20)])
    expect(out.map((r) => r.池名)).toEqual(['b', 'a'])
  })

  it('canonicalSortResults 对比较器判为相等的项给出确定顺序', () => {
    const a = mk('a', 5, 100, 10)
    const b = mk('b', 5, 101, 10)
    expect(canonicalSortResults([a, b]).map((r) => r.池名)).toEqual(['a', 'b'])
    expect(canonicalSortResults([b, a]).map((r) => r.池名)).toEqual(['a', 'b'])
  })

  it('总资源差为 2 时不再视为相等，按总资源升序', () => {
    // 锁住阈值本身：把 `> 1` 放宽成 `> 2` 时这条必须变红。
    // 关键在于让两条 tiebreak 规则给出【相反】结论 ——
    //   a 总资源更小（升序 → a 在前）、b 失败率更大（降序 → b 在前）。
    // 若两条规则恰好同向，无论走哪条分支结果都一样，测试就抓不到阈值变化。
    const out = sortResults([mk('b', 5, 102, 20), mk('a', 5, 100, 10)])
    expect(out.map((r) => r.池名)).toEqual(['a', 'b'])
  })

  it('canonicalSortResults 对仅池ID不同的结果也给出确定顺序', () => {
    // 池ID 若不进 tiebreak 链，这两条的顺序就跟随输入 —— 对拍会随机失败
    const a: DevelopResult = { ...mk('p', 5, 100, 10), 池ID: 3 }
    const b: DevelopResult = { ...mk('p', 5, 100, 10), 池ID: 1 }
    expect(canonicalSortResults([a, b]).map((r) => r.池ID)).toEqual([1, 3])
    expect(canonicalSortResults([b, a]).map((r) => r.池ID)).toEqual([1, 3])
  })

  it('canonicalSortResults 与 sortResults 可能给出相反顺序（刻意如此）', () => {
    const a = mk('a', 5, 100, 10)
    const b = mk('b', 5, 101, 20)
    // sortResults：总资源差 1 视为相等 → 按失败率降序 → b 在前
    expect(sortResults([a, b]).map((r) => r.池名)).toEqual(['b', 'a'])
    // canonicalSortResults：精确比较总资源 → a 在前
    expect(canonicalSortResults([a, b]).map((r) => r.池名)).toEqual(['a', 'b'])
  })
})

describe('equipList 缺项时的防御分支', () => {
  it('deriveRecipes 跳过不在 equipList 的目标装备，不抛错', () => {
    expect(deriveRecipes(1, [999999], equips)).toEqual([[10, 10, 10, 11]])
  })

  it('evaluateRecipe 跳过不在 equipList 的陪跑装备，不计入陪跑率', () => {
    const rates = new Map([[10, 20], [888888, 30]])
    const r = evaluateRecipe('P', 1, [30, 20, 10, 10], rates, [10], equips)
    expect(r.出货率).toBe(20)
    expect(r.失败率).toBe(80) // 888888 查不到，不计入陪跑 → 100-20-0
  })
})
