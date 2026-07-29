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

        <FlagshipSearch :matched="flagshipMatched" @select="onFlagshipSelect" />

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
              <template v-if="groupedEquipments.showTarget">
                <tr class="group-header">
                  <td></td>
                  <td>目标装备</td>
                  <td>{{ groupedEquipments.targetTotal }}%</td>
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
              <template v-if="groupedEquipments.showOther">
                <tr class="group-header">
                  <td></td>
                  <td>其它装备</td>
                  <td>{{ groupedEquipments.otherTotal }}%</td>
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
              <template v-if="groupedEquipments.showInsufficient">
                <tr class="group-header">
                  <td></td>
                  <td>资源不足导致失败</td>
                  <td>{{ groupedEquipments.insufficientTotal }}%</td>
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
              <template v-if="groupedEquipments.showReplaced">
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
                    'disabled': !developmentStore.filterButtonList[equipId].enabled
                  }"
                  :disabled="!developmentStore.filterButtonList[equipId].enabled && !developmentStore.filterButtonList[equipId].select"
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
                <td>{{ poolTypeLabel(result.池ID) }}</td>
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
import FlagshipSearch from '@/components/FlagshipSearch.vue'
import type { Api_EquipInfo } from '@/types/equipTypes'
import type { DevelopResult, Resources } from '@/core/types'
import { poolTypeLabel } from '@/core/types'
import type { DevelopmentPoolClass } from '@/core/developmentPool'
import { computePoolRates, computeRecipes } from '@/core/orchestration'
import { formatRateDetail, sortEquipIds, groupEquipmentsWithVisibility } from '@/core/grouping'
import { computeEnabledEquipIds } from '@/core/enabledSet'
import { validateResourceValue, applyResourceChange } from '@/core/resourceValidation'

// 获取 store
const developmentStore = useDevelopmentStore()
const start2Store = useStart2Store()

// Pinia 的 setup store 经由 Vue 的 UnwrapRef 暴露 developmentPools 时，
// 会把类里的 private 字段（DevelopmentPoolClass.text）从映射类型里丢掉，
// 导致暴露出来的元素类型结构上不再是 DevelopmentPoolClass。
// 运行时仍是 createPools() 生成的真实实例，这里只是让类型对齐事实。
const pools = () => developmentStore.developmentPools as unknown as DevelopmentPoolClass[]

// 状态数据
const selectedPool = ref<DevelopmentPoolClass | null>(null)
const resources = ref<number[]>([10, 10, 10, 10])
// 上一个通过整数校验的资源值，供小数/空值输入回退时使用。
const lastValid = ref<number[]>([10, 10, 10, 10])
const currentPoolEquipments = ref<Record<number, number>>({})
const equipRatesDetailMap = ref<Record<number, number[]>>({})
const developmentResults = ref<DevelopResult[]>([])

const availablePools = computed(() => {
  // 使用Map对相同开发池名称进行去重
  const poolMap = new Map<string, DevelopmentPoolClass>()

  pools()
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
const flagshipPoolName = ref<string | null>(null)
const flagshipMatched = computed(
  () => !flagshipPoolName.value || flagshipPoolName.value === selectedPool.value?.开发池名称,
)

function onFlagshipSelect(payload: { pool: DevelopmentPoolClass; shipName: string }) {
  flagshipPoolName.value = payload.pool.开发池名称
  const target = developmentStore.developmentPools.find(
    (p) => p.开发池名称 === payload.pool.开发池名称 && p.开发池ID >= 0 && !p.最低资源,
  )
  if (target) {
    selectedPool.value = target
    refreshCurrentPool()
    refreshResults()
    refreshEnabled()
  }
}

// 判断是否有选中的装备
const hasSelectedEquipments = computed(() => {
  return developmentStore.getSelectedEquipIds().length > 0
})
// 分组 + 各组是否应显示，一并在这里算好，模板只读现成值（不重复遍历/重复求和）。
const groupedEquipments = computed(() => {
  const targets = new Set(developmentStore.getSelectedEquipIds())
  const ids = sortEquipIds(
    Object.keys(currentPoolEquipments.value).map(Number), start2Store.equipList,
  )
  return groupEquipmentsWithVisibility<Api_EquipInfo>(
    ids, start2Store.equipList, currentPoolEquipments.value, resources.value, targets,
  )
})

const targetEquipments = computed(() => groupedEquipments.value.target)
const otherEquipments = computed(() => groupedEquipments.value.other)
const insufficientEquipments = computed(() => groupedEquipments.value.insufficient)
const replacedEquipments = computed(() => groupedEquipments.value.replaced)

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
  
  // 按参考实现的排序方式：types[2] → types[3] → id
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
function refreshCurrentPool() {
  if (!selectedPool.value) return
  const res = resources.value as unknown as Resources
  const { totals, details } = computePoolRates(
    pools(), selectedPool.value as unknown as DevelopmentPoolClass, res,
  )
  currentPoolEquipments.value = totals
  equipRatesDetailMap.value = details
}

function refreshResults() {
  const targets = developmentStore.getSelectedEquipIds()
  developmentResults.value = computeRecipes(
    pools(), developmentStore.existPool, targets, start2Store.equipList,
  )
}

function refreshEnabled() {
  const targets = developmentStore.getSelectedEquipIds()
  const enabled = new Set(
    computeEnabledEquipIds(
      pools(), developmentStore.existPool, targets,
    ),
  )
  for (const key of Object.keys(developmentStore.filterButtonList)) {
    const id = Number(key)
    developmentStore.filterButtonList[id].enabled = targets.length === 0 || enabled.has(id)
  }
}

// 初始化数据
onMounted(async () => {
  // 初始化开发数据
  await developmentStore.initializeData()

  // 设置初始选择的池
  if (availablePools.value.length > 0) {
    selectedPool.value = availablePools.value[0]
    refreshCurrentPool()
  }

  // 初始计算
  refreshResults()
})

// 监听资源变化，更新结果。
// v-model.number 每次按键都会把当前输入（哪怕是小数）直接写进 resources，
// 早于 @blur 触发的整数校验；这里先做一遍整数判断——有非整数项就整体回退且
// 本轮不重算（回退会再触发一次本 watcher，用纠正后的整数值重算），
// 避免小数在被纠正前先用错误值算出一次结果。
watch(resources, () => {
  const result = applyResourceChange(resources.value, lastValid.value)
  lastValid.value = result.lastValid
  if (result.revertedResources) {
    resources.value = result.revertedResources
    return
  }
  refreshCurrentPool()
  refreshResults()
  refreshEnabled()
}, { deep: true })

// 切换池
function onPoolChanged() {
  refreshCurrentPool()
  refreshResults()
  refreshEnabled()
}

// 验证资源输入（失焦时的兜底夹紧；watcher 已经把非整数拦在前面了）
function validateResource(index: number) {
  const validated = validateResourceValue(resources.value[index], lastValid.value[index])
  resources.value[index] = validated
  lastValid.value[index] = validated
}

// 标准化资源输入（失焦时）
function normalizeResource(index: number) {
  validateResource(index)
  refreshCurrentPool()
  refreshResults()
  refreshEnabled()
}

// 切换装备选择状态
function toggleEquipment(equipId: number) {
  // 守卫必须与模板 :disabled 的表达式**对称**（`!enabled && !select`）。
  // 只写 `!enabled` 会让「已选中但当前组合下不可用」的装备无法取消 ——
  // 而模板并没有真的禁用它（保留了 !select 那一半），
  // 于是表现为「按钮能点、点了没反应」，比直接禁用更糟。
  // 这种状态在真实数据下可达，见 enabledSet 的
  // 「联合准入失败时启用集合可以不含已选装备本身」一测。
  const state = developmentStore.filterButtonList[equipId]
  if (!state || (!state.enabled && !state.select)) return

  developmentStore.toggleEquipmentSelect(equipId)
  refreshEnabled()
  refreshResults()

  // ⚠️ 刻意偏离参考实现：参考实现在按钮 Click 末尾只重算列表，
  // 改资源只发生在用户主动点击结果行时（listView2_SelectedIndexChanged）。
  // 这里自动应用第一条公式是本项目有意保留的交互改进，经决策确认，非移植遗漏。
  // 代价：会覆盖用户手动输入的资源值。
  if (developmentResults.value.length > 0) {
    selectResult(developmentResults.value[0])
  }
}

function getEquipRate(equipId: number): string {
  const detail = equipRatesDetailMap.value[equipId]
  if (detail) return formatRateDetail(detail, '%')
  return `${currentPoolEquipments.value[equipId] ?? 0}%`
}

function getResourceRequirement(equip: Api_EquipInfo): string {
  const labels = ['油', '弹', '钢', '铝']
  let out = ''
  for (let i = 0; i < 4; i++)
    if (equip.broken[i] > 1) out += `${labels[i]}${equip.broken[i] * 10} `
  return out
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
  refreshCurrentPool()
  refreshEnabled()
}

// 获取装备图标
function getEquipIcon(equip: Api_EquipInfo | undefined): string | undefined {
  if (!equip) return undefined
  const iconId = equip.types[3]
  return `${import.meta.env.BASE_URL}data/EquipIcon/${iconId}.png`
}
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