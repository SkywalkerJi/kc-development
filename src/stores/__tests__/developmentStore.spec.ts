import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDevelopmentStore } from '@/stores/developmentStore'
import { useStart2Store } from '@/stores/start2Store'
import { createPools } from '@/core/developmentPool'

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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        json: async () => (url.includes('ctype') ? {} : []),
      })),
    )
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('ctype')) {
          ctypeCalls++
          return { json: async () => ({}) }
        }
        if (url.includes('DevelopmentPool')) {
          poolCalls++
          return { json: async () => [] }
        }
        return { json: async () => ({}) }
      }),
    )
    const start2 = useStart2Store()
    const start2Spy = vi
      .spyOn(start2, 'initializeData')
      .mockResolvedValue({ success: true, error: null })

    const store = useDevelopmentStore()
    const [r1, r2] = await Promise.all([store.initializeData(), store.initializeData()])

    expect(ctypeCalls).toBe(1)
    expect(poolCalls).toBe(1)
    expect(start2Spy).toHaveBeenCalledTimes(1)
    expect(r1).toEqual({ success: true, error: null })
    expect(r2).toEqual({ success: true, error: null })
  })

  it('成功后再次调用不会重建 filterButtonList：用户已做的装备选择不受影响', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('ctype')) return { json: async () => ({}) }
        if (url.includes('DevelopmentPool'))
          return {
            json: async () => [{ 开发池名称: 'x', 开发池ID: 1, 舰ID: [], 出货率: { '10': 5 } }],
          }
        return { json: async () => ({}) }
      }),
    )
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        // start2.json 返回 {}（缺 api_mst_ship 等字段），触发真实（未 mock）的
        // start2Store 解析失败路径；ctype/DevelopmentPool 仍返回合法的空结构，
        // 确保 success:false 只可能来自 start2 解析失败这一条路径，而不是
        // 其它端点顺带返回了不合法数据导致的巧合失败。
        if (url.includes('ctype')) return { json: async () => ({}), text: async () => '{}' }
        if (url.includes('DevelopmentPool'))
          return { json: async () => [], text: async () => '[]' }
        return { json: async () => ({}), text: async () => '[]' }
      }),
    )
    const store = useDevelopmentStore()
    const result = await store.initializeData()
    expect(result.success).toBe(false)
  })

  it('失败后再次调用会重新尝试，而不是返回缓存的失败结果', async () => {
    const start2 = useStart2Store()
    vi.spyOn(start2, 'initializeData').mockResolvedValue({ success: true, error: null })

    let poolCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('ctype')) return { json: async () => ({}) }
        if (url.includes('DevelopmentPool')) {
          poolCalls++
          if (poolCalls === 1) throw new Error('network down')
          return { json: async () => [] }
        }
        return { json: async () => ({}) }
      }),
    )
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
