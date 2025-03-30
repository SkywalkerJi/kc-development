import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Api_ShipInfo, SameShip, Api_Mst_Stype, Api_Mst_Equip_Ship, Api_Mst_Equip_Exslot_Ship } from '@/types/shipTypes'
import { ShipInfo, SameShipClass } from '@/types/shipTypes'
import type { Api_EquipInfo } from '@/types/equipTypes'
import { EquipmentType3, EquipInfo } from '@/types/equipTypes'

export const useStart2Store = defineStore('start2', () => {
  // 数据存储
  const shipList = ref<Record<number, Api_ShipInfo>>({})
  const equipList = ref<Record<number, Api_EquipInfo>>({})
  const sameShipList = ref<SameShip[]>([])
  const allSameShipList = ref<Record<number, SameShip>>({})
  const api_mst_stype = ref<Api_Mst_Stype[]>([])
  const api_mst_equip_ship = ref<Api_Mst_Equip_Ship[]>([])
  const api_mst_equip_exslot_ship = ref<Record<number, Api_Mst_Equip_Exslot_Ship>>({})
  
  // 制空相关数据
  const 制空飞机 = [6, 7, 8, 11, 45, 47, 48, 56, 57, 58]
  const 陆航制空飞机 = [10]
  const 攻击机 = [7, 8, 57, 58]
  
  // 读取start2.json数据
  const readStart2 = async () => {
    try {
      // 从public/data目录中获取start2.json
      const response = await fetch('/data/start2.json')
      const json = await response.json()
      
      // 清空现有数据
      shipList.value = {}
      equipList.value = {}
      
      // 处理舰船数据
      for (const item of json.api_mst_ship) {
        const id = item.api_id
        const ship = new ShipInfo()
        ship.id = id
        ship.name = item.api_name
        ship.yomi = item.api_yomi
        ship.stype = item.api_stype
        ship.ctype = item.api_ctype
        ship.速度 = item.api_soku
        ship.舰种 = item.api_stype
        ship.afterid = item.api_aftershipid || 0
        
        // 玩家舰船特殊处理
        if (id < 1500) {
          ship.最大燃料 = item.api_fuel_max
          ship.最大弹药 = item.api_bull_max
        } else {
          ship.yomi = ship.yomi.replace('-', '')
        }
        
        shipList.value[id] = ship
      }
      
      // 获取同型舰船列表
      getSameShipList()
      
      // 处理装备数据
      for (const item of json.api_mst_slotitem) {
        const id = item.api_id
        const equip = new EquipInfo()
        equip.id = id
        equip.name = item.api_name
        equip.火力 = item.api_houg
        equip.装甲 = item.api_souk
        equip.雷装 = item.api_raig
        equip.爆装 = item.api_baku
        equip.对空 = item.api_tyku
        equip.对潜 = item.api_tais
        equip.命中_对爆 = item.api_houm
        equip.回避_迎击 = item.api_houk
        equip.索敌 = item.api_saku
        equip.射程 = item.api_leng
        equip.稀有度 = item.api_rare
        equip.运 = item.api_luck
        equip.types = [...item.api_type]
        equip.broken = [...item.api_broken]
        
        // 可选属性
        if (item.api_distance !== undefined) {
          equip.航程 = item.api_distance
        }
        
        if (item.api_cost !== undefined) {
          equip.配置消耗 = item.api_cost
        }
        
        equipList.value[id] = equip
      }
      
      // 处理其他数据
      api_mst_stype.value = json.api_mst_stype
      api_mst_equip_ship.value = json.api_mst_equip_ship
      api_mst_equip_exslot_ship.value = json.api_mst_equip_exslot_ship
      
      // 处理打孔装备
      for (const ship of Object.values(shipList.value)) {
        if (ship.id > 1500) continue
        
        ship.打孔装备 = {}
        
        // 处理打孔装备信息
        for (const [key, value] of Object.entries(api_mst_equip_exslot_ship.value)) {
          const equipId = parseInt(key)
          
          if (value.api_ship_ids && value.api_ship_ids[ship.id]) {
            ship.打孔装备[equipId] = value.api_req_level
          } else if (value.api_stypes && value.api_stypes[ship.stype]) {
            ship.打孔装备[equipId] = value.api_req_level
          } else if (value.api_ctypes && value.api_ctypes[ship.ctype]) {
            ship.打孔装备[equipId] = value.api_req_level
          }
        }
        
        // 获取可装备类型
        const equipTypes: number[] = []
        const foundShipEquip = api_mst_equip_ship.value.find(a => a.api_ship_id === ship.id)
        
        if (foundShipEquip) {
          equipTypes.push(...foundShipEquip.api_equip_type)
        } else {
          const foundStype = api_mst_stype.value.find(a => a.api_id === ship.stype)
          if (foundStype) {
            for (const [key, value] of Object.entries(foundStype.api_equip_type)) {
              if (value === 1) {
                equipTypes.push(parseInt(key))
              }
            }
          }
        }
        
        // 处理打孔装备图标
        ship.打孔装备图标 = {}
        
        for (const [equipId, reqLevel] of Object.entries(ship.打孔装备 || {})) {
          const id = parseInt(equipId)
          const equip = equipList.value[id]
          if (!equip) continue
          
          const key = equip.types[3]
          const itemType = equip.types[2]
          
          if (equipTypes.includes(itemType)) {
            if (ship.打孔装备图标[key]) {
              ship.打孔装备图标[key] = Math.max(reqLevel, ship.打孔装备图标[key])
            } else {
              ship.打孔装备图标[key] = reqLevel
            }
          }
        }
      }
    } catch (error) {
      console.error('读取start2数据失败:', error)
    }
  }
  
  // 获取同型舰船列表
  const getSameShipList = () => {
    sameShipList.value = []
    allSameShipList.value = {}
    
    const tempDict: Record<number, SameShip> = {}
    
    // 处理所有舰船
    for (const [idStr, ship] of Object.entries(shipList.value)) {
      const id = parseInt(idStr)
      if (id > 1500) continue
      
      let found = false
      
      // 查找已有的同型舰
      for (const [existIdStr, existSameShip] of Object.entries(tempDict)) {
        if (existSameShip.next === ship.id) {
          existSameShip.ids.push(ship.id)
          existSameShip.next = ship.afterid
          found = true
          
          // 合并链接的同型舰
          if (tempDict[ship.afterid]) {
            const nextSameShip = tempDict[ship.afterid]
            if (nextSameShip === existSameShip) continue
            
            for (const nextId of nextSameShip.ids) {
              existSameShip.ids.push(nextId)
            }
            existSameShip.next = nextSameShip.next
            delete tempDict[ship.afterid]
          }
          break
        }
      }
      
      // 如果没有找到相关同型舰，创建新的
      if (!found) {
        const newSameShip = new SameShipClass()
        newSameShip.name = ship.name
        newSameShip.ids = [ship.id]
        newSameShip.next = ship.afterid
        
        tempDict[ship.id] = newSameShip
        
        // 合并已有的改造后舰船
        if (tempDict[ship.afterid]) {
          const nextSameShip = tempDict[ship.afterid]
          for (const nextId of nextSameShip.ids) {
            newSameShip.ids.push(nextId)
          }
          newSameShip.next = nextSameShip.next
          delete tempDict[ship.afterid]
        }
      }
    }
    
    // 保存结果
    sameShipList.value = Object.values(tempDict)
    
    // 构建完整的映射
    for (const sameShip of sameShipList.value) {
      for (const id of sameShip.ids) {
        allSameShipList.value[id] = sameShip
      }
    }
  }
  
  // 读取深海舰船数据
  const readAbyssalStats = async () => {
    try {
      // 尝试直接获取文本内容
      const response = await fetch('/data/abyssal_stats.json')
      const text = await response.text()
      
      console.log('已获取abyssal_stats.json文本, 长度:', text.length)
      
      // 尝试解析JSON
      let json
      try {
        json = JSON.parse(text)
        console.log('JSON解析成功, 类型:', typeof json)
      } catch (parseError) {
        console.error('JSON解析失败:', parseError)
        return
      }
      
      // 添加调试信息
      console.log('abyssal_stats.json数据类型:', typeof json)
      console.log('是否为数组:', Array.isArray(json))
      
      // 确保是对象或数组
      if (typeof json !== 'object' || json === null) {
        console.error('无法处理的JSON格式, 不是对象或数组')
        return
      }
      
      let processedCount = 0
      
      // 处理数据项
      const processData = (data: any) => {
        // 检查基本结构
        if (!data || typeof data !== 'object') {
          console.error('无效的数据项格式')
          return
        }
        
        // 检查ID
        if (!data.api_id) {
          console.error('数据项缺少api_id字段')
          return
        }
        
        const id = data.api_id
        
        // 检查舰船是否存在
        if (!shipList.value[id]) {
          console.error(`ID:${id}号船不存在于start2中`)
          return
        }
        
        // 更新舰船数据
        const ship = shipList.value[id]
        
        // 基本属性 - 使用可选链和默认值
        ship.耐久 = data.api_taik || 0
        ship.装甲 = data.api_souk || 0 
        ship.火力 = data.api_houg || 0
        ship.雷装 = data.api_raig || 0
        ship.对空 = data.api_tyku || 0
        ship.运 = data.api_luck || 0
        ship.射程 = data.api_leng || 0
        ship.回避 = data.kc3_evas || 0
        ship.对潜 = data.kc3_asw || 0 
        ship.索敌 = data.kc3_los || 0
        
        // 处理搭载量 - 确保是数组
        if (data.api_maxeq && Array.isArray(data.api_maxeq)) {
          ship.搭载 = [...data.api_maxeq]
        } else {
          ship.搭载 = []
          console.warn(`ID:${id}号船缺少搭载数据`)
        }
        
        // 处理装备 - 确保是数组
        if (data.kc3_slots && Array.isArray(data.kc3_slots)) {
          const slots = [...data.kc3_slots]
          ship.装备 = slots.map((slot: number) => slot < 1500 ? slot + 1000 : slot)
        } else {
          ship.装备 = []
          console.warn(`ID:${id}号船缺少装备数据`)
        }
        
        // 确保搭载量和装备数量匹配
        while (ship.搭载.length < ship.装备.length) {
          ship.搭载.push(0)
        }
        
        // 设置等级
        ship.level = ship.name.includes('潜水') ? 50 : 1
        
        // 计数处理成功的数据
        processedCount++
      }
      
      // 尝试分析数据结构并处理
      if (Array.isArray(json)) {
        // 数组格式: [item1, item2, ...]
        console.log('处理数组格式数据, 长度:', json.length)
        for (const item of json) {
          if (Array.isArray(item)) {
            // [data] 格式
            processData(item[0])
          } else {
            // 直接对象格式
            processData(item)
          }
        }
      } else {
        // 对象格式: {key1: data1, key2: data2, ...}
        console.log('处理对象格式数据, 键数量:', Object.keys(json).length)
        
        // 第一种可能: {id1: data1, id2: data2, ...}
        for (const [key, value] of Object.entries(json)) {
          if (Array.isArray(value)) {
            processData(value[0] || value)
          } else {
            processData(value)
          }
        }
      }
      
      console.log(`成功处理了 ${processedCount} 条深海舰船数据`)
      
      // 加载装备状态
      loadEquipStatus()
    } catch (error) {
      console.error('读取深海舰船数据失败:', error)
      if (error instanceof Error) {
        console.error('错误详情:', error.message)
        console.error('错误堆栈:', error.stack)
      }
    }
  }
  
  // 加载装备状态
  const loadEquipStatus = () => {
    for (const ship of Object.values(shipList.value)) {
      // 重置数据
      ship.制空 = 0
      ship.陆航制空 = 0
      ship.装甲plus = 0
      ship.火力plus = 0
      ship.雷装plus = 0
      ship.对空plus = 0
      ship.回避plus = 0
      ship.对潜plus = 0
      ship.索敌plus = 0
      ship.爆装 = 0
      ship.命中 = 0
      ship.携带攻击机 = false
      
      // 重置装备个数
      ship.装备个数 = {
        "主炮": 0,
        "副炮": 0,
        "鱼雷": 0
      }
      
      // 计算装备提供的属性
      for (let i = 0; i < ship.装备.length; i++) {
        const equipId = ship.装备[i]
        if (!equipList.value[equipId]) continue
        
        const equip = equipList.value[equipId]
        
        // 增加各种属性
        ship.装甲plus += equip.装甲
        ship.火力plus += equip.火力
        ship.雷装plus += equip.雷装
        ship.对空plus += equip.对空
        ship.回避plus += equip.回避_迎击
        ship.对潜plus += equip.对潜
        ship.索敌plus += equip.索敌
        ship.爆装 += equip.爆装
        ship.命中 += equip.命中_对爆
        
        // 射程取最大值
        ship.射程 = Math.max(ship.射程 || 0, equip.射程)
        
        // 计算制空值
        if (i < ship.搭载.length) {
          if (制空飞机.includes(equip.types[2])) {
            ship.制空 += Math.floor(equip.对空 * Math.sqrt(ship.搭载[i]))
          } else if (陆航制空飞机.includes(equip.types[2])) {
            ship.陆航制空 += Math.floor(equip.对空 * Math.sqrt(ship.搭载[i]))
          }
          
          if (攻击机.includes(equip.types[2])) {
            ship.携带攻击机 = true
          }
        }
        
        // 统计装备类型
        const equipType = equip.types[2]
        
        if (equipType === EquipmentType3.小主 || 
            equipType === EquipmentType3.中主 || 
            equipType === EquipmentType3.大主) {
          ship.装备个数["主炮"]++
        } else if (equipType === EquipmentType3.副炮) {
          ship.装备个数["副炮"]++
        } else if (equipType === EquipmentType3.鱼雷) {
          ship.装备个数["鱼雷"]++
        }
      }
      
      // 计算空母火力
      ship.火力_空母 = Math.floor((ship.火力 || 0) + ship.火力plus + (ship.雷装 || 0) + ship.雷装plus + Math.floor(ship.爆装 * 1.3) * 1.5) + 55
      
      // 计算陆航制空
      ship.陆航制空 += ship.制空
      
      // 计算加权对空
      ship.加权对空 = Math.floor(Math.sqrt((ship.对空 || 0) + ship.对空plus))
      
      // 计算命中项
      ship.命中项_炮击 = 90 + 2 * Math.sqrt(2) + 1.5 * Math.sqrt(ship.运 || 0) + ship.命中
      
      // 设置夜战攻击类型
      if (ship.装备个数["主炮"] >= 3) {
        ship.夜战攻击类型 = 5
      } else if (ship.装备个数["主炮"] === 2 && ship.装备个数["副炮"] >= 1) {
        ship.夜战攻击类型 = 4
      } else if (ship.装备个数["鱼雷"] >= 2) {
        ship.夜战攻击类型 = 3
      } else if (ship.装备个数["主炮"] >= 1 && ship.装备个数["鱼雷"] === 1) {
        ship.夜战攻击类型 = 2
      } else if (ship.装备个数["主炮"] + ship.装备个数["副炮"] >= 2) {
        ship.夜战攻击类型 = 1
      } else {
        ship.夜战攻击类型 = 0
      }
    }
  }
  
  // 获取舰船ID列表（根据名称）
  const getIDs = (names: string[], exact: boolean) => {
    const result: number[] = []
    
    if (Object.keys(shipList.value).length === 0) {
      return result
    }
    
    if (exact) {
      // 精确匹配
      for (const ship of Object.values(shipList.value)) {
        if (names.includes(ship.name)) {
          result.push(ship.id)
        }
      }
    } else {
      // 同型舰匹配
      for (const name of names) {
        const found = Object.values(shipList.value).find(ship => ship.name === name)
        if (!found) {
          console.error(`游戏基础数据版本错误，请先刷新游戏: ${name}`)
          return result
        }
        
        const sameShip = allSameShipList.value[found.id]
        if (!sameShip) continue
        
        let foundInList = false
        for (const id of sameShip.ids) {
          if (id === found.id) {
            result.push(id)
            foundInList = true
          } else if (foundInList) {
            result.push(id)
          }
        }
      }
    }
    
    return result
  }
  
  // 获取最低级的舰船ID
  const getLowestShipID = (id: number): number => {
    let result = id
    
    for (const ship of Object.values(shipList.value)) {
      if (ship.afterid === id && ship.id < id) {
        result = ship.id
        return getLowestShipID(result)
      }
      
      if (ship.afterid > 0 && ship.id === id && ship.afterid < id) {
        result = ship.afterid
        return getLowestShipID(result)
      }
    }
    
    return result
  }
  
  // 读取舰船统计数据
  const readShipStats = (json: any) => {
    if (!json || !Array.isArray(json)) {
      console.error('读取舰船统计数据失败: 无效的JSON格式')
      return
    }
    
    for (const item of json) {
      if (!item || !item.id) continue
      
      const id = item.id
      if (shipList.value[id]) {
        const ship = shipList.value[id]
        
        // 从json中读取属性并更新到ship对象
        if (item.stat) {
          ship.索敌 = item.stat.los || 0
          ship.索敌max = item.stat.los_max || 0
          ship.耐久 = item.stat.hp || 0
          ship.火力 = item.stat.fire || 0
          ship.火力max = item.stat.fire_max || 0
          ship.雷装 = item.stat.torpedo || 0
          ship.雷装max = item.stat.torpedo_max || 0
          ship.对潜 = item.stat.asw || 0
          ship.对潜max = item.stat.asw_max || 0
          ship.运 = item.stat.luck || 0
        }
      }
    }
  }
  
  // 获取特定ID的舰船信息
  const getShipInfo = (id: number): Api_ShipInfo | null => {
    return shipList.value[id] || null
  }
  
  // 初始化方法
  const initializeData = async () => {
    let success = true
    let error = null
    
    try {
      // 第一步：加载舰船和装备数据
      await readStart2()
      console.log('舰船和装备数据加载成功')
    } catch (err) {
      success = false
      error = err
      console.error('舰船和装备数据加载失败:', err)
      // 这是关键数据，加载失败就抛出异常
      throw new Error('基础舰船数据加载失败，无法继续')
    }
    
    try {
      // 第二步：加载深海舰船数据
      await readAbyssalStats()
      console.log('深海舰船数据加载成功')
    } catch (err) {
      // 深海舰船数据虽然加载失败，但不应该阻止整个应用运行
      console.error('深海舰船数据加载失败，但将继续运行:', err)
    }
    
    // 加载装备状态 - 无论深海舰船数据是否加载成功，都需要执行
    loadEquipStatus()
    
    // 输出加载后的列表信息
    console.log('=== 数据加载完成情况统计 ===')
    console.log(`舰船数据: ${Object.keys(shipList.value).length}条`)
    console.log(shipList.value)
    console.log(`装备数据: ${Object.keys(equipList.value).length}条`)
    console.log(equipList.value)
    console.log(`同型舰分类: ${sameShipList.value.length}类`)
    console.log(sameShipList.value)
    console.log(`舰种类型: ${api_mst_stype.value.length}种`)
    console.log(api_mst_stype.value)
    console.log('=== 数据加载完成 ===')
    
    return { success, error }
  }
  
  return {
    shipList,
    equipList,
    sameShipList,
    allSameShipList,
    api_mst_stype,
    api_mst_equip_ship,
    api_mst_equip_exslot_ship,
    initializeData,
    readStart2,
    readAbyssalStats,
    readShipStats,
    loadEquipStatus,
    getIDs,
    getShipInfo,
    getLowestShipID
  }
}) 