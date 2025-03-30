<template>
  <div class="development-view">
    <h2>装备开发</h2>
    
    <!-- 主要内容区域 -->
    <div class="main-content">
      <div class="left-panel">
        <!-- 秘书舰类型选择 -->
        <div class="secretary-select">
          <label for="poolSelect">秘书舰类型：</label>
          <select id="poolSelect" v-model="selectedPool" @change="onPoolChanged">
            <option v-for="pool in availablePools" :key="pool.开发池名称" :value="pool">
              {{ String(pool) }}
            </option>
          </select>
        </div>
        
        <!-- 资源输入区域 -->
        <div class="resource-inputs">
          <div class="resource-group">
            <label for="fuel">油</label>
            <input id="fuel" type="number" v-model.number="resources[0]" min="10" max="300"  @blur="normalizeResource(0)">
          </div>
          
          <div class="resource-group">
            <label for="ammo">弹</label>
            <input id="ammo" type="number" v-model.number="resources[1]" min="10" max="300"  @blur="normalizeResource(1)">
          </div>
          
          <div class="resource-group">
            <label for="steel">钢</label>
            <input id="steel" type="number" v-model.number="resources[2]" min="10" max="300"  @blur="normalizeResource(2)">
          </div>
          
          <div class="resource-group">
            <label for="bauxite">铝</label>
            <input id="bauxite" type="number" v-model.number="resources[3]" min="10" max="300" @blur="normalizeResource(3)">
          </div>
        </div>
        
        <!-- 开发装备结果列表 -->
        <div class="equipment-list">
          <table>
            <thead>
              <tr>
                <th>图标</th>
                <th>装备</th>
                <th>出货率</th>
                <th>最低资源要求</th>
              </tr>
            </thead>
            <tbody>
              <!-- 目标装备组 -->
              <template v-if="targetEquipments.length > 0">
                <tr class="group-header">
                  <td></td>
                  <td>目标装备</td>
                  <td>{{ calculateTotalRate(targetEquipments) }}%</td>
                  <td></td>
                </tr>
                <tr v-for="equip in targetEquipments" :key="equip.id" class="target-equipment">
                  <td><img v-if="getEquipIcon(equip)" :src="getEquipIcon(equip)" alt="装备图标" /></td>
                  <td>{{ equip.name }}</td>
                  <td>{{ getEquipRate(equip.id) }}</td>
                  <td>{{ getResourceRequirement(equip) }}</td>
                </tr>
              </template>
              
              <!-- 其他可出货装备 -->
              <template v-if="otherEquipments.length > 0">
                <tr class="group-header">
                  <td></td>
                  <td>其它装备</td>
                  <td>{{ calculateTotalRate(otherEquipments) }}%</td>
                  <td></td>
                </tr>
                <tr v-for="equip in otherEquipments" :key="equip.id">
                  <td><img v-if="getEquipIcon(equip)" :src="getEquipIcon(equip)" alt="装备图标" /></td>
                  <td>{{ equip.name }}</td>
                  <td>{{ getEquipRate(equip.id) }}</td>
                  <td>{{ getResourceRequirement(equip) }}</td>
                </tr>
              </template>
              
              <!-- 资源不足装备 -->
              <template v-if="insufficientEquipments.length > 0">
                <tr class="group-header">
                  <td></td>
                  <td>资源不足导致失败</td>
                  <td>{{ calculateTotalRate(insufficientEquipments) }}%</td>
                  <td></td>
                </tr>
                <tr v-for="equip in insufficientEquipments" :key="equip.id" class="insufficient-equipment">
                  <td><img v-if="getEquipIcon(equip)" :src="getEquipIcon(equip)" alt="装备图标" /></td>
                  <td>{{ equip.name }}</td>
                  <td>{{ getEquipRate(equip.id) }}</td>
                  <td>{{ getResourceRequirement(equip) }}</td>
                </tr>
              </template>
              
              <!-- 全部被替换装备 -->
              <template v-if="replacedEquipments.length > 0">
                <tr class="group-header">
                  <td></td>
                  <td>全部被替换</td>
                  <td>0%</td>
                  <td></td>
                </tr>
                <tr v-for="equip in replacedEquipments" :key="equip.id" class="replaced-equipment">
                  <td><img v-if="getEquipIcon(equip)" :src="getEquipIcon(equip)" alt="装备图标" /></td>
                  <td>{{ equip.name }}</td>
                  <td>0%</td>
                  <td>{{ getResourceRequirement(equip) }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="right-panel">
        <!-- 装备选择区域 -->
        <div class="equipment-filter">
          <h3>自选装备组合</h3>
          <div class="equipment-buttons">
            <!-- 按装备类型分组显示 -->
            <template v-for="(group, groupIndex) in equipmentGroups" :key="groupIndex">
              <div class="equipment-group">
                <button 
                  v-for="equipId in group" 
                  :key="equipId"
                  :class="{ 
                    'selected': developmentStore.filterButtonList[equipId].select, 
                    'disabled': !isEquipmentAvailable(Number(equipId)) 
                  }"
                  :disabled="!isEquipmentAvailable(Number(equipId)) && !developmentStore.filterButtonList[equipId].select"
                  @click="toggleEquipment(Number(equipId))"
                >
                  <img 
                    v-if="getEquipIcon(developmentStore.filterButtonList[equipId].equipInfo)" 
                    :src="getEquipIcon(developmentStore.filterButtonList[equipId].equipInfo)" 
                    alt="装备图标" 
                  />
                  {{ developmentStore.filterButtonList[equipId].equipInfo.name }}
                </button>
              </div>
            </template>
          </div>
        </div>
        
        <!-- 可用公式区域 -->
        <div class="development-results">
          <h3>可用公式</h3>
          <table v-if="hasSelectedEquipments">
            <thead>
              <tr>
                <th>秘书舰</th>
                <th>油</th>
                <th>弹</th>
                <th>钢</th>
                <th>铝</th>
                <th>总资源</th>
                <th>池类型</th>
                <th>出货率</th>
                <th>失败率</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="(result, index) in developmentResults" 
                :key="index"
                @click="selectResult(result)"
              >
                <td>{{ result.池名 }}</td>
                <td>{{ result.公式[0] }}</td>
                <td>{{ result.公式[1] }}</td>
                <td>{{ result.公式[2] }}</td>
                <td>{{ result.公式[3] }}</td>
                <td>{{ result.总资源 }}</td>
                <td>{{ result.池类型 }}</td>
                <td>{{ result.出货率 }}%</td>
                <td>{{ result.失败率 }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useDevelopmentStore } from '@/stores/developmentStore'
import { useStart2Store } from '@/stores/start2Store'
import type { Api_EquipInfo } from '@/types/equipTypes'
import type { DevelopmentPool, DevelopResult } from '@/types/developTypes'

// 获取 store
const developmentStore = useDevelopmentStore()
const start2Store = useStart2Store()

// 状态数据
const selectedPool = ref<DevelopmentPool | null>(null)
const resources = ref<number[]>([10, 10, 10, 10])
const availablePools = computed(() => {
  // 使用Map对相同开发池名称进行去重
  const poolMap = new Map<string, DevelopmentPool>()
  
  developmentStore.developmentPools
    .filter(pool => 
      pool.开发池ID >= 0 && 
      !pool.最低资源 &&
      developmentStore.existPool.includes(pool.开发池名称)
    )
    .forEach(pool => {
      if (!poolMap.has(pool.开发池名称)) {
        poolMap.set(pool.开发池名称, pool)
      }
    })
  
  return Array.from(poolMap.values())
})
const developmentResults = ref<DevelopResult[]>([])
const flagshipInfo = ref<{ pool: DevelopmentPool, shipInfo: any } | null>(null)
const isCurrentFlagshipSelected = computed(() => 
  flagshipInfo.value && selectedPool.value && 
  flagshipInfo.value.pool.开发池名称 === selectedPool.value.开发池名称
)

// 当前可出货装备的分类
const currentPoolEquipments = ref<{ [id: number]: number }>({})
// 判断是否有选中的装备
const hasSelectedEquipments = computed(() => {
  return developmentStore.getSelectedEquipIds().length > 0
})
const targetEquipments = computed(() => {
  const equipIds = Object.keys(developmentStore.filterButtonList)
    .map(Number)
    .filter(id => developmentStore.filterButtonList[id].select)
  
  return equipIds.map(id => start2Store.equipList[id])
    .filter(equip => equip !== undefined && currentPoolEquipments.value[equip.id] !== undefined)
})
const otherEquipments = computed(() => {
  // 可出货但不是目标装备的
  const ids = Object.keys(currentPoolEquipments.value).map(Number)
    .filter(id => {
      const equip = start2Store.equipList[id]
      if (!equip) return false
      
      // 检查是否满足资源要求
      const hasEnoughResources = resources.value[0] >= equip.broken[0] * 10 && 
                                resources.value[1] >= equip.broken[1] * 10 && 
                                resources.value[2] >= equip.broken[2] * 10 && 
                                resources.value[3] >= equip.broken[3] * 10
      
      // 不是目标且有足够资源
      return hasEnoughResources && 
             currentPoolEquipments.value[id] > 0 && 
             !targetEquipments.value.some(e => e.id === id)
    })
  
  return ids.map(id => start2Store.equipList[id])
    .filter(equip => equip !== undefined)
})
const insufficientEquipments = computed(() => {
  // 资源不足的装备
  const ids = Object.keys(currentPoolEquipments.value).map(Number)
    .filter(id => {
      const equip = start2Store.equipList[id]
      if (!equip) return false
      
      // 检查是否不满足资源要求
      const hasInsufficientResources = resources.value[0] < equip.broken[0] * 10 || 
                                      resources.value[1] < equip.broken[1] * 10 || 
                                      resources.value[2] < equip.broken[2] * 10 || 
                                      resources.value[3] < equip.broken[3] * 10
      
      return hasInsufficientResources && 
             currentPoolEquipments.value[id] > 0 &&
             !targetEquipments.value.some(e => e.id === id)
    })
  
  return ids.map(id => start2Store.equipList[id])
    .filter(equip => equip !== undefined)
})
const replacedEquipments = computed(() => {
  // 被替换的装备（出货率为0）
  const ids = Object.keys(currentPoolEquipments.value).map(Number)
    .filter(id => currentPoolEquipments.value[id] === 0 && 
                 !targetEquipments.value.some(e => e.id === id) &&
                 !otherEquipments.value.some(e => e.id === id) &&
                 !insufficientEquipments.value.some(e => e.id === id))
  
  return ids.map(id => start2Store.equipList[id])
    .filter(equip => equip !== undefined)
})

// 装备分组
const equipmentGroups = computed(() => {
  // 检查filterButtonList是否已初始化
  if (Object.keys(developmentStore.filterButtonList).length === 0) {
    return []
  }
  
  // 按类型分组
  const groups: Record<number, number[]> = {}
  
  // 获取所有装备ID并排序
  const allEquipIds = Object.keys(developmentStore.filterButtonList).map(Number)
  
  // 按照原C#程序的排序方式进行排序
  allEquipIds.sort((a, b) => {
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
  
  // 按照types[2]分组
  for (const equipId of allEquipIds) {
    const equip = start2Store.equipList[equipId]
    if (!equip) continue
    
    const typeId = equip.types[2]
    if (!groups[typeId]) {
      groups[typeId] = []
    }
    
    groups[typeId].push(equipId)
  }
  
  // 转换为数组
  return Object.values(groups)
})

// 初始化数据
onMounted(async () => {
  // 初始化开发数据
  await developmentStore.initializeData()
  
  // 设置初始选择的池
  if (availablePools.value.length > 0) {
    selectedPool.value = availablePools.value[0]
    updateCurrentPoolEquipments()
  }
  
  // 测试数据 - 模拟设置当前秘书舰（实际应从游戏中获取）
  // 这里只是演示，实际应用中应该通过游戏API获取
  const testShipId = 1; // 假设为长门
  if (start2Store.shipList[testShipId]) {
    const result = developmentStore.setFlagship(testShipId)
    if (result) {
      flagshipInfo.value = result
    }
  }
  
  // 初始计算
  calculateResults()
})

// 监听资源变化，更新结果
watch(resources, () => {
  updateCurrentPoolEquipments()
  calculateResults()
}, { deep: true })

// 更新当前池装备数据
function updateCurrentPoolEquipments() {
  if (!selectedPool.value) return
  
  currentPoolEquipments.value = {}
  
  // 确定当前资源配置对应的池类型
  let poolType = 3 // 默认为油钢池
  
  if (resources.value[3] > resources.value[0] && 
      resources.value[3] > resources.value[1] && 
      resources.value[3] > resources.value[2]) {
    poolType = 1 // 铝池
  } else if (resources.value[1] > resources.value[0] && 
             resources.value[1] > resources.value[2]) {
    poolType = 2 // 弹池
  }
  
  // 寻找符合条件的开发池 - 修正兼容池的筛选逻辑
  const compatiblePools = developmentStore.developmentPools.filter(pool => 
    Math.abs(pool.开发池ID) === poolType && 
    pool.舰ID && selectedPool.value?.舰ID &&
    // 修正：确保pool.舰ID包含了selectedPool.舰ID中的所有ID（是超集）
    selectedPool.value.舰ID.every(id => pool.舰ID?.includes(id)) &&
    (pool.最低资源 === null || pool.最低资源 === undefined || 
      (resources.value[0] >= pool.最低资源[0] && 
       resources.value[1] >= pool.最低资源[1] && 
       resources.value[2] >= pool.最低资源[2] && 
       resources.value[3] >= pool.最低资源[3]))
  )
  
  // 按照C#代码中的逻辑实现
  // 创建一个记录每个装备出货率变化的Map
  const equipRatesMap: Record<number, number[]> = {}
  
  // 遍历所有兼容池，并记录每个装备在每个池中的出货率
  for (let i = 0; i < compatiblePools.length; i++) {
    const pool = compatiblePools[i]
    if (!pool.出货率) continue
    
    for (const [equipIdStr, rate] of Object.entries(pool.出货率)) {
      const equipId = Number(equipIdStr)
      
      if (!equipRatesMap[equipId]) {
        equipRatesMap[equipId] = []
        // 如果不是第一个池，为之前的池添加0占位
        if (i > 0) {
          equipRatesMap[equipId].push(0)
        }
      }
      
      equipRatesMap[equipId].push(rate)
      
      // 同时更新总出货率
      if (currentPoolEquipments.value[equipId] !== undefined) {
        currentPoolEquipments.value[equipId] += rate
      } else {
        currentPoolEquipments.value[equipId] = rate
      }
    }
  }
  
  // 保存详细的出货率数据供显示使用
  equipRatesDetailMap.value = equipRatesMap
  
  // 如果没有结果，检查一下数据
  if (Object.keys(currentPoolEquipments.value).length === 0) {
    console.log('找不到匹配的开发池', {
      poolType,
      selectedPoolId: selectedPool.value.开发池ID,
      selectedPoolShipIds: selectedPool.value.舰ID,
      resources: resources.value
    })
  }
}

// 切换池
function onPoolChanged() {
  updateCurrentPoolEquipments()
  calculateResults()
}

// 验证资源输入
function validateResource(index: number) {
  if (isNaN(resources.value[index])) {
    resources.value[index] = 10
  }
  
  if (resources.value[index] < 10) {
    resources.value[index] = 10
  } else if (resources.value[index] > 300) {
    resources.value[index] = 300
  }
}

// 标准化资源输入（失焦时）
function normalizeResource(index: number) {
  validateResource(index)
  updateCurrentPoolEquipments()
  calculateResults()
}

// 切换装备选择状态
function toggleEquipment(equipId: number) {
  developmentStore.toggleEquipmentSelect(equipId)
  // 修改：更新可用装备列表后再计算公式
  updatePossibleEquipments()
  calculateDevelopmentResults()
  
  // 如果有可用公式，自动应用第一个
  if (developmentResults.value.length > 0) {
    selectResult(developmentResults.value[0])
  }
}

// 新增：获取可能的装备列表
function updatePossibleEquipments() {
  const selectedEquipIds = developmentStore.getSelectedEquipIds()
  
  // 如果没有选中的装备，所有装备都可用
  if (selectedEquipIds.length === 0) {
    for (const key in developmentStore.filterButtonList) {
      developmentStore.filterButtonList[key].select = false
    }
    return
  }
  
  // 九六式陸攻特殊处理标记
  const has九六式陸攻 = selectedEquipIds.includes(168)
  
  // 收集可能的装备ID
  const possibleEquips: number[] = []
  
  // 遍历所有池查找可包含所有目标装备的池
  for (const poolname of developmentStore.existPool) {
    for (let poolType = 1; poolType <= 3; poolType++) {
      // 找到基础池
      const basePool = developmentStore.developmentPools.find(p => 
        p.开发池名称 === poolname && p.开发池ID === poolType
      )
      
      if (basePool) {
        // 找到兼容池
        const compatiblePools = developmentStore.developmentPools.filter(p => 
          Math.abs(p.开发池ID) === poolType && 
          p.舰ID && basePool.舰ID &&
          basePool.舰ID.every(id => p.舰ID?.includes(id))
        )
        
        // 合并所有兼容池的出货率
        const allDropRates: Record<string, number> = {}
        
        // 特殊处理：为了确保九六式陆攻可选，先收集所有可能的装备
        const allEquipsInPool = new Set<number>()
        for (const pool of compatiblePools) {
          if (pool.出货率) {
            for (const equipIdStr of Object.keys(pool.出货率)) {
              allEquipsInPool.add(Number(equipIdStr))
            }
          }
        }
        
        // 如果九六式陆攻不在已选中列表，但在池中存在，将其添加到可选列表
        if (!has九六式陸攻 && allEquipsInPool.has(168) && 
            selectedEquipIds.every(id => allEquipsInPool.has(id))) {
          if (!possibleEquips.includes(168)) {
            possibleEquips.push(168)
          }
        }
        
        for (const pool of compatiblePools) {
          if (!pool.出货率) continue
          
          if (has九六式陸攻 || pool.开发池ID > 0) {
            // 处理正面池或有九六式陸攻的情况
            for (const [equipIdStr, rate] of Object.entries(pool.出货率)) {
              if (allDropRates[equipIdStr] !== undefined) {
                allDropRates[equipIdStr] += rate
              } else {
                allDropRates[equipIdStr] = rate
              }
            }
          } else {
            // 处理负面池
            for (const equipIdStr of Object.keys(pool.出货率)) {
              if (allDropRates[equipIdStr] === undefined) {
                allDropRates[equipIdStr] = 0
              }
            }
          }
        }
        
        // 检查此池是否有所有目标装备出货
        const availableEquips = Object.keys(allDropRates)
          .filter(idStr => allDropRates[idStr] > 0)
          .map(Number)
        
        // 如果此池包含所有目标装备
        if (selectedEquipIds.every(id => availableEquips.includes(id))) {
          // 将所有装备加入可能列表
          for (const equipIdStr of Object.keys(allDropRates)) {
            const equipId = Number(equipIdStr)
            if (!possibleEquips.includes(equipId)) {
              possibleEquips.push(equipId)
            }
          }
        }
      }
    }
  }
  
  // 更新按钮状态
  for (const key in developmentStore.filterButtonList) {
    const equipId = Number(key)
    // 已选装备保持选中状态，未选装备根据是否在可能列表中决定是否启用
    if (!selectedEquipIds.includes(equipId)) {
      if (possibleEquips.includes(equipId)) {
        // 在可能列表中的装备可选
        developmentStore.filterButtonList[key].select = false
      }
    }
  }
  
  return possibleEquips
}

// 计算装备组总出货率
function calculateTotalRate(equipments: Api_EquipInfo[]): number {
  return equipments.reduce((sum, equip) => 
    sum + (currentPoolEquipments.value[equip.id] || 0), 0)
}

// 获取装备出货率（修改为支持详细格式）
function getEquipRate(equipId: number): string {
  // 如果有详细的出货率变化数据，格式化为类似"6%-4%"的形式
  if (equipRatesDetailMap.value[equipId]) {
    const rates = equipRatesDetailMap.value[equipId]
    
    // 按照正数/负数分组
    const positiveRates: string[] = []
    const negativeRates: string[] = []
    let hasNonZero = false
    
    // 处理每个出率
    for (let i = 0; i < rates.length; i++) {
      if (rates[i] === 0) continue // 跳过0值
      
      hasNonZero = true
      
      if (rates[i] > 0) {
        positiveRates.push(`+${rates[i]}%`)
      } else {
        negativeRates.push(`${rates[i]}%`) // 负数自带负号
      }
    }
    
    // 如果没有非零值，显示0%
    if (!hasNonZero) return '0%'
    
    // 正数在前，负数在后（去掉第一个正数的+号）
    let result = ''
    if (positiveRates.length > 0) {
      result += positiveRates[0].substring(1) // 第一个正数不显示+号
      for (let i = 1; i < positiveRates.length; i++) {
        result += positiveRates[i] // 其他正数保留+号
      }
    }
    
    // 添加所有负数
    for (const rate of negativeRates) {
      result += rate
    }
    
    return result
  }
  
  // 如果没有详细数据，直接返回总和
  return (currentPoolEquipments.value[equipId] || 0) + '%'
}

// 获取装备资源要求文本
function getResourceRequirement(equip: Api_EquipInfo): string {
  let result = ''
  
  if (equip.broken[0] > 1) {
    result += `油${equip.broken[0] * 10} `
  }
  if (equip.broken[1] > 1) {
    result += `弹${equip.broken[1] * 10} `
  }
  if (equip.broken[2] > 1) {
    result += `钢${equip.broken[2] * 10} `
  }
  if (equip.broken[3] > 1) {
    result += `铝${equip.broken[3] * 10} `
  }
  
  return result
}

// 计算装备开发结果，使用更符合C#原版的逻辑
function calculateDevelopmentResults() {
  const targetEquipIds = developmentStore.getSelectedEquipIds()
  
  // 如果没有选中装备，清空结果并返回
  if (targetEquipIds.length === 0) {
    developmentResults.value = []
    return
  }
  
  // 记录结果
  const results: DevelopResult[] = []
  // 记录可能的装备ID
  const possibleEquips: number[] = []
  // 九六式陸攻特殊处理标记
  const hasRadar168 = targetEquipIds.includes(168)
  
  // 针对每个池名称和池类型组合生成可能的结果
  for (const poolname of developmentStore.existPool) {
    for (let poolType = 1; poolType <= 3; poolType++) {
      // 查找具有该名称和ID的基础开发池
      const basePool = developmentStore.developmentPools.find(p => 
        p.开发池名称 === poolname && p.开发池ID === poolType
      )
      
      if (basePool) {
        // 找到与基础池兼容的所有池
        const compatiblePools = developmentStore.developmentPools.filter(p => 
          Math.abs(p.开发池ID) === poolType && 
          p.舰ID && basePool.舰ID &&
          basePool.舰ID.every(id => p.舰ID?.includes(id))
        )
        
        // 合并所有兼容池的出货率
        const allDropRates: Record<string, number> = {}
        
        for (const pool of compatiblePools) {
          if (!pool.出货率) continue
          
          // 正式池或有九六式陸攻时，正常添加出货率
          if (hasRadar168 || pool.开发池ID > 0) {
            for (const [equipIdStr, rate] of Object.entries(pool.出货率)) {
              if (allDropRates[equipIdStr] !== undefined) {
                allDropRates[equipIdStr] += rate
              } else {
                allDropRates[equipIdStr] = rate
              }
            }
          } else {
            // 负ID池只添加零出货率
            for (const equipIdStr of Object.keys(pool.出货率)) {
              if (allDropRates[equipIdStr] === undefined) {
                allDropRates[equipIdStr] = 0
              }
            }
          }
        }
        
        // 检查此池是否包含所有目标装备
        const availableEquipIds = Object.keys(allDropRates)
          .filter(idStr => allDropRates[idStr] > 0)
          .map(Number)
        
        if (targetEquipIds.every(id => availableEquipIds.includes(id))) {
          // 记录所有可能的装备
          for (const equipIdStr of Object.keys(allDropRates)) {
            const equipId = Number(equipIdStr)
            if (!possibleEquips.includes(equipId)) {
              possibleEquips.push(equipId)
            }
          }
          
          // 根据池类型生成公式
          const formulaList: number[][] = []
          
          if (poolType === 1) { // 铝池
            const formula = [10, 10, 10, 10]
            
            // 计算所需最低资源
            for (const targetId of targetEquipIds) {
              const equip = start2Store.equipList[targetId]
              if (equip) {
                for (let i = 0; i < 4; i++) {
                  formula[i] = Math.max(formula[i], equip.broken[i] * 10)
                }
              }
            }
            
            // 铝池：铝必须最高
            if (formula[3] <= formula[0]) formula[3] = formula[0] + 1
            if (formula[3] <= formula[1]) formula[3] = formula[1] + 1
            if (formula[3] <= formula[2]) formula[3] = formula[2] + 1
            
            // 九六式陸攻专用公式
            if (hasRadar168) {
              formula[0] = 240
              formula[1] = 260
              formula[3] = 250
            }
            
            formulaList.push(formula)
          } else if (poolType === 2) { // 弹池
            const formula = [10, 10, 10, 10]
            
            // 计算所需最低资源
            for (const targetId of targetEquipIds) {
              const equip = start2Store.equipList[targetId]
              if (equip) {
                for (let i = 0; i < 4; i++) {
                  formula[i] = Math.max(formula[i], equip.broken[i] * 10)
                }
              }
            }
            
            // 弹池：弹必须最高
            if (formula[1] <= formula[0]) formula[1] = formula[0] + 1
            if (formula[1] <= formula[2]) formula[1] = formula[2] + 1
            if (formula[1] < formula[3]) formula[1] = formula[3]
            
            formulaList.push(formula)
          } else if (poolType === 3) { // 油钢池
            const formula1 = [10, 10, 10, 10]
            const formula2 = [10, 10, 10, 10]
            
            // 计算所需最低资源
            for (const targetId of targetEquipIds) {
              const equip = start2Store.equipList[targetId]
              if (equip) {
                for (let i = 0; i < 4; i++) {
                  formula1[i] = Math.max(formula1[i], equip.broken[i] * 10)
                  formula2[i] = Math.max(formula2[i], equip.broken[i] * 10)
                }
              }
            }
            
            // 检查是否需要特殊处理
            if ((formula1[0] < formula1[1] && formula1[0] < formula1[3]) &&
                (formula1[2] < formula1[1] && formula1[2] < formula1[3])) {
              // 第一方案：油最高
              if (formula1[0] < formula1[1]) formula1[0] = formula1[1]
              if (formula1[0] < formula1[3]) formula1[0] = formula1[3]
              formulaList.push(formula1)
              
              // 第二方案：钢最高
              if (formula2[2] < formula2[1]) formula2[2] = formula2[1]
              if (formula2[2] < formula2[3]) formula2[2] = formula2[3]
              formulaList.push(formula2)
            } else {
              // 无需特殊处理
              formulaList.push(formula1)
            }
          }
          
          // 计算每个公式的结果
          for (const formula of formulaList) {
            // 计算目标装备出货率
            let targetRate = 0
            let otherRate = 0
            
            for (const [equipIdStr, rate] of Object.entries(allDropRates)) {
              const equipId = Number(equipIdStr)
              
              if (targetEquipIds.includes(equipId)) {
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
            
            results.push({
              池名: poolname,
              池ID: poolType,
              公式: [...formula],
              总资源: totalResource,
              出货率: targetRate,
              失败率: failRate,
              池类型: poolType === 1 ? '铝' : poolType === 2 ? '弹' : '油钢'
            })
          }
        }
      }
    }
  }
  
  // 结果排序：先按出货率降序，如果出货率相同则按总资源升序，如果总资源也差不多则按失败率降序
  results.sort((a, b) => {
    if (a.出货率 !== b.出货率) {
      return b.出货率 - a.出货率
    }
    if (Math.abs(a.总资源 - b.总资源) > 1) {
      return a.总资源 - b.总资源
    }
    return b.失败率 - a.失败率
  })
  
  developmentResults.value = results
}

// 替换原来的计算结果方法
function calculateResults() {
  calculateDevelopmentResults()
}

// 选择结果
function selectResult(result: DevelopResult) {
  // 设置所选池
  const pool = availablePools.value.find(p => p.开发池名称 === result.池名)
  if (pool) {
    selectedPool.value = pool
  }
  
  // 设置资源
  resources.value = [...result.公式]
  
  // 更新数据
  updateCurrentPoolEquipments()
}

// 检查装备是否可用
function isEquipmentAvailable(equipId: number): boolean {
  // 如果是已选装备，始终可用
  if (developmentStore.filterButtonList[equipId]?.select) {
    return true
  }
  
  const selectedEquips = developmentStore.getSelectedEquipIds()
  
  // 如果没有选择任何装备，所有装备都可用
  if (selectedEquips.length === 0) {
    return true
  }
  
  // 特殊处理九六式陆攻(ID 168)
  // 如果当前装备是九六式陆攻，需要特殊检查
  if (equipId === 168) {
    // 查找与当前选中装备组合兼容的池
    for (const poolname of developmentStore.existPool) {
      for (let poolType = 1; poolType <= 3; poolType++) {
        // 找到基础池
        const basePool = developmentStore.developmentPools.find(p => 
          p.开发池名称 === poolname && p.开发池ID === poolType
        )
        
        if (basePool) {
          // 找到兼容池
          const compatiblePools = developmentStore.developmentPools.filter(p => 
            Math.abs(p.开发池ID) === poolType && 
            p.舰ID && basePool.舰ID &&
            basePool.舰ID.every(id => p.舰ID?.includes(id))
          )
          
          // 不管池ID是正还是负，只需检查是否含有装备
          const allEquipsInPool = new Set<number>()
          
          for (const pool of compatiblePools) {
            if (pool.出货率) {
              for (const equipIdStr of Object.keys(pool.出货率)) {
                allEquipsInPool.add(Number(equipIdStr))
              }
            }
          }
          
          // 检查此池是否包含所有已选装备和九六式陆攻
          if (selectedEquips.every(id => allEquipsInPool.has(id)) && allEquipsInPool.has(168)) {
            return true
          }
        }
      }
    }
    return false
  }
  
  // 查找与当前选中装备组合兼容的装备
  const has九六式陸攻 = selectedEquips.includes(168)
  
  // 遍历所有池查找可以包含所有目标装备的池
  for (const poolname of developmentStore.existPool) {
    for (let poolType = 1; poolType <= 3; poolType++) {
      // 找到基础池
      const basePool = developmentStore.developmentPools.find(p => 
        p.开发池名称 === poolname && p.开发池ID === poolType
      )
      
      if (basePool) {
        // 找到兼容池
        const compatiblePools = developmentStore.developmentPools.filter(p => 
          Math.abs(p.开发池ID) === poolType && 
          p.舰ID && basePool.舰ID &&
          basePool.舰ID.every(id => p.舰ID?.includes(id))
        )
        
        // 合并所有兼容池的出货率
        const allDropRates: Record<string, number> = {}
        
        for (const pool of compatiblePools) {
          if (!pool.出货率) continue
          
          if (has九六式陸攻 || pool.开发池ID > 0) {
            for (const [equipIdStr, rate] of Object.entries(pool.出货率)) {
              if (allDropRates[equipIdStr] !== undefined) {
                allDropRates[equipIdStr] += rate
              } else {
                allDropRates[equipIdStr] = rate
              }
            }
          } else {
            for (const equipIdStr of Object.keys(pool.出货率)) {
              if (allDropRates[equipIdStr] === undefined) {
                allDropRates[equipIdStr] = 0
              }
            }
          }
        }
        
        // 检查此池是否有所有已选装备的出货
        const availableEquips = Object.keys(allDropRates)
          .filter(idStr => allDropRates[idStr] > 0)
          .map(Number)
        
        if (selectedEquips.every(id => availableEquips.includes(id)) && 
            availableEquips.includes(equipId)) {
          return true
        }
      }
    }
  }
  
  return false
}

// 获取装备图标
function getEquipIcon(equip: Api_EquipInfo | undefined): string | undefined {
  if (!equip) return undefined
  const iconId = equip.types[3]
  return `${import.meta.env.BASE_URL}data/EquipIcon/${iconId}.png`
}

// 在script setup部分添加
const equipRatesDetailMap = ref<Record<number, number[]>>({})
</script>

<style scoped>
.development-view {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.flagship-info {
  margin-bottom: 20px;
}

.flagship-status {
  font-weight: bold;
}

.flagship-status.warning {
  color: red;
}

.main-content {
  display: flex;
  gap: 20px;
}

.left-panel {
  flex: 0 0 45%;
}

.right-panel {
  flex: 0 0 55%;
  display: flex;
  flex-direction: column;
}

.secretary-select {
  margin-bottom: 15px;
}

.secretary-select select {
  width: 300px;
  padding: 5px;
}

.resource-inputs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.resource-group {
  display: flex;
  flex-direction: column;
}

.resource-group label {
  margin-bottom: 5px;
}

.resource-group input {
  width: 60px;
  padding: 5px;
}

.equipment-list {
  margin-top: 20px;
  /* max-height: 500px; */
  overflow-y: auto;
}

.equipment-list table {
  width: 100%;
  border-collapse: collapse;
}

.equipment-list th,
.equipment-list td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.group-header {
  background-color: #f0f0f0;
  font-weight: bold;
}

.target-equipment {
  background-color: #e8f5e9;
}

.insufficient-equipment {
  color: #777;
}

.replaced-equipment {
  color: #aaa;
}

.equipment-filter {
  margin-bottom: 20px;
}

.equipment-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #ddd;
  padding: 10px;
}

.equipment-group {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding-bottom: 10px;
  border-bottom: 1px dashed #ddd;
}

.equipment-group:last-child {
  border-bottom: none;
}

.equipment-buttons button {
  display: flex;
  align-items: center;
  padding: 3px 5px;
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.9em;
}

.equipment-buttons button img {
  width: 24px;
  height: 24px;
  margin-right: 5px;
}

.equipment-buttons button.selected {
  background-color: #e8f5e9;
}

.equipment-buttons button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.development-results {
  margin-top: 20px;
}

.development-results table {
  width: 100%;
  border-collapse: collapse;
}

.development-results th,
.development-results td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.development-results tbody tr {
  cursor: pointer;
}

.development-results tbody tr:hover {
  background-color: #f5f5f5;
}
</style> 