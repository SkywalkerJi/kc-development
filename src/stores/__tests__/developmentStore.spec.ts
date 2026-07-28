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

  it('shipList 为空时先初始化 start2', async () => {
    const start2 = useStart2Store()
    const spy = vi
      .spyOn(start2, 'initializeData')
      .mockResolvedValue({ success: true, error: null })
    await useDevelopmentStore().initializeData()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('shipList 已就绪时跳过，不重复加载', async () => {
    const start2 = useStart2Store()
    start2.shipList[1] = { id: 1, name: 'A', stype: 9, ctype: 1 } as never
    const spy = vi.spyOn(start2, 'initializeData')
    await useDevelopmentStore().initializeData()
    expect(spy).not.toHaveBeenCalled()
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
