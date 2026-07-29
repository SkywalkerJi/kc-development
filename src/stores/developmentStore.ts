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

    // 先在局部变量里把所有池跑完 init()，全部成功后才一次性发布到
    // developmentPools/existPool 这两个响应式状态。不能像之前那样先把
    // developmentPools.value 赋成刚 createPools() 出来、还没 init() 的池数组
    // 再在循环里逐个 init()——如果某一个 pool.init() 抛错（比如 shipList 里
    // 某条记录字段缺失），developmentPools.value 已经被替换成了"一部分池
    // init 完、一部分还没 init"的半成品状态，且这个状态不会随本次调用失败
    // 而回滚，会一直留在 store 里，后续任何读它的地方都可能读到不一致的池。
    // 局部变量在这里只是普通对象，函数中途抛错时局部变量直接被丢弃，
    // developmentPools.value 依然是上一次成功时的值（或初始的空数组），
    // 不会被污染。
    const pools = createPools(raw)
    const nextExistPool: string[] = []

    for (const pool of pools) {
      pool.init(ctypeMap.value, start2Store.getIDs, start2Store.shipList)
      // 下拉框准入三条件：名称未重复、非负 ID、无最低资源门槛
      if (!nextExistPool.includes(pool.开发池名称) && pool.开发池ID >= 0 && !pool.最低资源)
        nextExistPool.push(pool.开发池名称)
    }

    developmentPools.value = pools
    existPool.value = nextExistPool
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

  // 内部实现：外部一律经 initializeData 的进行中缓存调用（同 start2Store 的模式）。
  async function _initializeData() {
    // 必须先确保 start2 就绪：pool.init() 要用 shipList 把筛选条件展开成 舰ID，
    // 拿到空表就会展不开，导致后续所有出货率计算失效。这里读的是 start2Store
    // 显式维护的 isReady 标志，不能用「shipList 非空」去推断——start2Store 是
    // 边解析边把舰船写进 shipList 的，解析到一半失败（比如舰船已经写完、装备
    // 数据格式不对）时 shipList 早就非空了，但那次加载并未成功；用非空当"已就绪"
    // 会让这次失败被当成已就绪跳过，永远不会重试。
    //
    // 这里的判断只是一层快路径（已就绪时省一次函数调用），真正防止重复拉取/
    // 重复重建 filterButtonList 的是下面 initializeData 自身的进行中缓存——
    // 这个判断单独存在时管不住，因为它只覆盖 start2Store.initializeData()
    // 这一次调用，本函数自己接下来的 readCtypeData / readDevelopmentPools /
    // initFilterButtonList 完全不受它保护。
    if (!start2Store.isReady) {
      await start2Store.initializeData()
    }
    await readCtypeData()
    await readDevelopmentPools()
    initFilterButtonList()
  }

  // 进行中去重：App.vue 同时挂载 DataInitializer 与 DevelopmentView，两者的
  // onMounted 都并发调用 developmentStore.initializeData()。没有这层缓存的话，
  // 两次调用各自完整跑一遍 _initializeData()——两次 ctype 请求、两次
  // DevelopmentPool 请求，initFilterButtonList() 跑两遍，第二遍会整体替换
  // filterButtonList，静默清空用户刚做的装备选择。
  //
  // 缓存语义：并发调用、以及成功后的重复调用，只会真正执行 _initializeData()
  // 一次（inflight 常驻）。只有失败会清空 inflight——此时下一次调用会重新跑
  // 完整的一遍（含重建 filterButtonList），这是预期的重试行为，不是 bug。
  let inflight: ReturnType<typeof _initializeData> | null = null

  async function initializeData() {
    try {
      await (inflight ??= _initializeData().catch((e) => {
        // 失败必须清空，否则一次瞬时失败会被永久缓存成不可恢复状态。
        inflight = null
        throw e
      }))
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
