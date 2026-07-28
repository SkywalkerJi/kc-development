import { describe, it, expect } from 'vitest'
import { classifyEquip, sortEquipIds, formatRateDetail, isAffordable } from '@/core/grouping'

describe('classifyEquip — B4 分组优先级', () => {
  it('总出货率为 0 优先归入「全部被替换」，即使它是目标装备', () => {
    expect(classifyEquip(0, true, true)).toBe('replaced')
    expect(classifyEquip(0, false, true)).toBe('replaced')
  })

  it('资源不足优先于目标身份', () => {
    expect(classifyEquip(8, false, true)).toBe('insufficient')
  })

  it('资源足够且是目标 → 目标组', () => {
    expect(classifyEquip(8, true, true)).toBe('target')
  })

  it('资源足够且非目标 → 其它组', () => {
    expect(classifyEquip(8, true, false)).toBe('other')
  })

  it('负总出货率不算被替换', () => {
    expect(classifyEquip(-2, true, false)).toBe('other')
  })
})

describe('sortEquipIds — B5', () => {
  const equips = {
    1: { types: [0, 0, 5, 20] },
    2: { types: [0, 0, 1, 30] },
    3: { types: [0, 0, 1, 10] },
    4: { types: [0, 0, 1, 10] },
  }

  it('按 types[2] → types[3] → id 排序', () => {
    expect(sortEquipIds([1, 2, 3, 4], equips)).toEqual([3, 4, 2, 1])
  })

  it('缺失的装备排到末尾且不抛错', () => {
    expect(sortEquipIds([1, 99, 3], equips)).toEqual([3, 1, 99])
  })
})

describe('formatRateDetail — B10', () => {
  it('按原序输出，首项与非正项不加 +', () => {
    expect(formatRateDetail([6, -2], '%')).toBe('6%-2%')
    expect(formatRateDetail([4, -2, -2], '%')).toBe('4%-2%-2%')
  })

  it('不跳过 0', () => {
    expect(formatRateDetail([0, 4], '%')).toBe('0%+4%')
    expect(formatRateDetail([0, -2], '%')).toBe('0%-2%')
    expect(formatRateDetail([0, 8, -2], '%')).toBe('0%+8%-2%')
  })

  it('不重排正负', () => {
    expect(formatRateDetail([-2, 6], '%')).toBe('-2%+6%')
    expect(formatRateDetail([-4, 2], '%')).toBe('-4%+2%')
  })

  it('单项与空数组', () => {
    expect(formatRateDetail([8], '%')).toBe('8%')
    expect(formatRateDetail([], '%')).toBe('')
  })
})

describe('isAffordable', () => {
  it('四项资源都要 >= broken*10', () => {
    expect(isAffordable([10, 10, 10, 120], [1, 1, 1, 12])).toBe(true)
    expect(isAffordable([10, 10, 10, 110], [1, 1, 1, 12])).toBe(false)
  })
})
