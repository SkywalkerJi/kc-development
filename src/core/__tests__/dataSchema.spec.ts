import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateStart2Payload, validateCtypeMap, validateDevelopmentPools } from '../dataSchema'

const DATA_DIR = join(__dirname, '..', '..', '..', 'public', 'data')

// 一艘/一件能通过全部校验的最小合法记录，后续用例都在它基础上删/改某一个
// 字段，保证每条断言只对应一类畸形输入，而不是又构造一个全新的坏例子。
function validShip(overrides: Record<string, unknown> = {}) {
  return {
    api_id: 1,
    api_name: '测试舰',
    api_yomi: 'test',
    api_stype: 1,
    api_ctype: 1,
    api_soku: 5,
    // 玩家舰（id < 1500）必须带 api_aftershipid —— 缺了会被静默转成 0，
    // 表现为改造链在那里断掉而不是报错。正式数据里它是数字字符串。
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

function validPayload(shipOverrides = {}, equipOverrides = {}) {
  return {
    api_mst_ship: [validShip(shipOverrides)],
    api_mst_slotitem: [validEquip(equipOverrides)],
    api_mst_stype: [],
    api_mst_equip_ship: [],
    api_mst_equip_exslot_ship: {},
  }
}

describe('validateStart2Payload', () => {
  it('合法的最小 payload 通过校验', () => {
    expect(validateStart2Payload(validPayload())).toEqual({ ok: true, errors: [] })
  })

  it('正式数据 public/data/start2.json 完整通过校验', () => {
    const json = JSON.parse(readFileSync(join(DATA_DIR, 'start2.json'), 'utf8'))
    const result = validateStart2Payload(json)
    // 正式数据必须通过——如果这里不通过，说明 schema 写严了，不能反过来改数据。
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  // 类别 1：顶层不是对象
  it.each([null, undefined, [], 'x', 1, true])('顶层不是对象（%p）时拒绝', (bad) => {
    const result = validateStart2Payload(bad)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/顶层数据不是对象/)
  })

  // 类别 1：缺少必需的顶层数组/对象字段
  it('缺少 api_mst_slotitem 字段时拒绝，且不会因此抛出运行时异常', () => {
    const bad = { api_mst_ship: [validShip()] }
    const result = validateStart2Payload(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/api_mst_slotitem/)
  })

  it('api_mst_ship 是空数组时拒绝（字段存在但为空，不能被当成"没有数据可处理"悄悄放过）', () => {
    const bad = { ...validPayload(), api_mst_ship: [] }
    const result = validateStart2Payload(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/api_mst_ship 为空数组/)
  })

  it('api_mst_slotitem 是空数组时拒绝', () => {
    const bad = { ...validPayload(), api_mst_slotitem: [] }
    const result = validateStart2Payload(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/api_mst_slotitem 为空数组/)
  })

  it('api_mst_stype / api_mst_equip_ship 允许为空数组（只是打孔装备计算的辅助数据）', () => {
    const ok = { ...validPayload(), api_mst_stype: [], api_mst_equip_ship: [] }
    expect(validateStart2Payload(ok).ok).toBe(true)
  })

  // 类别 2：舰船记录缺 ID / ID 不是正整数 / ID 重复
  it('舰船记录缺少 api_id 时拒绝（这是审查举的原始例子，但只是这一类问题里的一个）', () => {
    const bad = validPayload()
    delete (bad.api_mst_ship[0] as Record<string, unknown>).api_id
    const result = validateStart2Payload(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/api_id/)
  })

  it.each([0, -1, 1.5, '1', null, NaN])('舰船 api_id=%p（非正整数）时拒绝', (badId) => {
    const bad = { ...validPayload(), api_mst_ship: [validShip({ api_id: badId })] }
    expect(validateStart2Payload(bad).ok).toBe(false)
  })

  it('两条舰船记录 api_id 相同时拒绝', () => {
    const bad = {
      ...validPayload(),
      api_mst_ship: [validShip({ api_id: 1 }), validShip({ api_id: 1, api_name: '另一艘' })],
    }
    const result = validateStart2Payload(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/重复/)
  })

  // 类别 3：必需的字符串/数值字段缺失或类型不对
  it.each(['api_name', 'api_stype', 'api_ctype', 'api_soku'])('舰船缺少 %s 时拒绝', (field) => {
    const bad = validPayload()
    delete (bad.api_mst_ship[0] as Record<string, unknown>)[field]
    expect(validateStart2Payload(bad).ok).toBe(false)
  })

  it('舰船 api_yomi 缺失时拒绝，但允许是空字符串（正式数据里大量存在）', () => {
    const missing = validPayload()
    delete (missing.api_mst_ship[0] as Record<string, unknown>).api_yomi
    expect(validateStart2Payload(missing).ok).toBe(false)

    const empty = { ...validPayload(), api_mst_ship: [validShip({ api_yomi: '' })] }
    expect(validateStart2Payload(empty).ok).toBe(true)
  })

  it('id < 1500 的玩家舰船缺少 api_fuel_max / api_bull_max 时拒绝', () => {
    const bad1 = validPayload()
    delete (bad1.api_mst_ship[0] as Record<string, unknown>).api_fuel_max
    expect(validateStart2Payload(bad1).ok).toBe(false)

    const bad2 = validPayload()
    delete (bad2.api_mst_ship[0] as Record<string, unknown>).api_bull_max
    expect(validateStart2Payload(bad2).ok).toBe(false)
  })

  it('id >= 1500 的敌方舰船不要求 api_fuel_max / api_bull_max', () => {
    const ok = {
      ...validPayload(),
      api_mst_ship: [validShip({ api_id: 1600, api_fuel_max: undefined, api_bull_max: undefined })],
    }
    expect(validateStart2Payload(ok).ok).toBe(true)
  })

  it('深海舰（id >= 1500）缺 api_aftershipid 不算错误 —— 正式数据里它们本来就没有', () => {
    const ok = {
      ...validPayload(),
      api_mst_ship: [
        validShip(),
        validShip({ api_id: 1501, api_fuel_max: undefined, api_bull_max: undefined,
                    api_aftershipid: undefined }),
      ],
    }
    expect(validateStart2Payload(ok).ok).toBe(true)
  })

  it('玩家舰缺 api_aftershipid 时拒绝 —— 缺了会被静默转成 0，让改造链在那里断掉', () => {
    const bad = { ...validPayload(), api_mst_ship: [validShip({ api_aftershipid: undefined })] }
    expect(validateStart2Payload(bad).ok).toBe(false)
  })

  it('api_aftershipid 超出 32 位有符号整数范围时拒绝', () => {
    // 只校验「形状像数字」是不够的：400 位数字串也能通过 /^\d+$/，
    // Number() 之后是 Infinity，而参考实现在这种输入上是直接失败的。
    for (const bad of ['2147483648', '9'.repeat(400)]) {
      const payload = { ...validPayload(), api_mst_ship: [validShip({ api_aftershipid: bad })] }
      expect(validateStart2Payload(payload).ok, `api_aftershipid=${bad.slice(0, 12)}…`).toBe(false)
    }
  })

  it('api_aftershipid 是数字字符串时通过（正式数据的实际形状，比如 "254"）', () => {
    const ok = { ...validPayload(), api_mst_ship: [validShip({ api_aftershipid: '254' })] }
    expect(validateStart2Payload(ok).ok).toBe(true)
  })

  it.each([-1, 1.5, 'abc', true, {}])('api_aftershipid=%p（类型不对）时拒绝', (bad) => {
    const payload = { ...validPayload(), api_mst_ship: [validShip({ api_aftershipid: bad })] }
    expect(validateStart2Payload(payload).ok).toBe(false)
  })

  it.each(['api_name', 'api_houg', 'api_souk', 'api_raig', 'api_baku', 'api_tyku', 'api_tais',
    'api_houm', 'api_houk', 'api_saku', 'api_leng', 'api_rare', 'api_luck'])('装备缺少 %s 时拒绝', (field) => {
    const bad = validPayload()
    delete (bad.api_mst_slotitem[0] as Record<string, unknown>)[field]
    expect(validateStart2Payload(bad).ok).toBe(false)
  })

  it('装备记录缺少 api_id 时拒绝', () => {
    const bad = validPayload()
    delete (bad.api_mst_slotitem[0] as Record<string, unknown>).api_id
    expect(validateStart2Payload(bad).ok).toBe(false)
  })

  it('两件装备 api_id 相同时拒绝', () => {
    const bad = {
      ...validPayload(),
      api_mst_slotitem: [validEquip({ api_id: 1 }), validEquip({ api_id: 1, api_name: '另一件' })],
    }
    expect(validateStart2Payload(bad).ok).toBe(false)
  })

  // 类别 4：api_type / api_broken 不是数组、长度不对、元素不是数值
  it('装备 api_type 不是数组时拒绝', () => {
    const bad = { ...validPayload(), api_mst_slotitem: [validEquip({ api_type: 'x' })] }
    expect(validateStart2Payload(bad).ok).toBe(false)
  })

  it.each([4, 6])('装备 api_type 长度是 %i（不是 5）时拒绝', (len) => {
    const bad = { ...validPayload(), api_mst_slotitem: [validEquip({ api_type: Array(len).fill(0) })] }
    expect(validateStart2Payload(bad).ok).toBe(false)
  })

  it('装备 api_type 含非数值元素时拒绝', () => {
    const bad = { ...validPayload(), api_mst_slotitem: [validEquip({ api_type: [0, 0, '0', 0, 0] })] }
    expect(validateStart2Payload(bad).ok).toBe(false)
  })

  it('装备 api_broken 不是数组、或长度不是 4、或含非数值元素时拒绝', () => {
    expect(validateStart2Payload({ ...validPayload(), api_mst_slotitem: [validEquip({ api_broken: {} })] }).ok).toBe(false)
    expect(validateStart2Payload({ ...validPayload(), api_mst_slotitem: [validEquip({ api_broken: [1, 1, 1] })] }).ok).toBe(false)
    expect(validateStart2Payload({ ...validPayload(), api_mst_slotitem: [validEquip({ api_broken: [1, 1, 1, null] })] }).ok).toBe(false)
  })

  it('api_mst_equip_exslot_ship 的值缺少合法 api_req_level 时拒绝', () => {
    const bad = {
      ...validPayload(),
      api_mst_equip_exslot_ship: { '10': { api_req_level: 'x' } },
    }
    expect(validateStart2Payload(bad).ok).toBe(false)
  })

  it('api_mst_stype / api_mst_equip_ship 记录字段不对时拒绝', () => {
    const badStype = { ...validPayload(), api_mst_stype: [{ api_id: 'x', api_equip_type: {} }] }
    expect(validateStart2Payload(badStype).ok).toBe(false)

    const badEquipShip = { ...validPayload(), api_mst_equip_ship: [{ api_ship_id: 1, api_equip_type: 'x' }] }
    expect(validateStart2Payload(badEquipShip).ok).toBe(false)
  })
})

describe('validateCtypeMap', () => {
  it('正式数据 public/data/ctype.json 完整通过校验', () => {
    const json = JSON.parse(readFileSync(join(DATA_DIR, 'ctype.json'), 'utf8'))
    const result = validateCtypeMap(json)
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('合法映射通过校验', () => {
    expect(validateCtypeMap({ '1': '绫波型' })).toEqual({ ok: true, errors: [] })
  })

  it.each([null, undefined, [], 'x', 1])('顶层不是对象（%p）时拒绝', (bad) => {
    expect(validateCtypeMap(bad).ok).toBe(false)
  })

  it('空对象时拒绝（P1-3 实测复现的场景之一：空表被当成加载成功）', () => {
    const result = validateCtypeMap({})
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/为空/)
  })

  it('键不是纯数字字符串时拒绝', () => {
    expect(validateCtypeMap({ abc: '绫波型' }).ok).toBe(false)
  })

  it.each([undefined, 1, '', null])('值不是非空字符串（%p）时拒绝', (bad) => {
    expect(validateCtypeMap({ '1': bad }).ok).toBe(false)
  })
})

describe('validateDevelopmentPools', () => {
  const start2 = JSON.parse(readFileSync(join(DATA_DIR, 'start2.json'), 'utf8'))
  const equipIds = new Set<number>(start2.api_mst_slotitem.map((e: { api_id: number }) => e.api_id))

  function validPool(overrides: Record<string, unknown> = {}) {
    return {
      开发池名称: '测试池',
      开发池ID: 1,
      出货率: { '1': 5 },
      ...overrides,
    }
  }

  it('正式数据 public/data/DevelopmentPool.json 完整通过校验（含跨 start2 的装备 ID 校验）', () => {
    const pools = JSON.parse(readFileSync(join(DATA_DIR, 'DevelopmentPool.json'), 'utf8'))
    const result = validateDevelopmentPools(pools, equipIds)
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('合法的单条记录通过校验', () => {
    expect(validateDevelopmentPools([validPool()], equipIds)).toEqual({ ok: true, errors: [] })
  })

  it('顶层不是数组时拒绝', () => {
    expect(validateDevelopmentPools({}, equipIds).ok).toBe(false)
  })

  it('空数组时拒绝（P1-3 实测复现：DevelopmentPool=[] 被当成加载成功并永久缓存空池）', () => {
    const result = validateDevelopmentPools([], equipIds)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/为空数组/)
  })

  it('DevelopmentPool=[{}] 这种"有记录但字段全空"的畸形记录被拒绝（不只是 [] 这一种空）', () => {
    const result = validateDevelopmentPools([{}], equipIds)
    expect(result.ok).toBe(false)
    // 名称缺失、开发池ID 不合法、出货率 缺失，三类问题应该都被报出来，
    // 而不是遇到第一个问题就短路退出、掩盖其余问题。
    const joined = result.errors.join('\n')
    expect(joined).toMatch(/开发池名称/)
    expect(joined).toMatch(/开发池ID/)
    expect(joined).toMatch(/出货率/)
  })

  it('开发池名称 为空字符串时拒绝', () => {
    expect(validateDevelopmentPools([validPool({ 开发池名称: '' })], equipIds).ok).toBe(false)
  })

  it.each([0, 4, -3, 1.5, '1'])('开发池ID=%p（不在 {-2,-1,1,2,3} 内）时拒绝', (badId) => {
    expect(validateDevelopmentPools([validPool({ 开发池ID: badId })], equipIds).ok).toBe(false)
  })

  it('同名不同 开发池ID 允许重复（正式数据里的常态：同一描述对应铝池和弹池两条记录）', () => {
    const pools = [validPool({ 开发池ID: 1 }), validPool({ 开发池ID: 2 })]
    expect(validateDevelopmentPools(pools, equipIds).ok).toBe(true)
  })

  it('(开发池名称, 开发池ID) 组合完全重复时拒绝', () => {
    const pools = [validPool(), validPool()]
    const result = validateDevelopmentPools(pools, equipIds)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/重复/)
  })

  it('出货率 缺失或为空对象时拒绝', () => {
    expect(validateDevelopmentPools([validPool({ 出货率: undefined })], equipIds).ok).toBe(false)
    expect(validateDevelopmentPools([validPool({ 出货率: {} })], equipIds).ok).toBe(false)
  })

  it('出货率 的值不是有限数值时拒绝', () => {
    expect(validateDevelopmentPools([validPool({ 出货率: { '1': 'x' } })], equipIds).ok).toBe(false)
    expect(validateDevelopmentPools([validPool({ 出货率: { '1': NaN } })], equipIds).ok).toBe(false)
  })

  it('出货率 的值允许负数（正式数据里存在，比如 -6/-2，语义由 core 层解释）', () => {
    expect(validateDevelopmentPools([validPool({ 出货率: { '1': -6 } })], equipIds).ok).toBe(true)
  })

  it('传入 validEquipIds 时，出货率 引用不存在于 start2 的装备 ID 会被拒绝', () => {
    const result = validateDevelopmentPools([validPool({ 出货率: { '999999': 5 } })], equipIds)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/不存在于 start2/)
  })

  it('不传 validEquipIds 时跳过跨文件校验', () => {
    const result = validateDevelopmentPools([validPool({ 出货率: { '999999': 5 } })])
    expect(result.ok).toBe(true)
  })

  it.each(['舰种', '舰型', '舰名'])('%s 存在但不是字符串数组时拒绝', (field) => {
    expect(validateDevelopmentPools([validPool({ [field]: [1, 2] })], equipIds).ok).toBe(false)
    expect(validateDevelopmentPools([validPool({ [field]: 'x' })], equipIds).ok).toBe(false)
  })

  it.each(['舰ID', '不包含舰ID'])('%s 存在但不是数值数组时拒绝', (field) => {
    expect(validateDevelopmentPools([validPool({ [field]: ['1'] })], equipIds).ok).toBe(false)
  })

  it('最低资源 长度不是 4 或含负数时拒绝', () => {
    expect(validateDevelopmentPools([validPool({ 最低资源: [1, 2, 3] })], equipIds).ok).toBe(false)
    expect(validateDevelopmentPools([validPool({ 最低资源: [1, 2, 3, -1] })], equipIds).ok).toBe(false)
    expect(validateDevelopmentPools([validPool({ 最低资源: [0, 0, 0, 0] })], equipIds).ok).toBe(true)
  })
})
