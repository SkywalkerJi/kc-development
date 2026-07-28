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
  function setFlagship(shipId: number) {
    const candidates = developmentPools.value.filter(
      (p) => p.开发池ID > 0 && p.舰ID.includes(shipId),
    )
    if (!candidates.length || !start2Store.shipList[shipId]) return null
    const pool = candidates.reduce((min, cur) => (cur.舰ID.length >= min.舰ID.length ? min : cur))
    return { pool, shipInfo: start2Store.shipList[shipId] }
  }

  async function initializeData() {
    try {
      // 必须先确保 start2 就绪：pool.init() 要用 shipList 把筛选条件展开成 舰ID，
      // 拿到空表就会展不开，导致后续所有出货率计算失效。
      // 这个守卫修掉了一个既有竞态 —— App.vue 同时挂载 DataInitializer 与本视图，
      // 两者的 onMounted 都是 async 且并发，而本视图只加载 18KB、DataInitializer 要加载
      // 1.9MB 的 start2，本视图几乎必然先跑完并用空表初始化开发池。
      // 判空即跳过，重复调用是安全的。
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
