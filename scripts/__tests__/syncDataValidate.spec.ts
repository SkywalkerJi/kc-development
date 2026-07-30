import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validate } from '../syncDataValidate.mjs'

const DATA_DIR = join(__dirname, '..', '..', 'public', 'data')

function validShip(overrides: Record<string, unknown> = {}) {
  return {
    api_id: 1,
    api_name: '测试舰',
    api_yomi: 'test',
    api_stype: 1,
    api_ctype: 1,
    api_soku: 5,
    // 玩家舰（id < 1500）必须带 api_aftershipid，正式数据里是数字字符串
    api_aftershipid: '0',
    api_fuel_max: 100,
    api_bull_max: 100,
    ...overrides,
  }
}

function validEquip(overrides: Record<string, unknown> = {}) {
  return {
    api_id: 1,
    api_name: '测试装备',
    api_houg: 0, api_souk: 0, api_raig: 0, api_baku: 0, api_tyku: 0, api_tais: 0,
    api_houm: 0, api_houk: 0, api_saku: 0, api_leng: 0, api_rare: 0, api_luck: 0,
    api_type: [0, 0, 0, 0, 0],
    api_broken: [1, 1, 1, 1],
    ...overrides,
  }
}

function validStart2() {
  return {
    api_mst_ship: [validShip()],
    api_mst_slotitem: [validEquip()],
    api_mst_stype: [],
    api_mst_equip_ship: [],
    api_mst_equip_exslot_ship: {},
  }
}

function validCtype() {
  return { '1': '绫波型' }
}

function validPools() {
  return [{ 开发池名称: '测试池', 开发池ID: 1, 出货率: { '1': 5 } }]
}

describe('syncDataValidate.validate', () => {
  it('三份数据都合法时返回空错误列表', () => {
    expect(validate(validPools(), validStart2(), validCtype())).toEqual([])
  })

  it('正式数据 public/data/ 下的三份文件一起通过校验（与 sync-data.mjs 实际使用的路径一致）', () => {
    const pools = JSON.parse(readFileSync(join(DATA_DIR, 'DevelopmentPool.json'), 'utf8'))
    const start2 = JSON.parse(readFileSync(join(DATA_DIR, 'start2.json'), 'utf8'))
    const ctype = JSON.parse(readFileSync(join(DATA_DIR, 'ctype.json'), 'utf8'))
    expect(validate(pools, start2, ctype)).toEqual([])
  })

  it('DevelopmentPool 为空数组时报错，且错误信息标注来自 DevelopmentPool.json', () => {
    const errors = validate([], validStart2(), validCtype())
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.startsWith('DevelopmentPool.json:'))).toBe(true)
  })

  it('start2 顶层结构不对时报错，且错误信息标注来自 start2.json', () => {
    const errors = validate(validPools(), {}, validCtype())
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.startsWith('start2.json:'))).toBe(true)
  })

  it('ctype 为空对象时报错，且错误信息标注来自 ctype.json', () => {
    const errors = validate(validPools(), validStart2(), {})
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.startsWith('ctype.json:'))).toBe(true)
  })

  it('出货率 引用的装备 ID 不存在于 start2 时报错（跨文件校验，只有把三份数据放在一起才能做）', () => {
    const errors = validate(
      [{ 开发池名称: '测试池', 开发池ID: 1, 出货率: { '999999': 5 } }],
      validStart2(),
      validCtype(),
    )
    expect(errors.some((e) => e.includes('装备 999999 不存在于 start2'))).toBe(true)
  })

  it('start2 本身结构不合法（api_mst_slotitem 不是数组）时，跳过跨文件装备 ID 校验，不产出派生噪音掩盖 start2 的问题', () => {
    const brokenStart2 = { ...validStart2(), api_mst_slotitem: 'not-an-array' }
    const errors = validate(validPools(), brokenStart2, validCtype())
    // start2 自身的结构错误必须报出来
    expect(errors.some((e) => e.startsWith('start2.json:'))).toBe(true)
    // 不应该因为拿不到可信的装备 ID 集合，就把 出货率 里的每个 ID 都当成
    // "不存在于 start2"报一遍——那是噪音，不是新信息。
    expect(errors.some((e) => e.includes('不存在于 start2'))).toBe(false)
  })

  it('三份数据同时有问题时，三类错误都会被报出来，不会因为其中一份失败就短路跳过其余两份', () => {
    const errors = validate([], {}, {})
    expect(errors.some((e) => e.startsWith('start2.json:'))).toBe(true)
    expect(errors.some((e) => e.startsWith('ctype.json:'))).toBe(true)
    expect(errors.some((e) => e.startsWith('DevelopmentPool.json:'))).toBe(true)
  })
})
