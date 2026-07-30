import { describe, it, expect } from 'vitest'
import { deriveRecipes } from '@/core/recipe'
import { createPools } from '@/core/developmentPool'
import { findCompatiblePools, mergeDropRates } from '@/core/poolMatching'
import type { PoolType } from '@/core/types'
import { loadFixtures } from './helpers/loadFixtures'

describe('B7 回归：168 专用配方是初值而非覆盖', () => {
  it('共选装备的铝需求高于 250 时应保留更高值', () => {
    const equips = { 168: { broken: [7, 4, 0, 12] }, 900: { broken: [1, 1, 1, 30] } }
    const [r] = deriveRecipes(1, [168, 900], equips)
    expect(r[3]).toBe(300)
  })

  it('共选装备的弹需求高于 260 时应保留更高值', () => {
    const equips = { 168: { broken: [7, 4, 0, 12] }, 901: { broken: [1, 30, 1, 1] } }
    const [r] = deriveRecipes(2, [168, 901], equips)
    // max(260, 300) = 300；300 已大于油 240、钢 10、铝 250，不再抬升
    expect(r[1]).toBe(300)
  })
})

describe('B8 回归：舰ID 不去重', () => {
  it('多个筛选条件命中同一艘舰时保留重复项', () => {
    const shipList = { 1: { name: 'A', stype: 9, ctype: 1 }, 2: { name: 'B', stype: 9, ctype: 1 } }
    const p = createPools([
      { 开发池名称: 'X', 开发池ID: 1, 舰ID: [1], 舰种: ['BB'], 舰型: ['1'], 出货率: {} },
    ])[0]
    p.init({ '1': 'T' }, () => [], shipList)
    // 舰ID 初始 [1] + 舰种命中 [1,2] + 舰型命中 [1,2] = 5 项
    expect(p.舰ID.length).toBe(5)
  })
})

describe('配方值不会越出 [10, 300]', () => {
  /**
   * selectResult 直接把 result.公式 写进 committedResources，绕过了资源输入的
   * [10,300] 校验 —— 依据是「反推产出的配方一定合法」。这个依据**不是**结构性
   * 保证：铝池的钳制是 `铝 <= 钢 → 铝 = 钢 + 1`，钢一旦达到 300 就会得到 301。
   *
   * 当前数据下不可能触发，原因是下面断言的这条性质：会做 `+1` 抬升的只有
   * 铝池（抬铝）与弹池（抬弹），而这两类池准入的装备里没有任何一件的
   * broken × 10 达到 300。油钢池的钳制只做 max 赋值、不 +1，不会越界。
   *
   * 把这条「当前不可触发」的推理落成断言，而不是留在注释里：数据一旦上新
   * 打破它，这里会红，提醒去补一层钳制或改 selectResult 的写入路径。
   */
  const fx = loadFixtures()

  it.each([1, 2] as PoolType[])('池类型 %i 准入的装备 broken × 10 都小于 300', (poolType) => {
    for (const has168 of [false, true]) {
      for (const name of fx.existPool) {
        const base = fx.pools.find(
          (p) => p.开发池名称 === name && p.开发池ID === poolType,
        )
        if (!base) continue
        const rates = mergeDropRates(findCompatiblePools(fx.pools, base, poolType), has168)
        for (const [id, rate] of rates) {
          if (rate <= 0) continue
          const equip = fx.equipList[id]
          if (!equip) continue
          expect(
            Math.max(...equip.broken) * 10,
            `${name} 池类型${poolType} 准入的装备 ${id}`,
          ).toBeLessThan(300)
        }
      }
    }
  })
})
