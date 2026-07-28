import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDevelopmentStore } from '@/stores/developmentStore'

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
