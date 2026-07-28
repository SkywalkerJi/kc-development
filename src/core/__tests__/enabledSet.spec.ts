import { describe, it, expect } from 'vitest'
import { createPools } from '@/core/developmentPool'
import { computeEnabledEquipIds } from '@/core/enabledSet'
import type { DevelopmentPoolData } from '@/core/types'

function pool(name: string, id: number, ships: number[], rates: Record<string, number>) {
  const d: DevelopmentPoolData = { 开发池名称: name, 开发池ID: id, 舰ID: ships, 出货率: rates }
  return createPools([d])[0]
}

describe('computeEnabledEquipIds — B3', () => {
  const pools = [
    pool('A', 1, [1], { '10': 8, '20': 4 }),
    pool('A', 2, [1], { '30': 6 }),
    pool('A负', -1, [1], { '168': 8 }),
  ]

  it('未选中任何装备时全部可用', () => {
    expect(computeEnabledEquipIds(pools, ['A'], []).sort((a, b) => a - b))
      .toEqual([10, 20, 30, 168])
  })

  it('被负池归零的 168 仍在启用集合内（不过滤 > 0）', () => {
    const out = computeEnabledEquipIds(pools, ['A'], [10])
    expect(out).toContain(168)
    expect(out).toContain(20)
  })

  it('准入判断本身仍只认 > 0：选中 168 才能让负池参与累加', () => {
    const out = computeEnabledEquipIds(pools, ['A'], [168])
    expect(out).toContain(168)
  })

  it('不同池类型的装备不会串到同一组合里', () => {
    // 10 在池 1，30 在池 2，没有任何单池同时含两者
    expect(computeEnabledEquipIds(pools, ['A'], [10])).not.toContain(30)
  })

  // 这条锁住的是「已选装备自己也可能不在启用集合里」这个前置条件。
  // 10 与 30 分处两个互不相容的池类型，没有任何池能同时准入两者，
  // 于是启用集合为空 —— 包括这两个已经被选中的装备。
  //
  // 它是 View 里 toggleEquipment 守卫必须写成
  //   if (!state.enabled && !state.select) return
  // 而不能只写 !state.enabled 的直接依据：
  // 后者会让这两个按钮永久无法取消选择，用户卡死。
  // （实测真实数据下，先选 10 再选 55 就能进入这个状态。）
  it('联合准入失败时启用集合可以不含已选装备本身', () => {
    expect(computeEnabledEquipIds(pools, ['A'], [10, 30])).toEqual([])
  })
})
