import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Api_EquipInfo } from '@/types/equipTypes'
import type { DevelopmentPoolData } from '@/core/types'
import { DevelopmentPoolClass, createPools } from '@/core/developmentPool'
import { sortEquipIds } from '@/core/grouping'
import { useStart2Store } from './start2Store'

export interface FilterButtonState {
  equipInfo: Api_EquipInfo
  select: boolean
  /** 当前已选组合下这件装备是否还可能出。false 时按钮置灰。 */
  enabled: boolean
}

export const useDevelopmentStore = defineStore('development', () => {
  const start2Store = useStart2Store()

  const developmentPools = ref<DevelopmentPoolClass[]>([])
  const ctypeMap = ref<Record<string, string>>({})
  const existPool = ref<string[]>([])
  const filterButtonList = ref<Record<number, FilterButtonState>>({})

  async function readCtypeData() {
    const res = await fetch(`${import.meta.env.BASE_URL}data/ctype.json`)
    ctypeMap.value = await res.json()
  }

  async function readDevelopmentPools() {
    const res = await fetch(`${import.meta.env.BASE_URL}data/DevelopmentPool.json`)
    const raw: DevelopmentPoolData[] = await res.json()

    developmentPools.value = createPools(raw)
    existPool.value = []

    for (const pool of developmentPools.value) {
      pool.init(ctypeMap.value, start2Store.getIDs, start2Store.shipList)
      // 下拉框准入三条件：名称未重复、非负 ID、无最低资源门槛
      if (!existPool.value.includes(pool.开发池名称) && pool.开发池ID >= 0 && !pool.最低资源)
        existPool.value.push(pool.开发池名称)
    }
  }

  function initFilterButtonList() {
    const ids = new Set<number>()
    for (const pool of developmentPools.value)
      for (const k of Object.keys(pool.出货率 ?? {})) ids.add(Number(k))

    const known = [...ids].filter((id) => start2Store.equipList[id])
    const next: Record<number, FilterButtonState> = {}
    for (const id of sortEquipIds(known, start2Store.equipList))
      next[id] = { equipInfo: start2Store.equipList[id], select: false, enabled: true }
    filterButtonList.value = next
  }

  function toggleEquipmentSelect(equipId: number) {
    const s = filterButtonList.value[equipId]
    if (s) s.select = !s.select
  }

  function getSelectedEquipIds(): number[] {
    return Object.keys(filterButtonList.value)
      .map(Number)
      .filter((id) => filterButtonList.value[id].select)
  }

  /**
   * 由舰船反查所属开发池，取「最窄」的那个（舰ID 数量最少）。
   * 仅用于提示，不参与任何计算。
   */
  function setFlagship(shipId: number): { pool: DevelopmentPoolClass; shipInfo: unknown } | null {
    const candidates = developmentPools.value.filter(
      (p) => p.开发池ID > 0 && p.舰ID.includes(shipId),
    )
    if (!candidates.length || !start2Store.shipList[shipId]) return null
    const pool = candidates.reduce((min, cur) => (cur.舰ID.length >= min.舰ID.length ? min : cur))
    // ref<DevelopmentPoolClass[]>() 令 .value 的元素类型经 Vue 的 UnwrapRef 丢失
    // 私有字段 text，结构上不再是 DevelopmentPoolClass（同 DevelopmentView.vue 里
    // pools() 的处理）。运行时仍是 createPools() 生成的真实实例。
    return { pool: pool as unknown as DevelopmentPoolClass, shipInfo: start2Store.shipList[shipId] }
  }

  async function initializeData() {
    try {
      // 必须先确保 start2 就绪：pool.init() 要用 shipList 把筛选条件展开成 舰ID，
      // 拿到空表就会展不开，导致后续所有出货率计算失效。
      // App.vue 同时挂载 DataInitializer 与本视图，两者的 onMounted 都是 async 且
      // 并发调用 start2Store.initializeData()。真正的去重发生在 start2Store 内部
      // （进行中 Promise 缓存），这里的判空只是一层无害的快路径：已就绪时跳过一次
      // 函数调用，不判空也不会重复拉取或重复重建 filterButtonList。
      if (Object.keys(start2Store.shipList).length === 0) {
        await start2Store.initializeData()
      }
      await readCtypeData()
      await readDevelopmentPools()
      initFilterButtonList()
      return { success: true, error: null }
    } catch (error) {
      console.error('开发池数据加载失败:', error)
      return { success: false, error }
    }
  }

  return {
    developmentPools,
    ctypeMap,
    existPool,
    filterButtonList,
    initializeData,
    toggleEquipmentSelect,
    getSelectedEquipIds,
    setFlagship,
  }
})
