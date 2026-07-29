import { describe, it, expect } from 'vitest'
import {
  classifyEquip, sortEquipIds, formatRateDetail, isAffordable,
  sumGroupRate, groupEquipmentsWithVisibility,
} from '@/core/grouping'

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

  // 上一条只有一个缺失项，走不到「两个都缺失」那条回退。
  // 删掉 `if (!ea && !eb) return a - b` 后比较器会变成非反对称的
  // （compare(a,b) 与 compare(b,a) 同时返回 1），排序结果随之不确定。
  it('两个 id 都查不到时按 id 升序回退', () => {
    expect(sortEquipIds([99, 1, 98], equips)).toEqual([1, 98, 99])
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

  // 上面所有含 0 的用例里，0 都在 index 0 —— 会被 `i <= 0` 短路，
  // 走不到 `rates[i] <= 0` 这一半判断。把它改成 `< 0`（非首位的 0 会被误加 +）
  // 原有用例一条都发现不了。参考语义是 `i <= 0 || _list[i] <= 0`，
  // 即非首位的 0 同样不加 +。
  it('非首位的 0 也不加 +', () => {
    expect(formatRateDetail([4, 0, 6], '%')).toBe('4%0%+6%')
    expect(formatRateDetail([4, 0], '%')).toBe('4%0%')
  })
})

describe('isAffordable', () => {
  it('四项资源都要 >= broken*10', () => {
    expect(isAffordable([10, 10, 10, 120], [1, 1, 1, 12])).toBe(true)
    expect(isAffordable([10, 10, 10, 110], [1, 1, 1, 12])).toBe(false)
  })

  // 上面那条用对称夹具（四项都恰好等于阈值、只改末项），
  // 导致前三项的资源↔broken 对应关系可以任意置换而不被发现。
  // 用非对称 broken 逐项卡边界，锁死索引映射 ——
  // 资源顺序错位是「与参考实现数值不一致」最容易发生的地方。
  it('四项资源与 broken 一一对应，索引不可错位', () => {
    const broken = [1, 2, 3, 4] // 阈值 [10, 20, 30, 40]
    expect(isAffordable([10, 20, 30, 40], broken)).toBe(true)
    // 每一项各差 1 都应判为不足 —— 任一索引被跳过，对应这条就会变红
    expect(isAffordable([9, 20, 30, 40], broken)).toBe(false)
    expect(isAffordable([10, 19, 30, 40], broken)).toBe(false)
    expect(isAffordable([10, 20, 29, 40], broken)).toBe(false)
    expect(isAffordable([10, 20, 30, 39], broken)).toBe(false)
    // 资源顺序颠倒必须判为不足
    expect(isAffordable([40, 30, 20, 10], broken)).toBe(false)
  })
})

describe('sumGroupRate', () => {
  it('按 id 从 rateMap 取值求和', () => {
    expect(sumGroupRate([1, 2, 3], { 1: 6, 2: -2, 3: 0 })).toBe(4)
  })

  it('id 不在 rateMap 中按 0 处理，空数组求和为 0', () => {
    expect(sumGroupRate([1, 99], { 1: 6 })).toBe(6)
    expect(sumGroupRate([], {})).toBe(0)
  })
})

describe('groupEquipmentsWithVisibility — F6 分组显示条件', () => {
  const equipList = {
    19: { id: 19, broken: [1, 1, 1, 1] },
    20: { id: 20, broken: [1, 1, 1, 1] },
    21: { id: 21, broken: [1, 1, 1, 1] },
    22: { id: 22, broken: [1, 1, 1, 1] },
  }
  const resources = [10, 10, 10, 10]

  it('组内有成员但总率 ≤ 0 时不显示（复现：装备 19 出货率 -2%，目标组应隐藏）', () => {
    const rateMap = { 19: -2 }
    const result = groupEquipmentsWithVisibility(
      [19], equipList, rateMap, resources, new Set([19]),
    )
    // 旧的 `.length > 0` 判定会显示这一组（1 个成员）；
    // 参考实现按总率 > 0 判定，-2 应该隐藏整组。两者都断言，锁住这个反差。
    expect(result.target).toHaveLength(1)
    expect(result.targetTotal).toBe(-2)
    expect(result.showTarget).toBe(false)
  })

  it('组内总率 > 0 时正常显示', () => {
    const rateMap = { 20: 6 }
    const result = groupEquipmentsWithVisibility(
      [20], equipList, rateMap, resources, new Set(),
    )
    expect(result.other).toHaveLength(1)
    expect(result.otherTotal).toBe(6)
    expect(result.showOther).toBe(true)
  })

  it('资源不足组同样按总率 > 0 判定', () => {
    const brokeEquip = { 21: { id: 21, broken: [100, 1, 1, 1] } } // 资源门槛远超 resources
    const rateMap = { 21: -3 }
    const result = groupEquipmentsWithVisibility(
      [21], brokeEquip, rateMap, resources, new Set(),
    )
    expect(result.insufficient).toHaveLength(1)
    expect(result.insufficientTotal).toBe(-3)
    expect(result.showInsufficient).toBe(false)
  })

  // “全部被替换”组的每个成员 total 恒为 0（见 classifyEquip），组总率恒为 0，
  // 若和前三组一样按总率判定，这一组会永远不显示——必须仍按数量判定。
  // 这是最容易被“统一成总率”这类简化误伤的一条。
  it('全部被替换组按数量显示，即使总率恒为 0', () => {
    const rateMap = { 22: 0 }
    const result = groupEquipmentsWithVisibility(
      [22], equipList, rateMap, resources, new Set(),
    )
    expect(result.replaced).toHaveLength(1)
    expect(result.showReplaced).toBe(true)
  })

  it('无候选装备时四组均不显示', () => {
    const result = groupEquipmentsWithVisibility([], equipList, {}, resources, new Set())
    expect(result.showTarget).toBe(false)
    expect(result.showOther).toBe(false)
    expect(result.showInsufficient).toBe(false)
    expect(result.showReplaced).toBe(false)
  })
})
