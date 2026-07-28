import { describe, it, expect } from 'vitest'
import { deriveRecipes } from '@/core/recipe'
import { createPools } from '@/core/developmentPool'

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
