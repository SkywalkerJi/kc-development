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
})
