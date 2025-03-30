import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DevelopmentPool, DevelopResult } from '@/types/developTypes'
import { DevelopmentPoolClass, DevelopResultClass } from '@/types/developTypes'
import { useStart2Store } from './start2Store'

// 定义FilterButtonState接口
interface FilterButtonState {
  equipInfo: any; // 装备信息
  select: boolean; // 是否选中
}

export const useDevelopmentStore = defineStore('development', () => {
  // 获取start2Store
  const start2Store = useStart2Store()
  
  // 数据存储
  const developmentPools = ref<DevelopmentPool[]>([])
  const developmentResults = ref<DevelopResult[]>([])
  const ctypeMap = ref<Record<number, string>>({})
  const existPool = ref<string[]>([]) // 存储已存在的开发池名称，避免重复
  const filterButtonList = ref<Record<string, FilterButtonState>>({}) // 装备选择状态
  
  // 读取开发池数据
  const readDevelopmentPools = async () => {
    try {
      // 从data目录获取DevelopmentPool.json
      const response = await fetch(`${import.meta.env.BASE_URL}data/DevelopmentPool.json`)
      const json = await response.json()
      
      // 清空现有数据
      developmentPools.value = []
      existPool.value = []
      
      // 处理开发池数据
      for (const item of json) {
        const pool = new DevelopmentPoolClass()
        pool.开发池名称 = item.开发池名称
        pool.开发池ID = item.开发池ID
        pool.舰种 = item.舰种
        pool.舰型 = item.舰型
        pool.舰名 = item.舰名
        pool.舰ID = item.舰ID
        pool.不包含舰ID = item.不包含舰ID
        pool.最低资源 = item.最低资源
        pool.出货率 = item.出货率
        
        developmentPools.value.push(pool)
        
        // 记录已存在的开发池名称（排除ID<0和有最低资源要求的）
        if (!existPool.value.includes(pool.开发池名称) && 
            pool.开发池ID >= 0 && 
            !pool.最低资源) {
          existPool.value.push(pool.开发池名称)
        }
      }
      
      console.log(`加载了 ${developmentPools.value.length} 条开发池数据`)
      
      // 初始化开发池
      initDevelopmentPools()
    } catch (error) {
      console.error('读取开发池数据失败:', error)
    }
  }
  
  // 读取ctype数据
  const readCtypeData = async () => {
    try {
      // 从data目录获取ctype.json
      const response = await fetch(`${import.meta.env.BASE_URL}data/ctype.json`)
      const json = await response.json()
      
      // 保存ctype映射
      ctypeMap.value = json
      
      console.log('加载了舰船类型数据')
    } catch (error) {
      console.error('读取舰船类型数据失败:', error)
    }
  }
  
  // 初始化开发池
  const initDevelopmentPools = () => {
    for (const pool of developmentPools.value) {
      if (pool instanceof DevelopmentPoolClass) {
        pool.init(ctypeMap.value, start2Store.getIDs, start2Store.shipList)
      }
    }
    
    console.log('开发池初始化完成')
  }
  
  // 初始化装备选择状态
  const initFilterButtonList = () => {
    filterButtonList.value = {}
    
    // 收集所有装备
    const equipSet = new Set<number>()
    
    for (const pool of developmentPools.value) {
      if (pool.出货率) {
        for (const equipId of Object.keys(pool.出货率)) {
          equipSet.add(Number(equipId))
        }
      }
    }
    
    // 排序装备ID
    const sortedEquipIds = Array.from(equipSet).sort((a, b) => {
      const equipA = start2Store.equipList[a]
      const equipB = start2Store.equipList[b]
      
      if (!equipA || !equipB) return 0
      
      if (equipA.types[2] !== equipB.types[2]) {
        return equipA.types[2] - equipB.types[2]
      }
      
      if (equipA.types[3] !== equipB.types[3]) {
        return equipA.types[3] - equipB.types[3]
      }
      
      return a - b
    })
    
    // 创建按钮状态
    for (const equipId of sortedEquipIds) {
      if (start2Store.equipList[equipId]) {
        filterButtonList.value[equipId] = {
          equipInfo: start2Store.equipList[equipId],
          select: false
        }
      }
    }
    
    console.log('初始化了 ' + Object.keys(filterButtonList.value).length + ' 个装备选择状态')
  }
  
  // 切换装备选择状态
  const toggleEquipmentSelect = (equipId: number) => {
    if (filterButtonList.value[equipId]) {
      filterButtonList.value[equipId].select = !filterButtonList.value[equipId].select
    }
  }
  
  // 获取当前选中的装备ID
  const getSelectedEquipIds = (): number[] => {
    return Object.entries(filterButtonList.value)
      .filter(([_, state]) => state.select)
      .map(([id, _]) => Number(id))
  }
  
  // 获取单个开发结果
  const getResult = (poolname: string, poolid: number, formula: number[], 
                     allDropRates: Record<string, number>, targetEquips: number[]): DevelopResult => {
    let targetRate = 0
    let otherRate = 0
    
    for (const [equipIdStr, rate] of Object.entries(allDropRates)) {
      const equipId = Number(equipIdStr)
      
      if (targetEquips.includes(equipId)) {
        targetRate += rate
        continue
      }
      
      // 检查是否满足资源条件
      const equip = start2Store.equipList[equipId]
      if (equip && 
          formula[0] >= equip.broken[0] * 10 && 
          formula[1] >= equip.broken[1] * 10 && 
          formula[2] >= equip.broken[2] * 10 && 
          formula[3] >= equip.broken[3] * 10) {
        otherRate += rate
      }
    }
    
    const failRate = 100 - targetRate - otherRate
    const totalResource = formula.reduce((sum, val) => sum + val, 0)
    
    const result = new DevelopResultClass()
    result.池名 = poolname
    result.池ID = poolid
    result.公式 = [...formula]
    result.总资源 = totalResource
    result.出货率 = targetRate
    result.失败率 = failRate
    
    return result
  }
  
  // 获取开发结果方法
  const calculateDevelopmentResults = (resources: number[]) => {
    // 计算总资源
    const totalResource = resources.reduce((sum, value) => sum + value, 0)
    
    // 清空现有结果
    developmentResults.value = []
    
    // 获取目标装备
    const targetEquips: number[] = getSelectedEquipIds()
    const hasRadar168 = targetEquips.includes(168) // 九六式陸攻
    
    // 跟踪可能装备的ID集合
    const possibleEquips: number[] = []
    const results: DevelopResult[] = []
    
    // 遍历每个池类型的开发池
    for (const poolname of existPool.value) {
      for (let i = 1; i <= 3; i++) {
        // 找到该名称和ID的池
        const pool = developmentPools.value.find(p => 
          p.开发池名称 === poolname && p.开发池ID === i
        ) as DevelopmentPoolClass
        
        if (pool) {
          // 找到所有与此池兼容的开发池
          const compatiblePools = developmentPools.value.filter(p => 
            Math.abs(p.开发池ID) === i && 
            p.舰ID && pool.舰ID && 
            p.舰ID.every(id => pool.舰ID?.includes(id))
          )
          
          // 合并所有兼容池的出货率
          const allDropRates: Record<string, number> = {}
          
          for (const compatPool of compatiblePools) {
            if (hasRadar168 || compatPool.开发池ID > 0) {
              // 处理正面池或有九六式陸攻时的所有池
              if (compatPool.出货率) {
                for (const [equipId, rate] of Object.entries(compatPool.出货率)) {
                  if (allDropRates[equipId]) {
                    allDropRates[equipId] += rate
                  } else {
                    allDropRates[equipId] = rate
                  }
                }
              }
            } else {
              if (compatPool.出货率) {
                for (const equipId of Object.keys(compatPool.出货率)) {
                  if (!allDropRates[equipId]) {
                    allDropRates[equipId] = 0
                  }
                }
              }
            }
          }
          
          // 检查是否包含所有目标装备
          const containsAllTargets = targetEquips.length === 0 || 
            targetEquips.every(id => Object.keys(allDropRates).map(Number).includes(id))
          
          if (containsAllTargets) {
            // 更新可能装备列表
            for (const equipId of Object.keys(allDropRates)) {
              if (!possibleEquips.includes(Number(equipId))) {
                possibleEquips.push(Number(equipId))
              }
            }
            
            // 根据资源池类型，生成符合要求的公式
            let formulaList: number[][] = []
            
            if (i === 1) { // 铝资源池
              const formula = [10, 10, 10, 10]
              
              // 计算需要的最低资源
              for (const equipIdStr of Object.keys(allDropRates)) {
                if (targetEquips.includes(Number(equipIdStr))) {
                  const equip = start2Store.equipList[Number(equipIdStr)]
                  if (equip) {
                    for (let j = 0; j < 4; j++) {
                      formula[j] = Math.max(formula[j], equip.broken[j] * 10)
                    }
                  }
                }
              }
              
              // 铝资源池：铝必须最高
              if (formula[3] <= formula[0]) {
                formula[3] = formula[0] + 1
              }
              if (formula[3] <= formula[1]) {
                formula[3] = formula[1] + 1
              }
              if (formula[3] <= formula[2]) {
                formula[3] = formula[2] + 1
              }
              
              // 九六式陸攻专用公式
              if (hasRadar168) {
                formula[0] = 240
                formula[1] = 260
                formula[3] = 250
              }
              
              formulaList.push(formula)
            } else if (i === 2) { // 弹资源池
              const formula = [10, 10, 10, 10]
              
              // 计算需要的最低资源
              for (const equipIdStr of Object.keys(allDropRates)) {
                if (targetEquips.includes(Number(equipIdStr))) {
                  const equip = start2Store.equipList[Number(equipIdStr)]
                  if (equip) {
                    for (let j = 0; j < 4; j++) {
                      formula[j] = Math.max(formula[j], equip.broken[j] * 10)
                    }
                  }
                }
              }
              
              // 弹资源池：弹必须最高
              if (formula[1] <= formula[0]) {
                formula[1] = formula[0] + 1
              }
              if (formula[1] <= formula[2]) {
                formula[1] = formula[2] + 1
              }
              if (formula[1] < formula[3]) {
                formula[1] = formula[3]
              }
              
              formulaList.push(formula)
            } else if (i === 3) { // 油钢资源池
              const formula1 = [10, 10, 10, 10]
              const formula2 = [10, 10, 10, 10]
              
              // 计算需要的最低资源
              for (const equipIdStr of Object.keys(allDropRates)) {
                if (targetEquips.includes(Number(equipIdStr))) {
                  const equip = start2Store.equipList[Number(equipIdStr)]
                  if (equip) {
                    for (let j = 0; j < 4; j++) {
                      formula1[j] = Math.max(formula1[j], equip.broken[j] * 10)
                      formula2[j] = Math.max(formula2[j], equip.broken[j] * 10)
                    }
                  }
                }
              }
              
              // 检查是否需要修正公式
              const needsFix = (
                formula1[0] < formula1[1] && formula1[0] < formula1[3]
              ) && (
                formula1[2] < formula1[1] && formula1[2] < formula1[3]
              )
              
              if (needsFix) {
                // 第一种方案：油最高
                if (formula1[0] < formula1[1]) {
                  formula1[0] = formula1[1]
                }
                if (formula1[0] < formula1[3]) {
                  formula1[0] = formula1[3]
                }
                
                // 第二种方案：钢最高
                if (formula2[2] < formula2[1]) {
                  formula2[2] = formula2[1]
                }
                if (formula2[2] < formula2[3]) {
                  formula2[2] = formula2[3]
                }
                
                formulaList.push(formula1, formula2)
              } else {
                formulaList.push(formula1)
              }
            }
            
            // 为每个公式生成结果
            for (const formula of formulaList) {
              results.push(getResult(
                poolname, 
                i, 
                formula, 
                allDropRates, 
                targetEquips
              ))
            }
          }
        }
      }
    }
    
    // 排序结果：先按出货率降序，如果出货率相同则按总资源升序，如果总资源也差不多则按失败率降序
    results.sort((a, b) => {
      if (a.出货率 !== b.出货率) {
        return b.出货率 - a.出货率
      }
      if (Math.abs(a.总资源 - b.总资源) > 1) {
        return a.总资源 - b.总资源
      }
      return b.失败率 - a.失败率
    })
    
    // 更新结果列表
    developmentResults.value = results
    
    return developmentResults.value
  }
  
  // 更新可选装备状态
  const updateAvailableEquipments = (targetEquipIds: number[] = []) => {
    if (targetEquipIds.length === 0) {
      // 如果没有选中的装备，所有装备都可用
      for (const key in filterButtonList.value) {
        filterButtonList.value[key].select = false
      }
      return
    }
    
    // 收集可能的装备ID
    const possibleEquips: number[] = []
    
    // 查找包含所有目标装备的池
    for (const poolname of existPool.value) {
      for (let i = 1; i <= 3; i++) {
        for (const pool of developmentPools.value) {
          if (pool.开发池名称 === poolname && Math.abs(pool.开发池ID) === i && pool.出货率) {
            const equipIds = Object.keys(pool.出货率).map(Number)
            if (targetEquipIds.every(id => equipIds.includes(id))) {
              // 将此池的所有装备加入可能列表
              for (const id of equipIds) {
                if (!possibleEquips.includes(id)) {
                  possibleEquips.push(id)
                }
              }
            }
          }
        }
      }
    }
    
    // 更新按钮状态
    for (const key in filterButtonList.value) {
      const equipId = Number(key)
      if (!targetEquipIds.includes(equipId)) {
        // 非目标装备，根据是否在可能列表中决定是否启用
        filterButtonList.value[key].select = false
      }
    }
    
    return possibleEquips
  }
  
  // 设置旗舰舰船
  const setFlagship = (shipId: number) => {
    // 查找包含此舰船的开发池
    const pools = developmentPools.value.filter(p => 
      p.开发池ID > 0 && p.舰ID && p.舰ID.includes(shipId)
    )
    
    if (pools.length > 0 && start2Store.shipList[shipId]) {
      // 找到舰ID最少的池（最具体的池）
      const flagshipPool = pools.reduce((min, current) => 
        (current.舰ID && min.舰ID && current.舰ID.length >= min.舰ID.length) ? min : current
      )
      
      return {
        pool: flagshipPool,
        shipInfo: start2Store.shipList[shipId]
      }
    }
    
    return null
  }
  
  // 初始化方法
  const initializeData = async () => {
    let success = true
    let error = null
    
    try {
      // 第一步：加载ctype数据
      await readCtypeData()
      console.log('舰船类型数据加载成功')
    } catch (err) {
      success = false
      error = err
      console.error('舰船类型数据加载失败:', err)
    }
    
    try {
      // 第二步：加载开发池数据
      await readDevelopmentPools()
      console.log('开发池数据加载成功')
      
      // 第三步：初始化装备选择状态
      initFilterButtonList()
    } catch (err) {
      success = false
      error = err
      console.error('开发池数据加载失败:', err)
    }
    
    return { success, error }
  }
  
  return {
    developmentPools,
    developmentResults,
    ctypeMap,
    existPool,
    filterButtonList,
    initializeData,
    readDevelopmentPools,
    readCtypeData,
    initDevelopmentPools,
    initFilterButtonList,
    calculateDevelopmentResults,
    getResult,
    toggleEquipmentSelect,
    getSelectedEquipIds,
    updateAvailableEquipments,
    setFlagship
  }
}) 