import { describe, it, expect } from 'vitest'
import { validate } from '../syncI18nValidate.mjs'

function validRefs(overrides: Record<string, unknown> = {}) {
  return {
    refEquipIds: [1, 2],
    playerShipIds: [10, 20],
    refCtypeIds: [5, 6],
    ctypeZhHans: { '5': '甲型', '6': '乙型' },
    ...overrides,
  }
}

function validProduced(overrides: Record<string, unknown> = {}) {
  return {
    ja: { items: {}, ships: {}, ctype: { '5': '甲', '6': '乙' } },
    'zh-Hans': {
      items: { 1: '装备1', 2: '装备2' },
      ships: { 10: '舰10', 20: '舰20' },
      ctype: {},
      derivedCtype: { '5': '甲型', '6': '乙型' },
    },
    'zh-Hant': {
      items: { 1: '裝備1', 2: '裝備2' },
      ships: { 10: '艦10', 20: '艦20' },
      ctype: { '5': '甲型', '6': '乙型' },
      derivedIds: new Set([5, 6]),
    },
    en: {
      items: { 1: 'Item1', 2: 'Item2' },
      ships: { 10: 'Ship10', 20: 'Ship20' },
      ctype: { '5': 'TypeA', '6': 'TypeB' },
      derivedIds: new Set([5, 6]),
    },
    ...overrides,
  }
}

describe('syncI18nValidate.validate', () => {
  it('四种语言的产出都齐全时返回空错误列表', () => {
    expect(validate(validProduced(), validRefs())).toEqual([])
  })

  it('校验 1：开发池引用的装备缺译名时报错，标注语言与缺失 ID', () => {
    const produced = validProduced({
      'zh-Hant': { ...validProduced()['zh-Hant'], items: { 1: '裝備1' } }, // 丢了 id 2
    })
    const errors = validate(produced, validRefs())
    expect(errors.some((e) => e.startsWith('[zh-Hant] 开发池引用的装备缺译名') && e.includes('2'))).toBe(true)
  })

  it('校验 2：玩家舰缺译名时报错，标注语言与缺失 ID', () => {
    const produced = validProduced({
      en: { ...validProduced().en, ships: { 10: 'Ship10' } }, // 丢了 id 20
    })
    const errors = validate(produced, validRefs())
    expect(errors.some((e) => e.startsWith('[en] 玩家舰缺译名') && e.includes('20'))).toBe(true)
  })

  it('校验 3（自校验）：zh-Hans 派生出的舰级名与既有 ctype.json 不一致时报错', () => {
    const produced = validProduced({
      // 6 号派生结果「丙型」与 ctype.json 里既有的「乙型」不一致
      'zh-Hans': { ...validProduced()['zh-Hans'], derivedCtype: { '5': '甲型', '6': '丙型' } },
    })
    const errors = validate(produced, validRefs())
    expect(errors.some((e) => e.startsWith('[自校验]') && e.includes('派生=丙型') && e.includes('现有=乙型'))).toBe(true)
  })

  it('校验 4：ja/zh-Hant/en 产出的 ctype 表缺开发池引用的舰级时报错', () => {
    const produced = validProduced({
      'zh-Hant': { ...validProduced()['zh-Hant'], ctype: { '5': '甲型' } }, // 丢了 6 号舰级
    })
    const errors = validate(produced, validRefs())
    expect(errors.some((e) => e.startsWith('[zh-Hant] 开发池引用的舰级缺译名') && e.includes('6'))).toBe(true)
  })

  it('校验 4（Fix 3，失败态用例）：ctype 表里有值但只是日文回填、并未真正派生出译名时报错，而不是被「有值就算过」放行', () => {
    const produced = validProduced({
      // 6 号在 ctype 表里"有值"（日文回填的 '乙'），但 derivedIds 不含 6——
      // 这正是 deriveCtypeName() 失败、sync-i18n.mjs 靠 `?? jaName` 兜底
      // 出来的那种记录。改造前的校验只看 ctype[id] 是否 truthy，这种情况
      // 会被当成"有译名"放行；这条用例钉住它现在必须报错。
      'zh-Hant': { ...validProduced()['zh-Hant'], ctype: { '5': '甲型', '6': '乙' }, derivedIds: new Set([5]) },
    })
    const errors = validate(produced, validRefs())
    expect(errors.some((e) =>
      e.startsWith('[zh-Hant] 开发池引用的舰级只查到日文回填、未真正派生出译名') && e.includes('6'),
    )).toBe(true)
    // 5 号是真派生出来的，不该被这条新校验误伤
    expect(errors.some((e) => e.includes('5'))).toBe(false)
  })

  it('校验 4（Fix 3，边界用例）：derivedIds 整体缺失时（调用方没传这个字段）不抛异常，而是保守地把全部引用的舰级都当成"未证实已派生"报错——用 ?. 短路，不是当成"没这项检查"直接放行', () => {
    const produced = validProduced({
      'zh-Hant': { ...validProduced()['zh-Hant'], derivedIds: undefined },
    })
    const errors = validate(produced, validRefs())
    const error = errors.find((e) => e.startsWith('[zh-Hant] 开发池引用的舰级只查到日文回填、未真正派生出译名'))
    expect(error).toBeDefined()
    expect(error).toContain('5')
    expect(error).toContain('6')
  })

  it('校验 4（zh-Hans 分支，回归用例）：开发池引用的舰级不在既有 ctype.json 里时必须报错 —— 此前这条检查被整条跳过，理由是「由自校验覆盖」，实则自校验只比对两边都有的键，从不检查覆盖率，是个空转的 no-op', () => {
    const errors = validate(validProduced(), validRefs({ ctypeZhHans: { '5': '甲型' } })) // ctype.json 里没有 6 号
    expect(errors.some((e) => e.startsWith('[zh-Hans] 开发池引用的舰级不在 ctype.json 里') && e.includes('6'))).toBe(true)
  })

  it('多个语言同时缺译名时，各自的错误都会被报出来，不会因为其中一个先失败就短路跳过其余', () => {
    const produced = validProduced({
      'zh-Hant': { ...validProduced()['zh-Hant'], items: { 1: '裝備1' } },
      en: { ...validProduced().en, ships: { 10: 'Ship10' } },
    })
    const errors = validate(produced, validRefs({ ctypeZhHans: { '5': '甲型' } }))
    expect(errors.some((e) => e.startsWith('[zh-Hant] 开发池引用的装备缺译名'))).toBe(true)
    expect(errors.some((e) => e.startsWith('[en] 玩家舰缺译名'))).toBe(true)
    expect(errors.some((e) => e.startsWith('[zh-Hans] 开发池引用的舰级不在 ctype.json 里'))).toBe(true)
  })
})
