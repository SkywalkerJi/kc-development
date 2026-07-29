import { describe, it, expect } from 'vitest'
import { createPools } from '@/core/developmentPool'
import {
  findCompatiblePools, sortCompatiblePools, mergeDropRates, mergeDropRateDetails,
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

describe('sortCompatiblePools', () => {
  it('舰ID 数量不同时按数量降序（宽池在前）', () => {
    const narrow = pool('窄', 1, [1], { '10': 8 })
    const wide = pool('宽', 1, [1, 2, 3], { '10': 8 })
    const mid = pool('中', 1, [1, 2], { '10': 8 })
    expect(sortCompatiblePools([narrow, wide, mid]).map((p) => p.开发池名称))
      .toEqual(['宽', '中', '窄'])
  })

  it('舰ID 数量相同时按出货率条目数降序', () => {
    const few = pool('少', 1, [1, 2], { '10': 8 })
    const many = pool('多', 1, [1, 2], { '10': 8, '20': 4, '30': 2 })
    expect(sortCompatiblePools([few, many]).map((p) => p.开发池名称))
      .toEqual(['多', '少'])
  })

  it('不修改入参数组：返回新数组，原数组顺序不变', () => {
    const a = pool('A', 1, [1], { '10': 8 })
    const b = pool('B', 1, [1, 2], { '10': 8 })
    const input = [a, b]
    const result = sortCompatiblePools(input)
    expect(input).toEqual([a, b])
    expect(result).not.toBe(input)
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

  // 两池场景无法区分「固定前置一个 0」与「按跳过的池数补 N 个 0」，
  // 也无法区分「中间缺席的池补不补零」。参考实现是
  //   if (!dict.ContainsKey(k)) { dict[k] = new ListInt(); if (num > 0) dict[k].AddInt(0); }
  //   dict[k].AddInt(v);
  // 即：只在首次登记时补一个 0（与 num 的具体值无关），中间缺席一律不补。
  it('前置的 0 恒为一个，且中间缺席的池不补零', () => {
    const a = pool('A', 1, [1], { '10': 8 })
    const b = pool('B', 1, [1], { '20': 4 })
    const c = pool('C', 1, [1], { '10': -3, '163': 6 })
    const d = mergeDropRateDetails([a, b, c])
    // 163 首次出现在第 3 个池，仍只前置一个 0 —— 不是两个
    expect(d.get(163)).toEqual([0, 6])
    // 10 在第 1、3 池出现，第 2 池缺席，中间不补零
    expect(d.get(10)).toEqual([8, -3])
    // 20 首次出现在第 2 池
    expect(d.get(20)).toEqual([0, 4])
  })
})

describe('poolAdmits / allEquipIds 的不对称', () => {
  const rates = new Map([[10, 8], [168, 0]])

  it('准入判断只认 > 0 的装备', () => {
    expect(poolAdmits(rates, [10])).toBe(true)
    expect(poolAdmits(rates, [168])).toBe(false)
    expect(poolAdmits(rates, [])).toBe(true)
  })

  // 生产环境最常触达的拒绝路径：用户已选某装备，再切到不含该装备的池。
  // 少了这条，实现里的 `?? 0` 兜底被删掉测试也照样全绿。
  it('目标装备完全不在表里时不准入', () => {
    expect(poolAdmits(rates, [999])).toBe(false)
    expect(poolAdmits(rates, [10, 999])).toBe(false)
  })

  it('启用列表包含被归零的装备', () => {
    expect(allEquipIds(rates).sort((a, b) => a - b)).toEqual([10, 168])
  })

  it('168 常量正确', () => {
    expect(EQUIP_96_LAND_ATTACKER).toBe(168)
  })
})
