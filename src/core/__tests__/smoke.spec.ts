import { describe, it, expect } from 'vitest'
import { ShipType, poolTypeLabel } from '@/core/types'

describe('core/types', () => {
  it('ShipType 序数与游戏 stype 对齐', () => {
    expect(ShipType.DD).toBe(2)
    expect(ShipType.超弩級戦艦).toBe(12)
    expect(ShipType.敌AO).toBe(15)
    expect(ShipType.AO).toBe(22)
  })

  it('poolTypeLabel 覆盖三种池', () => {
    expect(poolTypeLabel(1)).toBe('铝')
    expect(poolTypeLabel(2)).toBe('弹')
    expect(poolTypeLabel(3)).toBe('油钢')
  })

  it('poolTypeLabel 对越界抛错', () => {
    expect(() => poolTypeLabel(4 as never)).toThrow('无效的池ID')
  })
})
