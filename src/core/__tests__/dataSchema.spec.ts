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

// 一条能通过全部校验的最小合法舰种记录——api_mst_stype 曾经允许为空数组，
// i18n 的 stypeName() ja 分支落地后它变成了 ja 舰种名的唯一数据源，
// 空数组/缺 api_name 都不再合法（见 dataSchema.js 里对应的 ⚠️ 注释）。
function validStype(overrides: Record<string, unknown> = {}) {
  return { api_id: 1, api_name: '海防艦', api_equip_type: {}, ...overrides }
}

// 开发池实际引用到的 20 个 stype 代码对应的数值 id（与 dataSchema.js 里
// REQUIRED_STYPE_IDS 的键集合同一份清单——这里独立抄一份而不是 import
// 它，是因为 REQUIRED_STYPE_IDS 本身没有具名导出（校验器的内部实现细节，
// 不是这个模块对外承诺的接口），测试拿到的应该是"这 20 个 id 各自独立
// 核对过、写死在测试里"的清单，不是"信任被测代码自己声称的清单"）。
const REQUIRED_STYPE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 16, 17, 18, 19, 20, 21, 22]

/** 覆盖全部 20 个必需 stype id 的最小合法表——validPayload() 的默认值，
 *  单条覆盖（如 validStype({ api_id: 99 })）想测别的畸形维度时，用
 *  validPayload({}, {}, [...validStypeTable(), 那一条坏记录]) 之类的写法
 *  单独替换 api_mst_stype，不需要每次都重新拼一遍 20 条。 */
function validStypeTable() {
  return REQUIRED_STYPE_IDS.map((id) => validStype({ api_id: id, api_name: `舰种${id}` }))
}

function validPayload(shipOverrides = {}, equipOverrides = {}, stypeOverride?: Record<string, unknown>[]) {
  return {
    api_mst_ship: [validShip(shipOverrides)],
    api_mst_slotitem: [validEquip(equipOverrides)],
    api_mst_stype: stypeOverride ?? validStypeTable(),
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

  // 曾经允许为空（"它只是辅助数据"），i18n 的 stypeName() ja 分支落地后
  // api_mst_stype 变成了 ja 舰种名的唯一数据源，空数组会让 ja 下全部舰种名
  // 回退成 stype 代码本身而不是日文名——不再是"没有影响的缺省"。
  it('api_mst_stype 是空数组时拒绝（字段存在但为空，i18n 的 stypeName ja 分支拿不到任何日文舰种名）', () => {
    const bad = { ...validPayload(), api_mst_stype: [] }
    const result = validateStart2Payload(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/api_mst_stype 为空数组/)
  })

  it('api_mst_stype 记录缺少 api_name 时拒绝（stypeName 的 ja 分支读它作为日文舰种名）', () => {
    const bad = { ...validPayload(), api_mst_stype: [validStype({ api_name: undefined })] }
    const result = validateStart2Payload(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/api_id=1 缺少 api_name（或为空字符串）/)
  })

  it('api_mst_stype 记录 api_name 为空字符串时拒绝（不只是缺失这一种"没有名字"）', () => {
    const bad = { ...validPayload(), api_mst_stype: [validStype({ api_name: '' })] }
    const result = validateStart2Payload(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/api_id=1 缺少 api_name（或为空字符串）/)
  })

  it.each([0, -1, 1.5, '1', null])('api_mst_stype 记录 api_id=%p（非正整数）时拒绝', (badId) => {
    const bad = { ...validPayload(), api_mst_stype: [validStype({ api_id: badId })] }
    expect(validateStart2Payload(bad).ok).toBe(false)
  })

  it('两条 api_mst_stype 记录 api_id 相同时拒绝', () => {
    const bad = {
      ...validPayload(),
      api_mst_stype: [...validStypeTable(), validStype({ api_id: 1, api_name: '重复的海防艦' })],
    }
    const result = validateStart2Payload(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/api_id=1 与其他记录重复/)
  })

  it('api_mst_stype 表只有一条记录时拒绝——非空不等于覆盖了开发池实际引用到的舰种', () => {
    const bad = { ...validPayload(), api_mst_stype: [validStype()] }
    const result = validateStart2Payload(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/api_mst_stype 缺少开发池实际引用到的舰种/)
    // 缺的应该是除了 1(DE) 之外的全部 19 个，包含具体报出 2(DD)
    expect(result.errors.join('\n')).toMatch(/2\(DD\)/)
  })

  it('api_mst_stype 表覆盖全部 20 个必需 id 时通过（validStypeTable() 本身就是这条用例的证明，这里显式断言一次）', () => {
    const ok = { ...validPayload(), api_mst_stype: validStypeTable() }
    expect(validateStart2Payload(ok).ok).toBe(true)
  })

  // 上游在 2026-07 把 api_mst_equip_ship 从「数组 + api_equip_type 数值数组」
  // 改成了「以舰ID为键的对象 + api_equip_type 对象映射」。本项目从不消费这张表
  // （它此前只喂给 ship.打孔装备/打孔装备图标，而那两个字段全项目只写不读，
  // 已随本次改动一并删除），所以校验器也不应该因为它的形状而拒绝整份数据 ——
  // 否则就是「为了满足一个自己写的校验器，去适配一份自己根本不读的数据」。
  // api_mst_equip_exslot_ship 同理。
  it('api_mst_equip_ship / api_mst_equip_exslot_ship 的形状不参与校验', () => {
    const newUpstreamShape = {
      ...validPayload(),
      api_mst_equip_ship: { '100': { api_equip_type: { '1': null, '27': [268] } } },
      api_mst_equip_exslot_ship: { '10': { api_req_level: 'x' } },
    }
    expect(validateStart2Payload(newUpstreamShape).errors).toEqual([])

    const absent: Record<string, unknown> = { ...validPayload() }
    delete absent.api_mst_equip_ship
    delete absent.api_mst_equip_exslot_ship
    expect(validateStart2Payload(absent).errors).toEqual([])
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

  // 这里原本还有两条断言：「api_mst_equip_exslot_ship 的值缺少合法
  // api_req_level 时拒绝」，以及上面这条里针对 api_mst_equip_ship 记录字段的
  // 那一半。两者随对应校验一并删除 —— 校验没了，断言就没有对象可测；留着
  // 只会变成永远为真的空壳。删除理由见本文件上方
  // 「api_mst_equip_ship / api_mst_equip_exslot_ship 的形状不参与校验」
  // 那条测试的注释。
  it('api_mst_stype 记录字段不对时拒绝', () => {
    const badStype = { ...validPayload(), api_mst_stype: [{ api_id: 'x', api_equip_type: {} }] }
    expect(validateStart2Payload(badStype).ok).toBe(false)
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
