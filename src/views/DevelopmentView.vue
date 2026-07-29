<template>
  <div class="development-view">
    <h2>装备开发</h2>

    <!--
      initializeData() 失败时不渲染主内容——它依赖 developmentPools/
      filterButtonList 等数据，失败时这些要么是空的、要么是上一次成功时
      的旧数据，继续渲染只会展示一个看起来能用、实际上不可信的界面。
    -->
    <div v-if="initFailed" class="init-error">
      装备开发数据加载失败，请刷新页面重试。
    </div>

    <!-- 主要内容区域 -->
    <div v-else class="main-content">
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
        <!--
          type="text" + inputmode="numeric"（而不是 type="number" + v-model.number）：
          number 输入框在拿到值之前就已经用 parseFloat 转换过一遍，非数字字符
          （小数点、e、十六进制的 x、字母……）造成的问题这一层完全看不到、也拦不住。
          这里改成拿原始字符串，在 @input 里剥离非数字字符（见 onResourceInput /
          core/resourceValidation.ts 的 resolveResourceInputText），让非法形式在
          输入阶段就打不出来、粘贴等一次性写入的非法形式被整体拒绝，而不是打完
          再回退或接受剥离结果。
        -->
        <div class="resource-inputs">
          <div class="resource-group">
            <label for="fuel">油</label>
            <input id="fuel" type="text" inputmode="numeric" :value="resources[0]"
              @input="onResourceInput(0, $event)"
              @compositionstart="onCompositionStart"
              @compositionend="onCompositionEnd($event, 0)"
              @blur="normalizeResource(0)">
          </div>

          <div class="resource-group">
            <label for="ammo">弹</label>
            <input id="ammo" type="text" inputmode="numeric" :value="resources[1]"
              @input="onResourceInput(1, $event)"
              @compositionstart="onCompositionStart"
              @compositionend="onCompositionEnd($event, 1)"
              @blur="normalizeResource(1)">
          </div>

          <div class="resource-group">
            <label for="steel">钢</label>
            <input id="steel" type="text" inputmode="numeric" :value="resources[2]"
              @input="onResourceInput(2, $event)"
              @compositionstart="onCompositionStart"
              @compositionend="onCompositionEnd($event, 2)"
              @blur="normalizeResource(2)">
          </div>

          <div class="resource-group">
            <label for="bauxite">铝</label>
            <input id="bauxite" type="text" inputmode="numeric" :value="resources[3]"
              @input="onResourceInput(3, $event)"
              @compositionstart="onCompositionStart"
              @compositionend="onCompositionEnd($event, 3)"
              @blur="normalizeResource(3)">
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
import {
  validateResourceValue,
  applyResourceChange,
  resolveResourceInputText,
  parseResourceInput,
} from '@/core/resourceValidation'

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
// initializeData() 返回 { success: false } 时置位，模板据此不渲染依赖数据的
// 主内容（见上面模板里的 v-if="initFailed"）。
const initFailed = ref(false)

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
// 如实说明覆盖边界：initFailed 这段 onMounted 逻辑本身没有被自动化测试覆盖——
// vitest.config.ts 的 test.environment 是 'node'，没有接入 @vitejs/plugin-vue
// 或 @vue/test-utils，SFC 没法在测试里挂载。developmentStore.initializeData()
// 的返回值契约（success:false 时不缓存、可重试）由 developmentStore.spec.ts
// 覆盖到了生产代码本身；但"View 拿到 success:false 后真的会置位 initFailed、
// 模板真的会据此不渲染主内容"这件事，目前只能靠人工核对，同 tests/oracle.spec.ts
// 与 src/core/orchestration.ts 里记录的"View 接线未被覆盖"是同一类盲区。
// 引入 @vue/test-utils 做组件挂载测试可以补上，本次未引入该依赖。
onMounted(async () => {
  // 初始化开发数据。之前这里不检查返回值，success:false 时照样往下走，
  // 用一份空的/上一次成功时的旧 developmentPools 渲染出一个看起来正常、
  // 实际上数据不可信的界面。现在失败时置位 initFailed，模板据此改成
  // 显示错误状态，不再继续渲染主内容。
  const result = await developmentStore.initializeData()
  if (!result.success) {
    initFailed.value = true
    return
  }

  // 设置初始选择的池
  if (availablePools.value.length > 0) {
    selectedPool.value = availablePools.value[0]
    refreshCurrentPool()
  }

  // 初始计算
  refreshResults()
})

// 监听资源变化，更新结果。
// 输入框的 @input（onResourceInput）已经把非数字字符剥离在先，正常输入路径下
// 这里基本不会再拿到非整数；但 resources 也可能被别处整体替换（如 selectResult
// 应用配方结果、或空输入被转换成的 NaN），这里仍先做一遍整数判断兜底——
// 有非整数项就整体回退且本轮不重算（回退会再触发一次本 watcher，用纠正后的
// 整数值重算），避免非法值在被纠正前先用错误值算出一次结果。
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

// 资源输入框类型，兼容 IME 组合输入状态标记（composing 由 compositionstart/end 维护，
// 做法与 Vue 内置的 v-model 文本输入指令一致：组合输入期间的中间态 input 事件不处理，
// 只在 compositionend 时用最终文本处理一次，避免中文/日文等 IME 候选过程中的中间
// 字符被当成"用户输入"提前剥离/写回，导致候选框行为异常或输入被打断）。
type ComposingInput = HTMLInputElement & { composing?: boolean }

function onCompositionStart(event: Event) {
  (event.target as ComposingInput).composing = true
}

function onCompositionEnd(event: Event, index: number) {
  const target = event.target as ComposingInput
  if (!target.composing) return
  target.composing = false
  onResourceInput(index, event)
}

// 资源输入框的 @input：从源头把非数字字符剥离掉，让 "100.0"/"1e2"/"0x64"/
// "100abc" 这类非法形式在输入阶段就不成立，而不是等进了 resources 数组、
// 触发一次错误重算之后再回退纠正。
//
// resolveResourceInputText 区分了两种情形（详见其定义处注释）：
// - 逐字符键入混入单个非法字符（比如敲了一下 "."）：清洗结果等于打这个字符
//   之前的文本，效果是"这一下按键被吃掉"，不影响已经打出来的数字。
// - 一次性写入（典型是粘贴）混入非法字符（比如粘贴 "10.5"）：不能接受剥离
//   出来的 "105"——那是用户没打过、也不会预期的数字。这种情况整体拒绝，
//   回退到上一个合法值，等价于"这次输入完全没有发生"。
// 两种情形用同一次判断产出同一个文本，再据此同步写 DOM 与 resources，
// 两者不会脱节。
//
// 之所以手动 :value + @input 而不是 v-model：需要把最终确定的文本立即写回
// DOM（`target.value = text`）。这里不能只依赖 Vue 的响应式重渲染来纠正
// 显示——转换出的 number 可能不变（比如当前是 100，又输入一个 "." 变成
// "100."，剥离后还是 "100"，number 值没变），此时如果不在这里手动纠正，
// 浏览器会一直显示用户刚输入的非法字符 "100."。
function onResourceInput(index: number, event: Event) {
  const target = event.target as ComposingInput
  if (target.composing) return
  const text = resolveResourceInputText(target.value, String(lastValid.value[index]))
  target.value = text
  resources.value[index] = parseResourceInput(text)
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

.init-error {
  padding: 1rem;
  background-color: #ffebeb;
  border-radius: 4px;
  color: #d9534f;
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