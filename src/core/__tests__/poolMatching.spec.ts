import { describe, it, expect } from 'vitest'
import { createPools } from '@/core/developmentPool'
import {
  findCompatiblePools, mergeDropRates, mergeDropRateDetails,
  poolAdmits, allEquipIds, EQUIP_96_LAND_ATTACKER,
} from '@/core/poolMatching'
import type { DevelopmentPoolData } from '@/core/types'

function pool(name: string, id: number, ships: number[], rates: Record<string, number>, min?: number[]) {
  const d: DevelopmentPoolData = { 开发池名称: name, 开发池ID: id, 舰ID: ships, 出货率: rates }
  if (min) d.最低资源 = min
  return createPools([d])[0]
}

describe('findCompatiblePools', () => {
  it('候选池必须是基准池的父集（方向不能反）', () => {
    const wide = pool('宽', 1, [1, 2, 3], { '10': 8 })
    const narrow = pool('窄', 1, [1], { '163': 6 })
    const all = [wide, narrow]
    // 以窄池为基准：宽池与窄池自身都满足 ⊇
    expect(findCompatiblePools(all, narrow, 1).map((p) => p.开发池名称).sort())
      .toEqual(['宽', '窄'])
    // 以宽池为基准：只有宽池自身满足
    expect(findCompatiblePools(all, wide, 1).map((p) => p.开发池名称)).toEqual(['宽'])
  })

  it('用 Math.abs 匹配，负 ID 池会被纳入', () => {
    const base = pool('基', 1, [1], { '10': 8 })
    const neg = pool('负', -1, [1], { '168': 8 })
    expect(findCompatiblePools([base, neg], base, 1).map((p) => p.开发池ID).sort())
      .toEqual([-1, 1])
  })

  it('不传 resources 时不过滤最低资源', () => {
    const base = pool('基', 1, [1], { '10': 8 })
    const gated = pool('门槛', 1, [1], { '20': 4 }, [300, 0, 0, 0])
    expect(findCompatiblePools([base, gated], base, 1)).toHaveLength(2)
  })

  it('传 resources 时按最低资源过滤', () => {
    const base = pool('基', 1, [1], { '10': 8 })
    const gated = pool('门槛', 1, [1], { '20': 4 }, [300, 0, 0, 0])
    expect(findCompatiblePools([base, gated], base, 1, [10, 10, 10, 10])).toHaveLength(1)
    expect(findCompatiblePools([base, gated], base, 1, [300, 10, 10, 10])).toHaveLength(2)
  })
})

describe('mergeDropRates', () => {
  it('正 ID 池累加出货率', () => {
    const a = pool('A', 1, [1], { '10': 8, '20': 4 })
    const b = pool('B', 1, [1], { '10': -2 })
    expect([...mergeDropRates([a, b], false)]).toEqual([[10, 6], [20, 4]])
  })

  it('未选中 168 时，负 ID 池只登记 key 并置 0', () => {
    const a = pool('A', 1, [1], { '10': 8 })
    const neg = pool('负', -1, [1], { '168': 8 })
    const m = mergeDropRates([a, neg], false)
    expect(m.get(168)).toBe(0)
    expect(m.get(10)).toBe(8)
  })

  it('选中 168 时，负 ID 池正常累加', () => {
    const a = pool('A', 1, [1], { '10': 8 })
    const neg = pool('负', -1, [1], { '168': 8 })
    expect(mergeDropRates([a, neg], true).get(168)).toBe(8)
  })

  it('负 ID 池不会把已有正值改写为 0', () => {
    const a = pool('A', 1, [1], { '168': 6 })
    const neg = pool('负', -1, [1], { '168': 8 })
    expect(mergeDropRates([a, neg], false).get(168)).toBe(6)
  })
})

describe('mergeDropRateDetails', () => {
  it('装备首次出现在非首位池时前置一个 0', () => {
    const a = pool('A', 1, [1], { '10': 8 })
    const b = pool('B', 1, [1], { '10': -2, '163': 6 })
    const d = mergeDropRateDetails([a, b])
    expect(d.get(10)).toEqual([8, -2])
    expect(d.get(163)).toEqual([0, 6])
  })
})

describe('poolAdmits / allEquipIds 的不对称', () => {
  const rates = new Map([[10, 8], [168, 0]])

  it('准入判断只认 > 0 的装备', () => {
    expect(poolAdmits(rates, [10])).toBe(true)
    expect(poolAdmits(rates, [168])).toBe(false)
    expect(poolAdmits(rates, [])).toBe(true)
  })

  it('启用列表包含被归零的装备', () => {
    expect(allEquipIds(rates).sort((a, b) => a - b)).toEqual([10, 168])
  })

  it('168 常量正确', () => {
    expect(EQUIP_96_LAND_ATTACKER).toBe(168)
  })
})
