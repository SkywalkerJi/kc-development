import { describe, it, expect } from 'vitest'
import { DevelopmentPoolClass, createPools } from '@/core/developmentPool'

const ctypeMap = { '1': '绫波型', '2': '伊势型' }
const shipList = {
  1: { name: '長門', stype: 9, ctype: 1 },
  2: { name: '陸奥', stype: 9, ctype: 1 },
  3: { name: '球磨', stype: 3, ctype: 2 },
  1501: { name: '駆逐イ級', stype: 2, ctype: 1 },
}
const noopGetIDs = () => []

describe('DevelopmentPoolClass.init', () => {
  it('按舰种展开 舰ID，且排除 id >= 1500', () => {
    const p = createPools([{ 开发池名称: 'X', 开发池ID: 1, 舰种: ['BB'], 出货率: {} }])[0]
    p.init(ctypeMap, noopGetIDs, shipList)
    expect(p.舰ID.sort()).toEqual([1, 2])
  })

  it('按舰型展开：数字与名称两种写法都支持', () => {
    const byId = createPools([{ 开发池名称: 'X', 开发池ID: 1, 舰型: ['2'], 出货率: {} }])[0]
    byId.init(ctypeMap, noopGetIDs, shipList)
    expect(byId.舰ID).toEqual([3])

    const byName = createPools([{ 开发池名称: 'Y', 开发池ID: 1, 舰型: ['伊势型'], 出货率: {} }])[0]
    byName.init(ctypeMap, noopGetIDs, shipList)
    expect(byName.舰ID).toEqual([3])
  })

  it('刻意不去重：舰ID 与舰种命中同一艘时保留重复项', () => {
    const p = createPools([{ 开发池名称: 'X', 开发池ID: 1, 舰ID: [1], 舰种: ['BB'], 出货率: {} }])[0]
    p.init(ctypeMap, noopGetIDs, shipList)
    expect(p.舰ID).toEqual([1, 1, 2])
    expect(p.舰ID.length).toBe(3)
  })

  it('不包含舰ID 只移除首个匹配项', () => {
    const p = createPools([
      { 开发池名称: 'X', 开发池ID: 1, 舰ID: [1], 舰种: ['BB'], 不包含舰ID: [1], 出货率: {} },
    ])[0]
    p.init(ctypeMap, noopGetIDs, shipList)
    expect(p.舰ID).toEqual([1, 2])
  })

  it('toString 只返回池名，不再拼描述（描述改由 formatPoolDescriptor 产出，见 poolDescriptor.spec.ts）', () => {
    const p = createPools([{ 开发池名称: 'X', 开发池ID: 1, 出货率: {} }])[0]
    p.init(ctypeMap, noopGetIDs, shipList)
    expect(p.toString()).toBe('X')
    expect(p.descriptor).toEqual({
      stypes: [], ctypes: [], shipNames: [], excludeShipIds: [], shipIds: [], minResources: undefined,
    })
  })

  it('descriptor.shipIds 是 舰种/舰型/舰名 展开前的原始 舰ID —— 与改造前 text 构建阶段读到的值一致（构建发生在四段展开逻辑之前）', () => {
    const p = createPools([
      { 开发池名称: 'X', 开发池ID: 1, 舰ID: [1], 舰种: ['BB'], 最低资源: [0, 0, 300, 0], 出货率: {} },
    ])[0]
    p.init(ctypeMap, noopGetIDs, shipList)
    // 展开后 舰ID 含 BB 命中的 1、2（见上面「刻意不去重」用例），但 descriptor.shipIds
    // 必须只保留展开前就有的 [1]。
    expect(p.舰ID).toEqual([1, 1, 2])
    expect(p.descriptor).toEqual({
      stypes: ['BB'], ctypes: [], shipNames: [], excludeShipIds: [], shipIds: [1], minResources: [0, 0, 300, 0],
    })
    expect(p.toString()).toBe('X')
  })

  // 以下三条覆盖上面用例的盲区：
  // 舰名路径（99 个池里 38 个用它，是主路径）此前从未被触发，
  // id >= 1500 的排除此前是空覆盖 —— 把那个判断整段删掉，原有断言照样通过。

  it('舰名结果追加在舰种之后，且同样不去重', () => {
    const p = createPools([
      { 开发池名称: 'X', 开发池ID: 1, 舰种: ['BB'], 舰名: ['長門'], 出货率: {} },
    ])[0]
    p.init(ctypeMap, () => [1, 1], shipList)
    // 舰种 BB 命中 [1,2]，舰名再追加 [1,1]
    expect(p.舰ID).toEqual([1, 2, 1, 1])
  })

  it('舰名以 exact=false 调用 getIDs', () => {
    const calls: Array<[string[], boolean]> = []
    const p = createPools([{ 开发池名称: 'X', 开发池ID: 1, 舰名: ['長門'], 出货率: {} }])[0]
    p.init(ctypeMap, (names, exact) => { calls.push([names, exact]); return [] }, shipList)
    expect(calls).toEqual([[['長門'], false]])
  })

  it('id >= 1500 的舰即使筛选条件匹配也不进入舰ID', () => {
    // 1500 的 stype 同为 9(BB)，只可能被 id < 1500 这个条件挡住
    const withBoundary = { ...shipList, 1500: { name: '边界舰', stype: 9, ctype: 1 } }
    const p = createPools([{ 开发池名称: 'X', 开发池ID: 1, 舰种: ['BB'], 出货率: {} }])[0]
    p.init(ctypeMap, noopGetIDs, withBoundary)
    expect(p.舰ID).toEqual([1, 2])
  })
})
