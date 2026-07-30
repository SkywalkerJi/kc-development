import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Api_ShipInfo, SameShip, Api_Mst_Stype, Api_Mst_Equip_Ship, Api_Mst_Equip_Exslot_Ship } from '@/types/shipTypes'
import { ShipInfo, SameShipClass } from '@/types/shipTypes'
import type { Api_EquipInfo } from '@/types/equipTypes'
import { EquipmentType3, EquipInfo } from '@/types/equipTypes'
import { validateStart2Payload } from '@/core/dataSchema'
import { fetchJson, assertResponseOk } from './fetchJson'

/**
 * 由（已通过 validateStart2Payload 校验的）舰船列表推导同型舰分类。
 *
 * 刻意写成不依赖 store 状态的纯函数：readStart2 需要在局部变量里把整套
 * 解析结果（含同型舰分类）准备完毕后再一次性发布到 store，这个函数只是
 * 那条流水线上的一步，不直接读写任何 ref。逻辑本身是从原来直接读写
 * sameShipList.value/allSameShipList.value 的版本原样搬过来的，只是把
 * 读写对象换成了参数和返回值，不改变同型舰归类算法本身。
 */
function computeSameShipList(
  shipList: Record<number, Api_ShipInfo>,
): { sameShipList: SameShip[]; allSameShipList: Record<number, SameShip> } {
  const tempDict: Record<number, SameShip> = {}

  for (const [idStr, ship] of Object.entries(shipList)) {
    const id = parseInt(idStr)
    if (id > 1500) continue

    let found = false

    for (const [, existSameShip] of Object.entries(tempDict)) {
      if (existSameShip.next === ship.id) {
        existSameShip.ids.push(ship.id)
        existSameShip.next = ship.afterid
        found = true

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

    if (!found) {
      const newSameShip = new SameShipClass()
      newSameShip.name = ship.name
      newSameShip.ids = [ship.id]
      newSameShip.next = ship.afterid

      tempDict[ship.id] = newSameShip

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

  const sameShipList = Object.values(tempDict)
  const allSameShipList: Record<number, SameShip> = {}
  for (const sameShip of sameShipList) {
    for (const id of sameShip.ids) {
      allSameShipList[id] = sameShip
    }
  }

  return { sameShipList, allSameShipList }
}

export const useStart2Store = defineStore('start2', () => {
  // 数据存储
  const shipList = ref<Record<number, Api_ShipInfo>>({})
  const equipList = ref<Record<number, Api_EquipInfo>>({})
  const sameShipList = ref<SameShip[]>([])
  const allSameShipList = ref<Record<number, SameShip>>({})
  const api_mst_stype = ref<Api_Mst_Stype[]>([])
  const api_mst_equip_ship = ref<Api_Mst_Equip_Ship[]>([])
  const api_mst_equip_exslot_ship = ref<Record<number, Api_Mst_Equip_Exslot_Ship>>({})

  // 就绪标志：只在 readStart2() 完整跑完（含 schema 校验与下面的同型舰非空
  // 校验）后置为 true；任何抛错路径都不会走到置位那一行。不能用「shipList
  // 非空」代替它——虽然 readStart2 现在已经改成先在局部变量里解析完、最后
  // 才一次性发布（见下面 readStart2 内部的说明），isReady 仍然是唯一直接
  // 表达"这次加载是否成功"的状态，不从 shipList 等其他状态反推，避免未来
  // 改动读写顺序时又悄悄引入同类问题。
  const isReady = ref(false)

  // 制空相关数据
  const 制空飞机 = [6, 7, 8, 11, 45, 47, 48, 56, 57, 58]
  const 陆航制空飞机 = [10]
  const 攻击机 = [7, 8, 57, 58]
  
  // 读取start2.json数据
  //
  // 整体结构：fetch → 解析 JSON → schema 校验 → 在局部变量里构建全部结果
  // （舰船表、装备表、同型舰分类、打孔装备……）→ 只有到最后"原子发布"那个
  // 代码块才会写 shipList.value 等响应式状态。中间任何一步抛错，函数在
  // 走到那个代码块之前就已经退出，store 里的状态还是这次调用开始前的样子
  // （可能是空表，也可能是上一次成功时留下的旧数据）——不会出现"舰船表已经
  // 写完、装备表还没处理完就抛错"这种半成品状态被外部读到的情况。
  const readStart2 = async () => {
    // 立即置为未就绪：哪怕上一次曾经成功过，只要重新进入这个函数，就先假定
    // 这次加载还没完成。真正的数据要等到下面原子发布那一刻才会替换旧值，
    // 但 isReady 必须提前失效，不能让调用方在"旧数据还留着、新数据没准备好"
    // 的这段时间里误以为仍是就绪状态。
    isReady.value = false
    try {
      // 使用基础路径获取start2.json；fetchJson 会先检查 HTTP 状态码再解析
      // JSON——HTTP 500 若恰好返回结构合法的 JSON（比如网关错误页），不会
      // 被当成正常数据放过。fetchJson 返回类型是 unknown（校验前不能假设
      // 任何形状），这里转回 any——和这个文件里其它地方处理外部 JSON 的
      // 方式一致（比如 readShipStats(json: any)），下面紧接着的
      // validateStart2Payload 才是真正保证形状的地方，这个 any 只是让
      // 校验通过之后的字段访问不需要逐层写类型断言。
      const json = (await fetchJson(`${import.meta.env.BASE_URL}data/start2.json`)) as any

      // schema 校验：结构性问题（顶层形状、必需字段缺失、ID 缺失/重复/
      // 不是正整数、数组长度不对等，详见 dataSchema.js 的注释）在这里
      // 一次性拦下，下面的构建逻辑可以放心假设每条记录的形状都是合法的，
      // 不需要再在循环里逐个做防御性判断。此时还没有碰任何 store 状态。
      const validation = validateStart2Payload(json)
      if (!validation.ok) {
        throw new Error(
          `start2.json 数据校验失败（共 ${validation.errors.length} 项）：\n` +
          validation.errors.slice(0, 20).join('\n') +
          (validation.errors.length > 20 ? `\n...另有 ${validation.errors.length - 20} 条` : ''),
        )
      }

      // 处理舰船数据（写入局部变量，不是 shipList.value）
      const nextShipList: Record<number, Api_ShipInfo> = {}
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

        nextShipList[id] = ship
      }

      // 处理装备数据（同样先写局部变量）
      const nextEquipList: Record<number, Api_EquipInfo> = {}
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

        nextEquipList[id] = equip
      }

      // 由局部舰船表推导同型舰分类，同样只落在局部变量里
      const { sameShipList: nextSameShipList, allSameShipList: nextAllSameShipList } =
        computeSameShipList(nextShipList)

      // schema 校验只保证"记录形状合法"，不保证"业务上有意义"——比如
      // api_mst_ship 里可能全是 id >= 1500 的敌方舰船，形状完全合法，但
      // computeSameShipList 只处理玩家舰船，这种情况下 allSameShipList
      // 会是空表。开发池按舰名反查同型舰要靠 allSameShipList（见 getIDs
      // 的非精确匹配分支），空表会让这条路径静默失效而不报错，所以这里
      // 仍然需要单独判空——这属于跨记录的业务校验，不是 dataSchema.js
      // 里逐条记录的结构校验能覆盖的范围。
      if (Object.keys(nextAllSameShipList).length === 0) {
        throw new Error('start2.json 解析结果不含任何玩家舰船（同型舰分类为空），判定为加载失败')
      }

      const nextStype = json.api_mst_stype as Api_Mst_Stype[]
      const nextEquipShip = json.api_mst_equip_ship as Api_Mst_Equip_Ship[]
      const nextEquipExslotShip = json.api_mst_equip_exslot_ship as Record<number, Api_Mst_Equip_Exslot_Ship>

      // 处理打孔装备：只读写上面几个局部变量（在 nextShipList 里的 ship
      // 对象上追加字段），不触碰任何 store 状态。
      for (const ship of Object.values(nextShipList)) {
        if (ship.id > 1500) continue

        ship.打孔装备 = {}

        // 处理打孔装备信息
        for (const [key, value] of Object.entries(nextEquipExslotShip)) {
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
        const foundShipEquip = nextEquipShip.find(a => a.api_ship_id === ship.id)

        if (foundShipEquip) {
          equipTypes.push(...foundShipEquip.api_equip_type)
        } else {
          const foundStype = nextStype.find(a => a.api_id === ship.stype)
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
          const equip = nextEquipList[id]
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

      // 原子发布：从这里开始只是简单赋值，不会再抛错——前面任何一步的失败
      // 都已经在到达这里之前 throw 出去了，store 不会观察到"发布了一半"的
      // 中间态。isReady 必须是这个块里最后落地的一行：本函数目前没有在这个
      // 块之后、之外的提前 return，以后改这个函数的人也不能绕过它。
      shipList.value = nextShipList
      equipList.value = nextEquipList
      sameShipList.value = nextSameShipList
      allSameShipList.value = nextAllSameShipList
      api_mst_stype.value = nextStype
      api_mst_equip_ship.value = nextEquipShip
      api_mst_equip_exslot_ship.value = nextEquipExslotShip
      isReady.value = true
    } catch (error) {
      console.error('读取start2数据失败:', error)
      // 必须重抛：这是关键数据，解析/校验失败（如接口返回结构变化、字段
      // 缺失或类型不对等）不能被当作"已处理"悄悄放过。不重抛的话调用方会
      // 拿到一个看似成功、实则数据有问题的结果，且这个"成功"会被
      // initializeData 的进行中缓存永久保存——刷新页面前都无法重试。
      throw error
    }
  }

  // 读取深海舰船数据
  const readAbyssalStats = async () => {
    try {
      // 尝试直接获取文本内容
      const response = await fetch(`${import.meta.env.BASE_URL}data/abyssal_stats.json`)
      // 这里不用 fetchJson（它内置了 .json() 解析），因为下面需要先拿到
      // 原始文本自己 JSON.parse，用于诊断日志——但状态码检查这一步不该
      // 因此就跳过，复用 assertResponseOk 同一套判断。
      assertResponseOk(response, `${import.meta.env.BASE_URL}data/abyssal_stats.json`)
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
  
  // 初始化方法（内部实现，外部一律经 initializeData 的进行中缓存调用）
  //
  // 返回值契约：关键数据（舰船/装备）加载失败一律以 reject 表达，不会以
  // `{ success: false }` 的形式正常返回——下面 initializeData 的进行中缓存
  // (`inflight ??= _initializeData().catch(...)`) 只在 promise 被 reject 时
  // 才会清空缓存；如果这里改成"捕获后返回 success:false"，缓存就不会清空，
  // 一次失败会被永久缓存成不可恢复状态。因此这个函数能正常 return 的路径，
  // `success` 永远是 true——深海舰船数据加载失败由 readAbyssalStats 自己的
  // try/catch 吞掉（不重抛，只打日志），根本不会传到这里，所以不影响 success；
  // 它不是"必须有"的数据，故意设计成非致命。
  const _initializeData = async () => {
    try {
      // 第一步：加载舰船和装备数据（关键数据，失败必须让整个初始化失败）
      await readStart2()
      console.log('舰船和装备数据加载成功')
    } catch (err) {
      console.error('舰船和装备数据加载失败:', err)
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

    return { success: true, error: null }
  }

  // 进行中去重：并发调用只触发一次真实加载，避免重复拉取 1.9MB 的 start2.json
  // （以及连带的 199KB abyssal_stats.json）并重复执行 loadEquipStatus 等下游步骤。
  // App.vue 同时挂载 DataInitializer 与 DevelopmentView，两者各自 await
  // initializeData()，若无此缓存，第二个调用方进入时第一个的 fetch 还没
  // resolve，状态判空守卫拦不住，会触发第二次完整加载链路。
  let inflight: ReturnType<typeof _initializeData> | null = null

  const initializeData = () =>
    (inflight ??= _initializeData().catch((e) => {
      // 失败必须清空，否则一次瞬时网络错误（或数据解析失败）会被永久缓存成
      // 不可恢复状态：下次调用方拿到的仍是同一个已 reject 的 promise，永远
      // 不会重试。readStart2 解析失败会走到这里（它会重抛，见其定义处注释）。
      inflight = null
      throw e
    }))

  return {
    shipList,
    equipList,
    sameShipList,
    allSameShipList,
    isReady,
    api_mst_stype,
    api_mst_equip_ship,
    api_mst_equip_exslot_ship,
    initializeData,
    // 故意不导出 readStart2：inflight 只在失败时清空，成功一次后会永久保留
    // 那个已 resolve 的 promise。如果 readStart2 是公开 API，外部代码可以
    // 绕过 initializeData 的这层缓存直接调用它——它会先把 isReady 置 false，
    // 一旦这次直接调用失败，isReady 就停在 false，但 inflight 缓存的仍是
    // 上一次成功的 promise；调用方紧接着再调 initializeData() 会立刻拿到
    // 那个旧的成功结果，既不会真正重试，也不会把 isReady 恢复成 true——
    // 「已就绪缓存」与「仅用于并发去重的进行中 promise」这两个概念在这种
    // 用法下被搅到了一起。生产代码从未直接调用过 readStart2，只保留它作为
    // initializeData 内部使用的私有实现，彻底堵死这条路径。
    readAbyssalStats,
    readShipStats,
    loadEquipStatus,
    getIDs,
    getShipInfo,
    getLowestShipID
  }
}) 