import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDevelopmentStore } from '@/stores/developmentStore'
import { useStart2Store } from '@/stores/start2Store'
import { createPools, DevelopmentPoolClass } from '@/core/developmentPool'

// P2-1 之后 fetchJson 会先检查 response.ok 才解析 JSON。这个文件里的 fetch
// stub 大多是早期写的、只关心 json（偶尔 text）两个方法的最小 stub，没有
// ok/status 字段——不逐个改写每处调用，而是在这层统一补上默认的"HTTP 200
// 成功"字段，impl 自己返回的字段（如果显式提供）优先，用于 P2-1 的失败态测试。
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

describe('developmentStore 公开接口', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('不再暴露已删除的算法函数', () => {
    const s = useDevelopmentStore() as unknown as Record<string, unknown>
    expect(s.calculateDevelopmentResults).toBeUndefined()
    expect(s.updateAvailableEquipments).toBeUndefined()
    expect(s.getResult).toBeUndefined()
  })

  it('保留状态与数据加载接口', () => {
    const s = useDevelopmentStore()
    expect(typeof s.initializeData).toBe('function')
    expect(typeof s.toggleEquipmentSelect).toBe('function')
    expect(typeof s.getSelectedEquipIds).toBe('function')
    expect(typeof s.setFlagship).toBe('function')
  })

  it('toggleEquipmentSelect 翻转选中态', () => {
    const s = useDevelopmentStore()
    s.filterButtonList[10] = { equipInfo: { id: 10 } as never, select: false, enabled: true }
    s.toggleEquipmentSelect(10)
    expect(s.filterButtonList[10].select).toBe(true)
    s.toggleEquipmentSelect(10)
    expect(s.filterButtonList[10].select).toBe(false)
  })

  it('getSelectedEquipIds 只返回选中项', () => {
    const s = useDevelopmentStore()
    s.filterButtonList[10] = { equipInfo: { id: 10 } as never, select: true, enabled: true }
    s.filterButtonList[20] = { equipInfo: { id: 20 } as never, select: false, enabled: true }
    expect(s.getSelectedEquipIds()).toEqual([10])
  })
})

// 以下两组是**行为**测试。上面那几条 `typeof === 'function'` 只验证了名字存在 ——
// 把竞态守卫改成 `if (false)`、把取最窄池的 `>=` 改成 `<=`，它们都照样全绿。
// 这两处恰恰是本任务要修的核心缺陷，必须有能变红的断言。

// G2：就绪判断不能靠"非空推断"。start2Store 是边解析边把舰船写进 shipList 的，
// 解析到一半失败时 shipList 可能已经非空，但这次加载并未成功——用"非空"当
// "已就绪"会把这种残留状态误判成功、跳过重试。守卫必须读 start2Store 显式
// 维护的 isReady 标志。
describe('initializeData 的数据加载竞态守卫', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // 两个 JSON 端点都返回空结构，让加载链路走通而不依赖真实数据
    stubFetch(async (url: string) => ({
      json: async () => (url.includes('ctype') ? {} : []),
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('isReady 为 false 时先初始化 start2', async () => {
    const start2 = useStart2Store()
    const spy = vi
      .spyOn(start2, 'initializeData')
      .mockResolvedValue({ success: true, error: null })
    await useDevelopmentStore().initializeData()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('isReady 为 true 时跳过，不重复加载', async () => {
    const start2 = useStart2Store()
    start2.isReady = true
    const spy = vi.spyOn(start2, 'initializeData')
    await useDevelopmentStore().initializeData()
    expect(spy).not.toHaveBeenCalled()
  })

  // 这条锁的正是 G2 描述的错误假设本身：shipList 非空 ≠ 已就绪。把守卫改回
  // `Object.keys(start2Store.shipList).length === 0` 会让这条变红——非空的
  // shipList 会被当成"已就绪"，spy 不会被调用，下面的断言就会失败。
  it('shipList 非空但 isReady 为 false（模拟部分解析失败残留的状态）时，仍会重新加载，不能靠"非空"误判为已就绪', async () => {
    const start2 = useStart2Store()
    start2.shipList[1] = { id: 1, name: 'A', stype: 9, ctype: 1 } as never
    expect(start2.isReady).toBe(false)
    const spy = vi
      .spyOn(start2, 'initializeData')
      .mockResolvedValue({ success: true, error: null })
    await useDevelopmentStore().initializeData()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

// F3：developmentStore.initializeData 自身没有进行中缓存，而 DataInitializer.vue
// 与 DevelopmentView.vue 会并发各调一次。后果：两次 ctype 请求、两次
// DevelopmentPool 请求，initFilterButtonList() 跑两遍——第二遍整体替换
// filterButtonList，可能清空用户刚做的装备选择。以下用能变红的行为断言覆盖。
describe('F3: developmentStore.initializeData 并发去重', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())

  it('并发调用两次，ctype 与 DevelopmentPool 请求各只发生一次；start2Store.initializeData 也只调一次', async () => {
    let ctypeCalls = 0
    let poolCalls = 0
    stubFetch(async (url: string) => {
        if (url.includes('ctype')) {
          ctypeCalls++
          return { json: async () => ({ '1': 'x' }) }
        }
        if (url.includes('DevelopmentPool')) {
          poolCalls++
          return { json: async () => [{ 开发池名称: 'A', 开发池ID: 1, 舰ID: [], 出货率: { '1': 5 } }] }
        }
        return { json: async () => ({}) }
    })
    const start2 = useStart2Store()
    const start2Spy = vi
      .spyOn(start2, 'initializeData')
      .mockResolvedValue({ success: true, error: null })
    // readCtypeAndPools 会校验 出货率 引用的装备 ID 是否存在于 start2.equipList——
    // start2.initializeData 在这里被 mock 掉，不会真的跑，equipList 得手动补上。
    start2.equipList[1] = { id: 1, types: [0, 0, 0, 0] } as never

    const store = useDevelopmentStore()
    const [r1, r2] = await Promise.all([store.initializeData(), store.initializeData()])

    expect(ctypeCalls).toBe(1)
    expect(poolCalls).toBe(1)
    expect(start2Spy).toHaveBeenCalledTimes(1)
    expect(r1).toEqual({ success: true, error: null })
    expect(r2).toEqual({ success: true, error: null })
  })

  it('成功后再次调用不会重建 filterButtonList：用户已做的装备选择不受影响', async () => {
    stubFetch(async (url: string) => {
        if (url.includes('ctype')) return { json: async () => ({ '1': 'x' }) }
        if (url.includes('DevelopmentPool'))
          return {
            json: async () => [{ 开发池名称: 'x', 开发池ID: 1, 舰ID: [], 出货率: { '10': 5 } }],
          }
        return { json: async () => ({}) }
    })
    const start2 = useStart2Store()
    vi.spyOn(start2, 'initializeData').mockResolvedValue({ success: true, error: null })
    start2.equipList[10] = { id: 10, types: [0, 0, 0, 0] } as never

    const store = useDevelopmentStore()
    await store.initializeData()
    expect(store.filterButtonList[10]).toBeDefined()

    store.toggleEquipmentSelect(10)
    expect(store.filterButtonList[10].select).toBe(true)

    // 模拟 DataInitializer.vue / DevelopmentView.vue 各自的 onMounted 都调用了
    // initializeData()——这里用第一次已经 resolve 之后再调一次来代表"第二个
    // 挂载点的调用"。没有进行中缓存的话，这一次会重新跑 initFilterButtonList()，
    // 整体替换 filterButtonList，把上面刚做的选择清空。
    await store.initializeData()
    expect(store.filterButtonList[10].select).toBe(true)
  })

  it('start2 解析失败时返回 success:false，而不是继续用空表展开开发池', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(async (url: string) => {
        // start2.json 返回 {}（缺 api_mst_ship 等字段），触发真实（未 mock）的
        // start2Store 解析失败路径。ctype/DevelopmentPool 这里返回的值本身在
        // 新 schema 下也不合法（空对象/空数组），但这不影响本测试要验证的东西：
        // _initializeData 会先 `await start2Store.initializeData()`，start2
        // 解析失败在这一步就已经 reject，函数直接抛出，ctype/DevelopmentPool
        // 根本不会被 fetch 到——所以 success:false 仍然只可能来自 start2
        // 解析失败这一条路径，不是巧合于其它端点也返回了不合法数据。
        if (url.includes('ctype')) return { json: async () => ({}), text: async () => '{}' }
        if (url.includes('DevelopmentPool'))
          return { json: async () => [], text: async () => '[]' }
        return { json: async () => ({}), text: async () => '[]' }
    })
    const store = useDevelopmentStore()
    const result = await store.initializeData()
    expect(result.success).toBe(false)
  })

  it('失败后再次调用会重新尝试，而不是返回缓存的失败结果', async () => {
    const start2 = useStart2Store()
    vi.spyOn(start2, 'initializeData').mockResolvedValue({ success: true, error: null })
    start2.equipList[1] = { id: 1, types: [0, 0, 0, 0] } as never

    let poolCalls = 0
    stubFetch(async (url: string) => {
        if (url.includes('ctype')) return { json: async () => ({ '1': 'x' }) }
        if (url.includes('DevelopmentPool')) {
          poolCalls++
          if (poolCalls === 1) throw new Error('network down')
          return { json: async () => [{ 开发池名称: 'A', 开发池ID: 1, 舰ID: [], 出货率: { '1': 5 } }] }
        }
        return { json: async () => ({}) }
    })
    const store = useDevelopmentStore()

    const r1 = await store.initializeData()
    expect(r1.success).toBe(false)
    expect(poolCalls).toBe(1)

    // 如果失败没有清空 inflight，这里会拿到同一个已 reject 的缓存 promise：
    // success 依旧是 false，且 poolCalls 不会增长到 2（没有发生新的 fetch）。
    const r2 = await store.initializeData()
    expect(r2.success).toBe(true)
    expect(poolCalls).toBe(2)
  })
})

// G4：readDevelopmentPools 之前是先把 createPools() 出来、还没 init() 的池
// 数组整体发布到 developmentPools.value，再在循环里逐个 init()——如果处理到
// 中间某个池时 init() 抛错，developmentPools.value 已经是"一部分池 init 完、
// 一部分没 init"的半成品，且这个半成品状态不会因为本次调用最终返回
// success:false 而回滚，会一直留在 store 里。
describe('G4: readDevelopmentPools 原子发布，不在中途失败时留下部分状态', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('第一个池 init 成功、第二个池 init 抛错：developmentPools 与 existPool 都必须保持调用前的状态，不能是半成品', async () => {
    const start2 = useStart2Store()
    vi.spyOn(start2, 'initializeData').mockResolvedValue({ success: true, error: null })
    start2.isReady = true
    start2.equipList[1] = { id: 1, types: [0, 0, 0, 0] } as never

    stubFetch(async (url: string) => {
        if (url.includes('ctype')) return { json: async () => ({ '1': 'x' }) }
        if (url.includes('DevelopmentPool'))
          return {
            json: async () => [
              { 开发池名称: 'A', 开发池ID: 1, 舰ID: [], 出货率: { '1': 5 } },
              { 开发池名称: 'B', 开发池ID: 1, 舰ID: [], 出货率: { '1': 5 } },
            ],
          }
        return { json: async () => ({}) }
    })

    const store = useDevelopmentStore()
    // 调用前的引用，用来确认调用失败后没有被替换成任何中间状态。
    const poolsBefore = store.developmentPools
    const existPoolBefore = store.existPool
    expect(poolsBefore).toEqual([])
    expect(existPoolBefore).toEqual([])

    let initCalls = 0
    vi.spyOn(DevelopmentPoolClass.prototype, 'init').mockImplementation(() => {
      initCalls++
      if (initCalls === 2) throw new Error('模拟第二个池 init 失败')
    })

    const result = await store.initializeData()

    expect(result.success).toBe(false)
    expect(initCalls).toBe(2) // 确认第一个池确实先成功处理过，第二个才失败——这是"部分成功"场景
    // 关键断言：即便第一个池已经 init 成功，只要第二个抛错，developmentPools/
    // existPool 都必须还是调用前的那个引用——不允许出现"第一个池已生效、
    // 第二个没生效"的半成品状态被发布出去。
    expect(store.developmentPools).toBe(poolsBefore)
    expect(store.existPool).toBe(existPoolBefore)
  })

  it('两个池的 init 全部成功：developmentPools 与 existPool 才会被替换成新内容', async () => {
    const start2 = useStart2Store()
    vi.spyOn(start2, 'initializeData').mockResolvedValue({ success: true, error: null })
    start2.isReady = true
    start2.equipList[1] = { id: 1, types: [0, 0, 0, 0] } as never

    stubFetch(async (url: string) => {
        if (url.includes('ctype')) return { json: async () => ({ '1': 'x' }) }
        if (url.includes('DevelopmentPool'))
          return {
            json: async () => [
              { 开发池名称: 'A', 开发池ID: 1, 舰ID: [], 出货率: { '1': 5 } },
              { 开发池名称: 'B', 开发池ID: 1, 舰ID: [], 出货率: { '1': 5 } },
            ],
          }
        return { json: async () => ({}) }
    })

    const store = useDevelopmentStore()
    const result = await store.initializeData()

    expect(result.success).toBe(true)
    expect(store.developmentPools.map((p) => p.开发池名称)).toEqual(['A', 'B'])
    expect(store.existPool).toEqual(['A', 'B'])
  })
})

// P1-3：developmentStore 接入 dataSchema.js 对 ctype/DevelopmentPool 的结构
// 校验。dataSchema.spec.ts 已经对校验器本身做了穷举式覆盖，这里做集成层面
// 的断言：确认 store 真的接了这套校验、且 ctype 与 DevelopmentPool 的发布
// 是原子的一整块（要么一起更新，要么都不动）。
describe('P1-3: developmentStore 的 schema 校验与原子发布集成', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function stubStart2Ready() {
    const start2 = useStart2Store()
    vi.spyOn(start2, 'initializeData').mockResolvedValue({ success: true, error: null })
    start2.isReady = true
    return start2
  }

  it('DevelopmentPool=[]（空数组）：初始化失败，不会把空池表当成加载成功', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubStart2Ready()
    stubFetch(async (url: string) => {
        if (url.includes('ctype')) return { json: async () => ({ '1': 'x' }) }
        if (url.includes('DevelopmentPool')) return { json: async () => [] }
        return { json: async () => ({}) }
    })
    const store = useDevelopmentStore()
    const result = await store.initializeData()
    expect(result.success).toBe(false)
    expect(store.developmentPools).toEqual([])
    expect(store.existPool).toEqual([])
  })

  it('DevelopmentPool=[{}]（字段全空的畸形记录）：初始化失败，不产出空名称/ID 0 的池，existPool 里不出现空字符串', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubStart2Ready()
    stubFetch(async (url: string) => {
        if (url.includes('ctype')) return { json: async () => ({ '1': 'x' }) }
        if (url.includes('DevelopmentPool')) return { json: async () => [{}] }
        return { json: async () => ({}) }
    })
    const store = useDevelopmentStore()
    const result = await store.initializeData()
    expect(result.success).toBe(false)
    // 旧代码会在这种输入下产出 开发池名称='' 、开发池ID=0 的池，且
    // existPool 里出现空字符串——新代码校验失败，developmentPools/existPool
    // 完全不会被写入任何内容。
    expect(store.developmentPools).toEqual([])
    expect(store.existPool).toEqual([])
    expect(store.existPool).not.toContain('')
  })

  it('ctype.json 为空对象：初始化失败', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubStart2Ready()
    stubFetch(async (url: string) => {
        if (url.includes('ctype')) return { json: async () => ({}) }
        if (url.includes('DevelopmentPool'))
          return { json: async () => [{ 开发池名称: 'A', 开发池ID: 1, 舰ID: [], 出货率: { '1': 5 } }] }
        return { json: async () => ({}) }
    })
    const store = useDevelopmentStore()
    const result = await store.initializeData()
    expect(result.success).toBe(false)
  })

  it('出货率 引用的装备 ID 不存在于 start2：初始化失败', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const start2 = stubStart2Ready()
    start2.equipList[1] = { id: 1, types: [0, 0, 0, 0] } as never
    stubFetch(async (url: string) => {
        if (url.includes('ctype')) return { json: async () => ({ '1': 'x' }) }
        if (url.includes('DevelopmentPool'))
          // 999999 不存在于 start2.equipList（只有 1 号装备）
          return { json: async () => [{ 开发池名称: 'A', 开发池ID: 1, 舰ID: [], 出货率: { '999999': 5 } }] }
        return { json: async () => ({}) }
    })
    const store = useDevelopmentStore()
    const result = await store.initializeData()
    expect(result.success).toBe(false)
  })

  it('ctype 与 DevelopmentPool 的发布是原子的一整块：pool 校验失败时，即便这次的 ctype 本身合法，也不会单独发布，ctypeMap 保持调用前的内容', async () => {
    // 不通过 initializeData() 制造"先成功一次"的前置状态——initializeData()
    // 成功一次后会把结果永久缓存在 inflight 里，同一个 store 实例上第二次调用
    // 根本不会重新执行 _initializeData()，测不出这里要验证的东西（这与
    // start2Store 的 P2-2 是同一类问题：公开的缓存化入口天然不适合用来测试
    // "重新加载时的部分失败"）。这里改用直接给 ctypeMap 预置一个"已经成功过"
    // 的哨兵值来模拟前置状态，再触发一次会失败的加载。
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const start2 = stubStart2Ready()
    start2.equipList[1] = { id: 1, types: [0, 0, 0, 0] } as never

    stubFetch(async (url: string) => {
        // ctype 本身完全合法。
        if (url.includes('ctype')) return { json: async () => ({ '1': '合法的新值' }) }
        // 但 DevelopmentPool 是空数组，校验失败。
        if (url.includes('DevelopmentPool')) return { json: async () => [] }
        return { json: async () => ({}) }
    })
    const store = useDevelopmentStore()
    store.ctypeMap = { '1': '之前已经成功过的哨兵值' }
    const ctypeMapRefBefore = store.ctypeMap

    const result = await store.initializeData()

    expect(result.success).toBe(false)
    // 关键断言：即便这次的 ctype 本身合法（能通过 validateCtypeMap），只要
    // 紧随其后的 pool 校验失败，ctypeMap 也不能被单独提前发布——如果 ctype
    // 与 pool 是分开发布的，这里会看到 ctypeMap 已经变成"合法的新值"、但
    // developmentPools 还是空的，一份新一份旧的不一致组合。原子发布下，
    // ctypeMap 必须保持调用前的哨兵值和引用都不变。
    expect(store.ctypeMap).toBe(ctypeMapRefBefore)
    expect(store.ctypeMap).toEqual({ '1': '之前已经成功过的哨兵值' })
    expect(store.developmentPools).toEqual([])
  })
})

describe('setFlagship 取最窄池', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('同时命中多个池时返回舰ID最少的那个', () => {
    const start2 = useStart2Store()
    start2.shipList[1] = { id: 1, name: 'A', stype: 9, ctype: 1 } as never
    const s = useDevelopmentStore()
    s.developmentPools = createPools([
      { 开发池名称: '宽', 开发池ID: 1, 舰ID: [1, 2, 3], 出货率: {} },
      { 开发池名称: '窄', 开发池ID: 1, 舰ID: [1], 出货率: {} },
    ])
    expect(s.setFlagship(1)?.pool.开发池名称).toBe('窄')
  })

  it('只在正 ID 池里找，负 ID 池不参与', () => {
    const start2 = useStart2Store()
    start2.shipList[1] = { id: 1, name: 'A', stype: 9, ctype: 1 } as never
    const s = useDevelopmentStore()
    s.developmentPools = createPools([
      { 开发池名称: '正', 开发池ID: 1, 舰ID: [1, 2], 出货率: {} },
      { 开发池名称: '负', 开发池ID: -1, 舰ID: [1], 出货率: {} },
    ])
    // 负池的 舰ID 更少，但不该被选中
    expect(s.setFlagship(1)?.pool.开发池名称).toBe('正')
  })

  it('没有任何池包含该舰时返回 null', () => {
    const start2 = useStart2Store()
    start2.shipList[1] = { id: 1, name: 'A', stype: 9, ctype: 1 } as never
    const s = useDevelopmentStore()
    s.developmentPools = createPools([
      { 开发池名称: '别的', 开发池ID: 1, 舰ID: [2, 3], 出货率: {} },
    ])
    expect(s.setFlagship(1)).toBeNull()
  })
})

// P2-1：ctype.json / DevelopmentPool.json 这两个端点此前也没有检查
// response.ok。HTTP 500 若恰好返回结构合法的 JSON，会被当成正常数据继续走。
describe('P2-1: HTTP 状态码检查', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('ctype.json 返回 HTTP 500，即便响应体是结构合法的 JSON，也必须拒绝', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const start2 = useStart2Store()
    vi.spyOn(start2, 'initializeData').mockResolvedValue({ success: true, error: null })
    start2.isReady = true
    start2.equipList[1] = { id: 1, types: [0, 0, 0, 0] } as never

    stubFetch(async (url: string) => {
      if (url.includes('ctype')) {
        // 响应体本身是合法的 ctype 映射——如果不检查状态码，这次加载会被
        // 当成成功。
        return { ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({ '1': 'x' }) }
      }
      if (url.includes('DevelopmentPool'))
        return { json: async () => [{ 开发池名称: 'A', 开发池ID: 1, 舰ID: [], 出货率: { '1': 5 } }] }
      return { json: async () => ({}) }
    })
    const store = useDevelopmentStore()
    const result = await store.initializeData()
    expect(result.success).toBe(false)
    expect(store.ctypeMap).toEqual({})
  })

  it('DevelopmentPool.json 返回 HTTP 500，即便响应体是结构合法的 JSON，也必须拒绝，且 ctype 不会被单独发布', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const start2 = useStart2Store()
    vi.spyOn(start2, 'initializeData').mockResolvedValue({ success: true, error: null })
    start2.isReady = true
    start2.equipList[1] = { id: 1, types: [0, 0, 0, 0] } as never

    stubFetch(async (url: string) => {
      if (url.includes('ctype')) return { json: async () => ({ '1': 'x' }) }
      if (url.includes('DevelopmentPool')) {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => [{ 开发池名称: 'A', 开发池ID: 1, 舰ID: [], 出货率: { '1': 5 } }],
        }
      }
      return { json: async () => ({}) }
    })
    const store = useDevelopmentStore()
    const result = await store.initializeData()
    expect(result.success).toBe(false)
    expect(store.ctypeMap).toEqual({})
    expect(store.developmentPools).toEqual([])
  })
})
