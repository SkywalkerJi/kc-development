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

function stubFetch(impl: (url: string) => Promise<{ json: () => Promise<unknown>; text: () => Promise<string> }>) {
  vi.stubGlobal('fetch', vi.fn(impl))
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

// G2：就绪判断不能靠"非空推断"。start2Store 是边解析边把舰船写进 shipList 的
// （readStart2 内部逐条 `shipList.value[id] = ship`），如果第一条舰船合法、
// 后续字段（比如 api_mst_slotitem）缺失导致抛错，shipList 已经非空——但这次
// 加载并未成功。isReady 必须只在整个 readStart2() 跑完、且关键表都非空后才
// 置位，抛错路径一律不会置位；developmentStore 的守卫要读这个标志，不能继续
// 用"shipList 非空"去推断（那条用例在 developmentStore.spec.ts 里单独覆盖）。
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

  // 直接调用 readStart2()（不经 initializeData 的进行中缓存——缓存只在失败
  // 时清空，成功一次后再调 initializeData() 会直接拿缓存结果、根本不会重新
  // 拉取，测不出这里要验证的东西）。验证的是 readStart2 自己在"重新进入"时
  // 会先把 isReady 复位成 false，不会沿用上一次成功时留下的 true——如果没有
  // 这一步复位，成功一次后紧接着失败一次，isReady 会停留在过期的 true。
  it('成功一次后紧接着失败一次：isReady 必须回到 false，不能沿用上一次成功的状态', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let start2Calls = 0
    stubFetch(async (url: string) => {
      if (url.includes('start2.json')) {
        start2Calls++
        return { json: async () => (start2Calls === 1 ? goodStart2Payload() : {}), text: async () => '[]' }
      }
      return { json: async () => ({}), text: async () => '[]' }
    })
    const store = useStart2Store()

    await store.readStart2()
    expect(store.isReady).toBe(true)

    await expect(store.readStart2()).rejects.toThrow()
    expect(store.isReady).toBe(false)
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

  it('部分解析失败（第一条舰船合法、api_mst_slotitem 缺失）：shipList 已非空，但 isReady 必须是 false，且再次调用必须重试（重新拉取 start2.json），不能被"非空"误判为已就绪', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    let start2Calls = 0
    stubFetch(async (url: string) => {
      if (url.includes('start2.json')) {
        start2Calls++
        if (start2Calls === 1) {
          // 第一条舰船合法，但整个 payload 缺 api_mst_slotitem——
          // readStart2 会先把 shipList 写满，再在处理装备数据时
          // `for (const item of json.api_mst_slotitem)` 因 undefined 不可迭代而抛错。
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
    // 关键断言 1：shipList 此时确实已经非空（复现"边解析边发布"的残留状态）——
    // 如果这一步都不成立，就没有真正复现 G2 描述的那类问题。
    expect(Object.keys(store.shipList).length).toBeGreaterThan(0)
    // 关键断言 2：即便 shipList 非空，isReady 也必须是 false。
    expect(store.isReady).toBe(false)
    expect(start2Calls).toBe(1)

    // 关键断言 3：再次调用会真正重新拉取 start2.json（重试），而不是被
    // "shipList 已非空"这种错误信号挡在外面、或被失败缓存挡住。
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

  it('shipList 非空但全是 id>=1500 的敌方舰船（同型舰分类为空）：视为失败，不把 isReady 置位', async () => {
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
    // shipList 确实非空（复现"非空不等于就绪"）——只是没有任何玩家舰船。
    expect(Object.keys(store.shipList).length).toBeGreaterThan(0)
    expect(Object.keys(store.allSameShipList).length).toBe(0)
    expect(store.isReady).toBe(false)
  })
})
