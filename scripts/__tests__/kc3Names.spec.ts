import { describe, it, expect } from 'vitest'
import { buildShipTranslator, deriveCtypeName } from '../kc3Names.mjs'

const ships = { '金剛': '金刚', '翔鶴': '翔鹤', 'Maestrale': '西北风', '宗谷': '宗谷' }
const affix = {
  suffixes: { '改二': '改二', '改': '改', '甲': '甲' },
  prefixes: { '浴衣': '浴衣' },
  byId: { '645': '宗谷-灯塔补给' },
  ctype: { '型': '型', '級': '级' },
}

describe('buildShipTranslator', () => {
  const t = buildShipTranslator(ships, affix)

  it('精确命中基础名', () => {
    expect(t(78, '金剛')).toBe('金刚')
  })

  it('后缀可叠加：改二甲 = 改二 + 甲', () => {
    expect(t(466, '翔鶴改二甲')).toBe('翔鹤改二甲')
  })

  it('长后缀优先：改二不能被改先吃掉', () => {
    expect(t(149, '金剛改二')).toBe('金刚改二')
  })

  it('前缀（季节立绘）被剥离并翻译', () => {
    expect(t(1, '浴衣金剛')).toBe('浴衣金刚')
  })

  it('byId 优先于一切 —— 同名不同形态的舰只能靠 ID 区分', () => {
    expect(t(645, '宗谷')).toBe('宗谷-灯塔补给')
  })

  it('基础名查不到时返回 null，由调用方决定是报错还是回退', () => {
    expect(t(9999, '未知艦')).toBeNull()
  })
})

describe('deriveCtypeName', () => {
  it('剥掉尾部「型」→ 查首舰译名 → 接回本地化后缀', () => {
    expect(deriveCtypeName('金剛型', ships, affix.ctype)).toBe('金刚型')
  })

  it('尾部是「級」时用「級」那一条后缀映射', () => {
    expect(deriveCtypeName('Maestrale級', ships, affix.ctype)).toBe('西北风级')
  })

  it('首舰名查不到时返回 null（如「巡潜乙型」这类非舰名命名的通用型号）', () => {
    expect(deriveCtypeName('巡潜乙型', ships, affix.ctype)).toBeNull()
  })

  it('不以型/級结尾时返回 null', () => {
    expect(deriveCtypeName('霧の艦隊', ships, affix.ctype)).toBeNull()
  })
})
