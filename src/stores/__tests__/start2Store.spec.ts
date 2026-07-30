import { describe, it, expect, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useStart2Store } from '@/stores/start2Store'

// 一艘能被 readStart2 完整处理、不触发任何异常分支的最小合法舰船。
// id < 1500（玩家舰），保证会进入 getSameShipList 的同型舰处理，
// 让 allSameShipList 也跟着非空——这是 G2 新增校验要求的前提。
const VALID_SHIP = {
  api_id: 1,
  api_name: '测试舰',
  api_yomi: 'test',
  api_stype: 1,
  api_ctype: 1,
  api_soku: 5,
  api_aftershipid: 0,
  api_fuel_max: 100,
  api_bull_max: 100,
}

// 一件能被 readStart2 完整处理的最小合法装备。
const VALID_EQUIP = {
  api_id: 1,
  api_name: '测试装备',
  api_houg: 0, api_souk: 0, api_raig: 0, api_baku: 0, api_tyku: 0, api_tais: 0,
  api_houm: 0, api_houk: 0, api_saku: 0, api_leng: 0, api_rare: 0, api_luck: 0,
  api_type: [0, 0, 0, 0, 0],
  api_broken: [1, 1, 1, 1],
}

// 完整、可成功解析的 start2.json 结构。注意：不能用空数组糊弄
// api_mst_ship/api_mst_slotitem——G2 之后，字段齐全但为空数组会被
// readStart2 判定为失败（见下面「G2」的专门用例），不再是"成功"。
function goodStart2Payload() {
  return {
    api_mst_ship: [VALID_SHIP],
    api_mst_slotitem: [VALID_EQUIP],
    api_mst_stype: [],
    api_mst_equip_ship: [],
    api_mst_equip_exslot_ship: {},
  }
}

// P2-1 之后 fetchJson 会先检查 response.ok 才解析 JSON。这里的 impl 大多是
// 这个文件早期写的、只关心 json/text 两个方法的最小 stub，没有 ok/status
// 字段——不逐个改写每处调用，而是在这层统一补上默认的"HTTP 200 成功"字段，
// impl 自己返回的字段（如果显式提供）优先，用于下面 P2-1 的失败态测试。
function stubFetch(
  impl: (
    url: string,
  ) => Promise<{
    json: () => Promise<unknown>
    text?: () => Promise<string>
    ok?: boolean
    status?: number
    statusText?: string
  }>,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const res = await impl(url)
      return { ok: true, status: 200, statusText: 'OK', ...res }
    }),
  )
}

// initializeData 并发去重：App.vue 同时挂载 DataInitializer 与 DevelopmentView，
// 二者各自 await initializeData()。若没有进行中缓存，第二个调用方进入时第一个的
// fetch 还没 resolve，会触发第二次完整加载链路 —— 重复拉取 1.9MB 的 start2.json，
// 且第二遍会整体替换 filterButtonList，静默清空用户已做的装备选择。
// 这条必须是行为测试：把 `inflight ??= ...` 换回直接调用内部实现，这里必须变红。
describe('start2Store.initializeData 并发去重', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('并发调用两次，只触发一次 start2.json 拉取', async () => {
    setActivePinia(createPinia())
    let start2FetchCount = 0
    stubFetch(async (url: string) => {
      if (url.includes('start2.json')) start2FetchCount++
      return {
        json: async () => (url.includes('start2.json') ? goodStart2Payload() : {}),
        text: async () => '[]',
      }
    })

    const store = useStart2Store()
    const p1 = store.initializeData()
    const p2 = store.initializeData()
    await Promise.all([p1, p2])

    expect(start2FetchCount).toBe(1)
  })

  it('并发调用只跑一次底层加载：两次调用拿到同一个结果对象', async () => {
    // 注：不能直接断言两次调用返回的 Promise 引用相等（`toBe`）——Pinia 的 action
    // 包装会为每次调用生成新的 Promise 包装壳（用于 devtools/订阅），即使底层共享
    // 同一个进行中 Promise。真正能证明去重生效的是 resolve 出的结果对象是否同一个
    // 引用：只有底层只跑了一次 `_initializeData()`，两次 resolve 的才会是同一个对象。
    //
    // 这里必须用**能成功解析**的 start2.json 结构——空表在 G2 之后会被判定为
    // 失败，initializeData() 会 reject，`Promise.all` 会直接抛出，这条测试
    // 就无法验证它本来要验证的"去重"这件事了（解析失败/去重是两个独立问题，
    // 分别由下面的 F2/G2 describe 和本 describe 的第一条覆盖）。
    setActivePinia(createPinia())
    stubFetch(async (url: string) => ({
      json: async () => (url.includes('start2.json') ? goodStart2Payload() : {}),
      text: async () => '[]',
    }))
    const store = useStart2Store()
    const [r1, r2] = await Promise.all([store.initializeData(), store.initializeData()])
    expect(r1).toBe(r2)
    expect(r1).toEqual({ success: true, error: null })
  })
})

// F2：readStart2 解析失败（如接口返回结构变化、start2.json 变成 {}）时，
// initializeData() 必须让调用方能感知到失败，而不是悄悄返回"成功"+ 空表；
// 且失败必须是可恢复的——下次调用会真正重新尝试，而不是返回缓存的失败结果。
describe('F2: start2 解析失败时的健壮性', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('start2.json 解析失败（如返回 {}）时，initializeData() 应该失败而不是假装成功', async () => {
    setActivePinia(createPinia())
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(async (url: string) => ({
      // start2.json 返回 {} ——缺少 api_mst_ship，readStart2 内部
      // `for (const item of json.api_mst_ship)` 会抛出 TypeError
      json: async () => (url.includes('start2.json') ? {} : []),
      text: async () => '[]',
    }))
    const store = useStart2Store()

    // 关键断言：解析失败必须让 initializeData() 的 promise 失败，调用方
    // （developmentStore / DataInitializer）现有的 try/catch 才能捕获到它。
    // 如果这里改回旧行为（readStart2 内部吞掉异常），这个 promise 会 resolve
    // 成 { success: true, error: null }，下面这行会失败。
    await expect(store.initializeData()).rejects.toThrow()

    consoleErrorSpy.mockRestore()
  })

  it('解析失败后再次调用会重新尝试，而不是返回缓存的失败结果', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    let start2Calls = 0
    stubFetch(async (url: string) => {
      if (url.includes('start2.json')) {
        start2Calls++
        // 第一次拉取返回损坏数据，第二次（重试）恢复正常
        return { json: async () => (start2Calls === 1 ? {} : goodStart2Payload()), text: async () => '[]' }
      }
      return { json: async () => ({}), text: async () => '[]' }
    })
    const store = useStart2Store()

    await expect(store.initializeData()).rejects.toThrow()
    expect(start2Calls).toBe(1)

    // 如果失败没有清空 inflight，这里会拿到同一个已 reject 的缓存 promise：
    // 依旧 reject、且 start2Calls 不会增长到 2（没有发生新的 fetch）。
    await expect(store.initializeData()).resolves.toEqual({ success: true, error: null })
    expect(start2Calls).toBe(2)
  })
})

// G2：就绪判断不能靠"非空推断"。P1-2 之前，readStart2 是边解析边把舰船写进
// shipList 的（内部逐条 `shipList.value[id] = ship`），如果第一条舰船合法、
// 后续字段（比如 api_mst_slotitem）缺失导致抛错，shipList 已经非空——但这次
// 加载并未成功。P1-2 之后 readStart2 改成先在局部变量里解析完、最后才一次性
// 发布，同样的场景下 shipList 会保持调用前的样子（通常是空表），不会再残留
// 非空内容——但 isReady 仍然是唯一直接表达"是否就绪"的状态，不从 shipList
// 反推：只在整个 readStart2() 跑完、且关键表都非空后才置位，抛错路径一律不会
// 置位；developmentStore 的守卫要读这个标志，不能靠"shipList 非空"去推断
// （那条用例在 developmentStore.spec.ts 里单独覆盖）。
describe('G2: start2Store.isReady 显式就绪标志', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('完整解析成功后 isReady 为 true', async () => {
    setActivePinia(createPinia())
    stubFetch(async (url: string) => ({
      json: async () => (url.includes('start2.json') ? goodStart2Payload() : {}),
      text: async () => '[]',
    }))
    const store = useStart2Store()
    expect(store.isReady).toBe(false)
    await store.initializeData()
    expect(store.isReady).toBe(true)
  })

  // P2-2 之后 readStart2 不再是公开 API（见 start2Store.ts 里它的导出注释），
  // 只能通过 initializeData() 触达，而 initializeData() 成功一次后会把结果
  // 永久缓存在 inflight 里——"先直接调用一次成功的 readStart2，再紧接着调用
  // 一次失败的 readStart2，检查 isReady 是否正确复位"这种测法在公开 API 层面
  // 已经不可能发生（这正是 P2-2 要修的问题：以前 readStart2 是公开导出的，
  // 外部代码能绕过 initializeData 的缓存直接这样调用，制造出"isReady 复位
  // 成 false、但 inflight 仍缓存着旧的成功 promise"这种不一致状态）。
  // isReady 在"重新进入时复位、失败路径不会误置位"这些性质，已经由上面
  // 和下面其它经 initializeData() 触发的失败/重试用例覆盖到了——那些都是
  // "第一次尝试就失败"的场景，不需要依赖已经不存在的直接调用入口。
  // 这里改成验证 P2-2 真正要保证的东西：readStart2 不再出现在公开接口里，
  // 且成功一次后，哪怕后续的 start2.json 响应变成畸形数据，缓存也会完整
  // 屏蔽掉它——不会有任何路径能让这次坏响应影响到已经就绪的状态。
  it('P2-2: readStart2 不再是公开接口', () => {
    setActivePinia(createPinia())
    const store = useStart2Store() as unknown as Record<string, unknown>
    expect(store.readStart2).toBeUndefined()
  })

  it('成功后即使 start2.json 换成畸形响应，再次调用 initializeData() 依然返回上一次成功的缓存结果，isReady 保持 true、shipList 引用不变——没有任何公开入口能让后续的坏响应影响到已就绪的状态', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let start2Calls = 0
    stubFetch(async (url: string) => {
      if (url.includes('start2.json')) {
        start2Calls++
        // 第一次成功；第二次（如果真的发生了重新拉取）会是畸形数据。
        return { json: async () => (start2Calls === 1 ? goodStart2Payload() : {}), text: async () => '[]' }
      }
      return { json: async () => ({}), text: async () => '[]' }
    })
    const store = useStart2Store()

    await store.initializeData()
    expect(store.isReady).toBe(true)
    const shipListRefAfterSuccess = store.shipList

    // 再次调用：inflight 缓存常驻，不会重新拉取 start2.json，
    // 也就不会被"第二次响应是畸形数据"这件事影响到。
    await expect(store.initializeData()).resolves.toEqual({ success: true, error: null })
    expect(start2Calls).toBe(1)
    expect(store.isReady).toBe(true)
    expect(store.shipList).toBe(shipListRefAfterSuccess)
  })

  it('完全解析失败（start2.json 返回 {}）时 isReady 保持 false', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(async (url: string) => ({
      json: async () => (url.includes('start2.json') ? {} : []),
      text: async () => '[]',
    }))
    const store = useStart2Store()
    await expect(store.initializeData()).rejects.toThrow()
    expect(store.isReady).toBe(false)
  })

  it('缺少 api_mst_slotitem 的畸形 payload：schema 校验在触碰任何 store 状态之前就拒绝，shipList 保持空表，且再次调用必须重试（重新拉取 start2.json）', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    let start2Calls = 0
    stubFetch(async (url: string) => {
      if (url.includes('start2.json')) {
        start2Calls++
        if (start2Calls === 1) {
          // 第一条舰船合法，但整个 payload 缺 api_mst_slotitem——
          // readStart2 现在先做 schema 校验，validateStart2Payload 会在
          // 处理任何一条记录之前就因为顶层缺少 api_mst_slotitem 而拒绝，
          // 不会像旧版本那样先把 shipList 写满、再在装备循环里因为
          // undefined 不可迭代而意外抛错。
          return {
            json: async () => ({ api_mst_ship: [VALID_SHIP] }),
            text: async () => '[]',
          }
        }
        // 第二次（重试）恢复正常
        return { json: async () => goodStart2Payload(), text: async () => '[]' }
      }
      return { json: async () => ({}), text: async () => '[]' }
    })
    const store = useStart2Store()

    await expect(store.initializeData()).rejects.toThrow()
    // 关键断言 1（原子发布）：readStart2 现在先把整套结果解析到局部变量，
    // 只有全部成功后才一次性发布到 store；schema 校验失败发生在任何一次
    // `shipList.value = ...` 赋值之前，所以 shipList 必须保持这次调用开始前
    // 的样子（这里是初始的空表），不会出现"舰船写了、装备没写"的半成品状态。
    // 这与旧版本"边解析边发布，shipList 会残留非空状态"的行为是刻意相反的——
    // 那正是 P1-2 要修的问题本身，不是需要复现保留的行为。
    expect(Object.keys(store.shipList).length).toBe(0)
    // 关键断言 2：isReady 为 false。
    expect(store.isReady).toBe(false)
    expect(start2Calls).toBe(1)

    // 关键断言 3：再次调用会真正重新拉取 start2.json（重试），而不是被
    // 失败缓存挡住。
    await expect(store.initializeData()).resolves.toEqual({ success: true, error: null })
    expect(start2Calls).toBe(2)
    expect(store.isReady).toBe(true)
  })

  it('字段齐全但 api_mst_ship 与 api_mst_slotitem 都是空数组：视为失败，不得永久缓存成功；再次调用会重试并成功', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    let start2Calls = 0
    stubFetch(async (url: string) => {
      if (url.includes('start2.json')) {
        start2Calls++
        if (start2Calls === 1) {
          return {
            json: async () => ({
              api_mst_ship: [],
              api_mst_slotitem: [],
              api_mst_stype: [],
              api_mst_equip_ship: [],
              api_mst_equip_exslot_ship: {},
            }),
            text: async () => '[]',
          }
        }
        return { json: async () => goodStart2Payload(), text: async () => '[]' }
      }
      return { json: async () => ({}), text: async () => '[]' }
    })
    const store = useStart2Store()

    await expect(store.initializeData()).rejects.toThrow()
    expect(store.isReady).toBe(false)
    expect(Object.keys(store.shipList).length).toBe(0)

    await expect(store.initializeData()).resolves.toEqual({ success: true, error: null })
    expect(start2Calls).toBe(2)
    expect(store.isReady).toBe(true)
  })

  it('全是 id>=1500 的敌方舰船（同型舰分类为空）：形状完全合法但业务上判定失败，且不发布任何部分状态，不把 isReady 置位', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const enemyOnlyShip = { ...VALID_SHIP, api_id: 1600, api_fuel_max: undefined, api_bull_max: undefined }
    stubFetch(async (url: string) => ({
      json: async () =>
        url.includes('start2.json')
          ? {
              api_mst_ship: [enemyOnlyShip],
              api_mst_slotitem: [VALID_EQUIP],
              api_mst_stype: [],
              api_mst_equip_ship: [],
              api_mst_equip_exslot_ship: {},
            }
          : {},
      text: async () => '[]',
    }))
    const store = useStart2Store()

    await expect(store.initializeData()).rejects.toThrow()
    // 这条 payload 的每条记录本身形状完全合法（能通过 dataSchema 的结构
    // 校验），只是业务上没有任何玩家舰船，导致同型舰分类为空——这类跨记录
    // 的业务失败发生在 readStart2 的原子发布块之前，所以 shipList 必须
    // 保持这次调用开始前的样子（空表），不会因为"记录形状合法"就被部分发布。
    expect(Object.keys(store.shipList).length).toBe(0)
    expect(Object.keys(store.allSameShipList).length).toBe(0)
    expect(store.isReady).toBe(false)
  })
})

// P1-2：readStart2 接入 dataSchema.js 的结构校验，且改为「先在局部变量里
// 解析完，最后一次性发布」。dataSchema.spec.ts 已经对校验器本身做了穷举式
// 覆盖（顶层形状、ID 缺失/非正整数/重复、必需字段缺失、api_type/api_broken
// 形状等），这里只做集成层面的断言：确认 store 真的接了这套校验、且原子
// 发布这件事在"覆盖旧数据"这个更严格的场景下也成立——不仅是"这次失败不会
// 半发布"，还包括"这次失败完全不影响上一次成功遗留的数据"。
describe('P1-2: readStart2 的 schema 校验与原子发布集成', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('舰船记录缺少 api_id（审查举的原始例子）：初始化失败，shipList 不出现 "undefined" 键，且失败可重试', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    let start2Calls = 0
    stubFetch(async (url: string) => {
      if (url.includes('start2.json')) {
        start2Calls++
        if (start2Calls === 1) {
          const shipWithoutId: Record<string, unknown> = { ...VALID_SHIP }
          delete shipWithoutId.api_id
          return {
            json: async () => ({
              api_mst_ship: [shipWithoutId],
              api_mst_slotitem: [VALID_EQUIP],
              api_mst_stype: [],
              api_mst_equip_ship: [],
              api_mst_equip_exslot_ship: {},
            }),
            text: async () => '[]',
          }
        }
        return { json: async () => goodStart2Payload(), text: async () => '[]' }
      }
      return { json: async () => ({}), text: async () => '[]' }
    })
    const store = useStart2Store()

    await expect(store.initializeData()).rejects.toThrow()
    // 旧代码在这个场景下会产出键 "undefined" 的 shipList 项；新代码在校验
    // 阶段就已经拒绝，shipList 根本没被碰过。
    expect(store.shipList['undefined' as unknown as number]).toBeUndefined()
    expect(Object.keys(store.shipList).length).toBe(0)
    expect(store.isReady).toBe(false)

    await expect(store.initializeData()).resolves.toEqual({ success: true, error: null })
    expect(start2Calls).toBe(2)
  })

  it('两条舰船记录 api_id 重复：初始化失败', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(async (url: string) => ({
      json: async () =>
        url.includes('start2.json')
          ? {
              api_mst_ship: [VALID_SHIP, { ...VALID_SHIP, api_name: '另一艘' }],
              api_mst_slotitem: [VALID_EQUIP],
              api_mst_stype: [],
              api_mst_equip_ship: [],
              api_mst_equip_exslot_ship: {},
            }
          : {},
      text: async () => '[]',
    }))
    const store = useStart2Store()
    await expect(store.initializeData()).rejects.toThrow()
    expect(store.isReady).toBe(false)
  })

  it('装备 api_type 长度不是 5：初始化失败', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(async (url: string) => ({
      json: async () =>
        url.includes('start2.json')
          ? {
              api_mst_ship: [VALID_SHIP],
              api_mst_slotitem: [{ ...VALID_EQUIP, api_type: [0, 0, 0, 0] }],
              api_mst_stype: [],
              api_mst_equip_ship: [],
              api_mst_equip_exslot_ship: {},
            }
          : {},
      text: async () => '[]',
    }))
    const store = useStart2Store()
    await expect(store.initializeData()).rejects.toThrow()
    expect(store.isReady).toBe(false)
  })

  // 这里原来有一条"成功一次后紧接着直接调用一次失败的 readStart2，断言
  // shipList/equipList 引用保持不变"的用例，验证原子发布不会让一次失败的
  // 重新加载清空/替换掉上一次成功的数据。P2-2 之后 readStart2 不再导出，
  // "直接调用它、绕开 initializeData 的成功缓存去制造一次新的加载尝试"
  // 这条路径已经不存在——公开 API 层面，成功一次之后 initializeData()
  // 根本不会再触发新的 fetch（见下面 G2 describe 里"成功后即使 start2.json
  // 换成畸形响应…"那条用例），所以旧用例测的场景已经不可达。它验证的atomicity
  // 性质（失败不清空/替换已发布的状态）仍然由本 describe 里"缺少
  // api_mst_slotitem"等"第一次尝试就失败"的用例覆盖——那些走的都是
  // initializeData() 的公开路径，不依赖已经不存在的 readStart2 导出。
})

// P2-1：全项目此前没有任何一处 fetch 检查 response.ok。HTTP 500 若恰好返回
// 结构合法的 JSON（比如网关错误页被解析成 `{}`），会被当成正常数据继续走，
// 而不是在请求层面就被拒绝。这里验证 readStart2/readAbyssalStats 都已经
// 接入 fetchJson/assertResponseOk，状态码检查先于任何数据处理生效。
//
// 具体的错误信息内容（比如带着 "HTTP 500" 字样）已经在 fetchJson.spec.ts
// 里直接对 fetchJson/assertResponseOk 做了断言。这里只测到 store 这一层的
// 集成：状态码错误确实会让 initializeData() 失败、不留下部分状态、且可
// 重试——不再重复断言具体的错误文案（P2-2 之后 readStart2 不再导出，
// 想看到未被 _initializeData 重新包装过的原始错误信息，只能从 readStart2
// 内部直接测，而它已经不是公开接口了）。
describe('P2-1: HTTP 状态码检查', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('start2.json 返回 HTTP 500，即便响应体是结构合法的 JSON，也必须拒绝而不是当成成功数据缓存；失败后重试可恢复', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let start2Calls = 0
    stubFetch(async (url: string) => {
      if (url.includes('start2.json')) {
        start2Calls++
        // 第一次返回 HTTP 500——响应体本身是完全合法的 start2 payload，
        // 如果不检查状态码，这次加载会被当成成功。第二次（重试）恢复正常。
        if (start2Calls === 1) {
          return { ok: false, status: 500, statusText: 'Internal Server Error', json: async () => goodStart2Payload(), text: async () => '[]' }
        }
        return { json: async () => goodStart2Payload(), text: async () => '[]' }
      }
      return { json: async () => ({}), text: async () => '[]' }
    })
    const store = useStart2Store()

    await expect(store.initializeData()).rejects.toThrow()
    expect(store.isReady).toBe(false)
    expect(Object.keys(store.shipList).length).toBe(0)
    expect(start2Calls).toBe(1)

    // 失败必须可重试：状态码恢复正常后，下一次调用应该成功。
    await expect(store.initializeData()).resolves.toEqual({ success: true, error: null })
    expect(start2Calls).toBe(2)
    expect(store.isReady).toBe(true)
  })

  it('start2.json 返回 HTTP 404 时同样拒绝', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(async (url: string) => {
      if (url.includes('start2.json')) {
        return { ok: false, status: 404, statusText: 'Not Found', json: async () => goodStart2Payload(), text: async () => '[]' }
      }
      return { json: async () => ({}), text: async () => '[]' }
    })
    const store = useStart2Store()
    await expect(store.initializeData()).rejects.toThrow()
  })

  it('abyssal_stats.json 返回 HTTP 500 时不影响关键数据加载（该数据非致命，failure 只打日志）', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch(async (url: string) => {
      if (url.includes('start2.json')) return { json: async () => goodStart2Payload(), text: async () => '[]' }
      if (url.includes('abyssal_stats.json'))
        return { ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({}), text: async () => '{}' }
      return { json: async () => ({}), text: async () => '[]' }
    })
    const store = useStart2Store()
    // 关键数据（start2）本身仍然成功，深海舰船数据的 HTTP 500 被
    // readAbyssalStats 自己的 try/catch 吞掉，不应该让整个初始化失败。
    await expect(store.initializeData()).resolves.toEqual({ success: true, error: null })
    expect(store.isReady).toBe(true)
  })
})
