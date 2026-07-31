import { describe, it, expect } from 'vitest'
import { ShipType, poolTypeLabel } from '@/core/types'
import { MESSAGES } from '@/i18n/messages'

describe('core/types', () => {
  it('ShipType 序数与游戏 stype 对齐', () => {
    expect(ShipType.DD).toBe(2)
    expect(ShipType.超弩級戦艦).toBe(12)
    expect(ShipType.敌AO).toBe(15)
    expect(ShipType.AO).toBe(22)
  })

  // 这条原本断言的是 poolTypeLabel(1) === '铝' —— 那时它直接产出中文。
  // 现在它返回消息 key，展示层才翻译，所以拆成两段断言：key 对不对，
  // 以及这个 key 在 zh-Hans 下渲染出来还是不是原来那个词。
  // 覆盖面比原来更宽：多守住了「key 存在于字典里」这一条。
  it('poolTypeLabel 覆盖三种池，返回消息 key', () => {
    expect(poolTypeLabel(1)).toBe('poolType.bauxite')
    expect(poolTypeLabel(2)).toBe('poolType.ammo')
    expect(poolTypeLabel(3)).toBe('poolType.fuelSteel')
  })

  it('这三个 key 在 zh-Hans 下仍渲染为原来的词', () => {
    const m = MESSAGES['zh-Hans']
    expect(m[poolTypeLabel(1)]).toBe('铝')
    expect(m[poolTypeLabel(2)]).toBe('弹')
    expect(m[poolTypeLabel(3)]).toBe('油钢')
  })

  it('poolTypeLabel 对越界抛错', () => {
    expect(() => poolTypeLabel(4 as never)).toThrow('无效的池ID')
  })
})
