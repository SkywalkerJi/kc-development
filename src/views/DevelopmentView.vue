<template>
  <div class="development-view">
    <h2>{{ $t('title.development') }}</h2>

    <!--
      initializeData() 失败时不渲染主内容——它依赖 developmentPools/
      filterButtonList 等数据，失败时这些要么是空的、要么是上一次成功时
      的旧数据，继续渲染只会展示一个看起来能用、实际上不可信的界面。
    -->
    <div v-if="initFailed" class="init-error">
      {{ $t('error.initFailed') }}
    </div>

    <!-- 主要内容区域 -->
    <div v-else class="main-content">
      <div class="left-panel">
        <!-- 秘书舰类型选择 -->
        <div class="secretary-select">
          <label for="poolSelect">{{ $t('label.secretaryType') }}</label>
          <select id="poolSelect" v-model="selectedPool" @change="onPoolChanged">
            <option v-for="pool in availablePools" :key="pool.开发池名称" :value="pool">
              {{ poolName(pool.开发池名称) }}({{ describePool(pool) }})
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
            <label for="fuel">{{ $t('label.fuel') }}</label>
            <input id="fuel" type="text" inputmode="numeric" :value="rawResourceText[0]"
              @input="onResourceInput(0, $event)"
              @compositionstart="onCompositionStart"
              @compositionend="onCompositionEnd($event, 0)"
              @blur="normalizeResource(0)">
          </div>

          <div class="resource-group">
            <label for="ammo">{{ $t('label.ammo') }}</label>
            <input id="ammo" type="text" inputmode="numeric" :value="rawResourceText[1]"
              @input="onResourceInput(1, $event)"
              @compositionstart="onCompositionStart"
              @compositionend="onCompositionEnd($event, 1)"
              @blur="normalizeResource(1)">
          </div>

          <div class="resource-group">
            <label for="steel">{{ $t('label.steel') }}</label>
            <input id="steel" type="text" inputmode="numeric" :value="rawResourceText[2]"
              @input="onResourceInput(2, $event)"
              @compositionstart="onCompositionStart"
              @compositionend="onCompositionEnd($event, 2)"
              @blur="normalizeResource(2)">
          </div>

          <div class="resource-group">
            <label for="bauxite">{{ $t('label.bauxite') }}</label>
            <input id="bauxite" type="text" inputmode="numeric" :value="rawResourceText[3]"
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
                <th>{{ $t('label.icon') }}</th>
                <th>{{ $t('label.equipment') }}</th>
                <th>{{ $t('label.hitRate') }}</th>
                <th>{{ $t('label.minResourceReq') }}</th>
              </tr>
            </thead>
            <tbody>
              <!-- 目标装备组 -->
              <template v-if="groupedEquipments.showTarget">
                <tr class="group-header">
                  <td></td>
                  <td>{{ $t('group.target') }}</td>
                  <td>{{ groupedEquipments.targetTotal }}%</td>
                  <td></td>
                </tr>
                <tr v-for="equip in targetEquipments" :key="equip.id" class="target-equipment">
                  <td><img v-if="getEquipIcon(equip)" :src="getEquipIcon(equip)" :alt="$t('alt.equipIcon')" /></td>
                  <td>{{ equipName(equip.id) }}</td>
                  <td>{{ getEquipRate(equip.id) }}</td>
                  <td>{{ getResourceRequirement(equip) }}</td>
                </tr>
              </template>

              <!-- 其他可出货装备 -->
              <template v-if="groupedEquipments.showOther">
                <tr class="group-header">
                  <td></td>
                  <td>{{ $t('group.other') }}</td>
                  <td>{{ groupedEquipments.otherTotal }}%</td>
                  <td></td>
                </tr>
                <tr v-for="equip in otherEquipments" :key="equip.id">
                  <td><img v-if="getEquipIcon(equip)" :src="getEquipIcon(equip)" :alt="$t('alt.equipIcon')" /></td>
                  <td>{{ equipName(equip.id) }}</td>
                  <td>{{ getEquipRate(equip.id) }}</td>
                  <td>{{ getResourceRequirement(equip) }}</td>
                </tr>
              </template>

              <!-- 资源不足装备 -->
              <template v-if="groupedEquipments.showInsufficient">
                <tr class="group-header">
                  <td></td>
                  <td>{{ $t('group.insufficient') }}</td>
                  <td>{{ groupedEquipments.insufficientTotal }}%</td>
                  <td></td>
                </tr>
                <tr v-for="equip in insufficientEquipments" :key="equip.id" class="insufficient-equipment">
                  <td><img v-if="getEquipIcon(equip)" :src="getEquipIcon(equip)" :alt="$t('alt.equipIcon')" /></td>
                  <td>{{ equipName(equip.id) }}</td>
                  <td>{{ getEquipRate(equip.id) }}</td>
                  <td>{{ getResourceRequirement(equip) }}</td>
                </tr>
              </template>

              <!-- 全部被替换装备 -->
              <template v-if="groupedEquipments.showReplaced">
                <tr class="group-header">
                  <td></td>
                  <td>{{ $t('group.replaced') }}</td>
                  <td>0%</td>
                  <td></td>
                </tr>
                <!--
                  出货率列与另外三组一样走 getEquipRate，**不能**写死 "0%"：
                  参考实现在分组之前就为每一件装备算好了逐池明细串，本组的行
                  同样带着它。本组的特征是「合计为 0」，不是「明细为 0」——
                  典型形态是 2%-2%、4%-2%-2% 这种正负相抵的叠加过程，恰恰是
                  这一组存在的理由（哪个池加了、哪个池又把它减没了）。
                  上面组头的 "0%" 则是对的，参考实现那里就是个固定字符串。
                -->
                <tr v-for="equip in replacedEquipments" :key="equip.id" class="replaced-equipment">
                  <td><img v-if="getEquipIcon(equip)" :src="getEquipIcon(equip)" :alt="$t('alt.equipIcon')" /></td>
                  <td>{{ equipName(equip.id) }}</td>
                  <td>{{ getEquipRate(equip.id) }}</td>
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
          <h3>{{ $t('panel.equipFilter') }}</h3>
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
                    :alt="$t('alt.equipIcon')"
                  />
                  {{ equipName(Number(equipId)) }}
                </button>
              </div>
            </template>
          </div>
        </div>
        
        <!-- 可用公式区域 -->
        <div class="development-results">
          <h3>{{ $t('panel.recipes') }}</h3>
          <table v-if="hasSelectedEquipments">
            <thead>
              <tr>
                <th
                  v-for="col in RESULT_COLUMNS"
                  :key="col.key"
                  class="sortable"
                  :aria-sort="sortColumn === col.key ? (sortAsc ? 'ascending' : 'descending') : 'none'"
                  @click="onResultHeaderClick(col.key)"
                >
                  {{ col.label }}<span v-if="sortColumn === col.key">{{ sortAsc ? ' ▲' : ' ▼' }}</span>
                </th>
              </tr>
            </thead>
            <!--
              行是一个**选择控件**，不是纯 click 靶子：参考实现这里是个列表
              控件，「应用配方」挂在选中项变化上，所以键盘方向键同样能用，
              而再次点选已选中的行不会触发（用户手工改过的资源不被重复覆盖）。
              这两条语义都由 selectResultAt 的「同一行则不触发」保证。
            -->
            <tbody @keydown="onResultKeydown">
              <tr
                v-for="(result, index) in sortedResults"
                :key="index"
                tabindex="0"
                role="row"
                :aria-selected="result === selectedResult"
                :class="{ 'result-selected': result === selectedResult }"
                @click="selectResultAt(index)"
              >
                <td v-for="col in RESULT_COLUMNS" :key="col.key">{{ col.display(result) }}</td>
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
import { t, t as $t, equipName, poolName, shipName, ctypeName, stypeName, descWordSep } from '@/i18n'
import { formatPoolDescriptor } from '@/core/poolDescriptor'
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

const pools = () => developmentStore.developmentPools

// 名称查询以对象注入 core 的纯函数，core 层因此不依赖 i18n 模块。
//
// t 可以直接传：DescriptorCtx.t 的参数类型 DescMsgKey（core/poolDescriptor.ts）
// 是 MsgKey 的子集，而 i18n 的 t 签名是 (key: MsgKey) => string——参数类型
// 是逆变位置，「认所有 MsgKey」的函数天然能当「只认 DescMsgKey 子集」的函数
// 用，不需要再转手一次包一层断言。
const descriptorCtx = { t, shipName, ctypeName, stypeName, wordSep: descWordSep }

/** 下拉框里池名后面括号里的筛选条件描述，见 core/poolDescriptor.ts。 */
function describePool(pool: DevelopmentPoolClass): string {
  return formatPoolDescriptor(pool.descriptor, descriptorCtx)
}

// 状态数据
const selectedPool = ref<DevelopmentPoolClass | null>(null)
// 拆分「输入框原始值」与「已提交的合法资源」，理由见下面 watch(rawResources, ...)
// 前的大段注释：computed（groupedEquipments）依赖 resources.value 时，watch 门禁
// 只能拦住"要不要调用 refresh*()"，拦不住 computed 自己重算——越界值必须在结构上
// 就到不了被 computed/refresh* 读取的那个状态，而不是在下游设卡。
//
// - rawResources：输入框里正在编辑的原始值，只被模板的 input 读写（onResourceInput/
//   validateResource），可以短暂越界或非整数。
// - committedResources：已通过校验的合法资源，groupedEquipments、refreshCurrentPool
//   等全部只读这个。写入时机见 watch(rawResources, ...) 与 normalizeResource。
const rawResources = ref<number[]>([10, 10, 10, 10])
/**
 * 输入框里**正在显示的文本**。
 *
 * 必须与 rawResources 分开：空输入框是合法的编辑中间态（参考实现允许文本框
 * 在失焦之前处于空/非法状态），而 rawResources 是 number[]，表达不了「空」。
 * 此前把「空」只留在 DOM 上，结果是任何一次与输入框无关的重渲染都会把它
 * 回填成旧数字 —— Vue 对 value 这个 prop 是**每次重渲染都重新 patch** 的，
 * 且比较的是 DOM 当前值与新值，空框必然被写回。
 */
const rawResourceText = ref<string[]>(['10', '10', '10', '10'])
const committedResources = ref<number[]>([10, 10, 10, 10])
// 上一个通过整数校验的资源值，供小数/空值输入回退时使用。
const lastValid = ref<number[]>([10, 10, 10, 10])
const currentPoolEquipments = ref<Record<number, number>>({})
const equipRatesDetailMap = ref<Record<number, number[]>>({})
const developmentResults = ref<DevelopResult[]>([])
/**
 * 「可用公式」表当前选中的那一条结果。
 *
 * ⚠️ 存的是**结果对象本身**，不是显示下标。参考实现那里是个列表控件，选中
 * 状态跟着**项**走：排序只是重排显示位置，选中的还是同一项，因此不会触发
 * 「选中项变化」、也就不会重新应用配方。若这里存下标，排序后同一条逻辑配方
 * 换了位置，就会被当成「选中项变了」而重新应用 —— 把用户手改的资源覆盖掉。
 *
 * 只有结果集合被整体替换（refreshResults）时才清空。
 */
const selectedResult = ref<DevelopResult | null>(null)
/** 当前排序列的 key；null = 不排序，按 computeRecipes 产出的默认顺序展示。 */
const sortColumn = ref<string | null>(null)
const sortAsc = ref(true)

/**
 * 「可用公式」表的列定义 —— 表头、单元格、排序取值共用这一份，避免三处各写
 * 一遍再逐渐对不上。
 *
 * `value` 供排序用，`display` 供渲染用；两者分开是因为**数值列必须按数值排**。
 * ⚠️ 参考实现这里有个缺陷：它的列排序器从未被填充过，于是所有列都退化成
 * 字符串比较，「总资源」会排成 101 → 121 → 90、「出货率」会排成
 * "10%","12%","2%"。这是刻意不复刻的一处 —— 与其它「参考实现会崩/结果明显
 * 不合理、web 修正」的地方同一处置原则。
 *
 * **必须是 computed** —— label 与「秘书舰」「池类型」两列的取值都要随语言
 * 变化，写成常量数组的话切换语言后表头不会更新。
 *
 * ⚠️「秘书舰」列的 value/display 都要过 poolName()：r.池名 是中文身份键，
 * 不翻的话整列在任何语言下都是中文。它同时意味着这一列按译名排序，
 * 顺序随语言变化 —— 这是正确行为。
 */
interface ResultColumn {
  key: string
  label: string
  value: (r: DevelopResult) => number | string
  display: (r: DevelopResult) => string
}
const RESULT_COLUMNS = computed<ResultColumn[]>(() => [
  { key: 'pool', label: t('label.secretary'), value: (r) => poolName(r.池名), display: (r) => poolName(r.池名) },
  { key: 'fuel', label: t('label.fuel'), value: (r) => r.公式[0], display: (r) => String(r.公式[0]) },
  { key: 'ammo', label: t('label.ammo'), value: (r) => r.公式[1], display: (r) => String(r.公式[1]) },
  { key: 'steel', label: t('label.steel'), value: (r) => r.公式[2], display: (r) => String(r.公式[2]) },
  { key: 'bauxite', label: t('label.bauxite'), value: (r) => r.公式[3], display: (r) => String(r.公式[3]) },
  { key: 'total', label: t('label.totalResource'), value: (r) => r.总资源, display: (r) => String(r.总资源) },
  {
    key: 'type', label: t('label.poolType'),
    value: (r) => t(poolTypeLabel(r.池ID)), display: (r) => t(poolTypeLabel(r.池ID)),
  },
  { key: 'hit', label: t('label.hitRate'), value: (r) => r.出货率, display: (r) => `${r.出货率}%` },
  { key: 'fail', label: t('label.failRate'), value: (r) => r.失败率, display: (r) => `${r.失败率}%` },
])

/**
 * 展示用的结果列表。未点表头时就是 computeRecipes 的默认顺序（那一份复刻了
 * 参考实现的比较器）；点了表头才按该列重排。
 *
 * Array.prototype.sort 自 ES2019 起保证稳定，所以同值的行会保持默认顺序。
 */
const sortedResults = computed(() => {
  const col = RESULT_COLUMNS.value.find((c) => c.key === sortColumn.value)
  if (!col) return developmentResults.value
  const dir = sortAsc.value ? 1 : -1
  return [...developmentResults.value].sort((a, b) => {
    const va = col.value(a)
    const vb = col.value(b)
    if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb)
    // 字符串列复刻参考实现的比较方式：大小写不敏感的 ordinal（按 UTF-16
    // 码元逐个比），**不是**按拼音的本地化比较。
    // 数值列偏离参考实现是因为那里确实是缺陷（数值被当字符串排，总资源会
    // 排成 101 → 121 → 90）；字符串列没有缺陷可修，换成拼音序只是换了一种
    // 排法，属于无理由的偏离。若哪天决定按拼音排，要作为一条有意偏离记进文档。
    const x = String(va).toUpperCase()
    const y = String(vb).toUpperCase()
    return dir * (x < y ? -1 : x > y ? 1 : 0)
  })
})

/** 点表头：同一列切换升/降序，换列则从升序开始。 */
function onResultHeaderClick(key: string) {
  if (sortColumn.value === key) sortAsc.value = !sortAsc.value
  else {
    sortColumn.value = key
    sortAsc.value = true
  }
  // **不要**在这里清空选中项：排序只改变显示位置，选中的还是同一条结果。
  // 清空的话，用户排完序再点回那一条，会被当成「新选中」而重新应用配方，
  // 把手改过的资源覆盖掉。选中态存的是结果对象，排序后自动跟着走。
}
// initializeData() 返回 { success: false } 时置位，模板据此不渲染依赖数据的
// 主内容（见上面模板里的 v-if="initFailed"）。
const initFailed = ref(false)

// 下拉框候选池直接用 store 产出的那一份 —— 准入条件（名称未重复、非负 ID、
// 无最低资源门槛）只在 readCtypeAndPools 里写一次。此前这里把同一套条件又
// 重写了一遍再按名称去重，是同一份规则的第二个真值源。
const availablePools = computed(() => developmentStore.selectablePools)
const flagshipPoolName = ref<string | null>(null)
const flagshipMatched = computed(
  () => !flagshipPoolName.value || flagshipPoolName.value === selectedPool.value?.开发池名称,
)

function onFlagshipSelect(payload: { pool: DevelopmentPoolClass }) {
  flagshipPoolName.value = payload.pool.开发池名称
  const target = developmentStore.developmentPools.find(
    (p) => p.开发池名称 === payload.pool.开发池名称 && p.开发池ID >= 0 && !p.最低资源,
  )
  if (target) {
    selectedPool.value = target
    // 只有正向路径依赖所选池，理由同 onPoolChanged
    refreshCurrentPool()
  }
}

// 判断是否有选中的装备
const hasSelectedEquipments = computed(() => {
  return developmentStore.getSelectedEquipIds().length > 0
})
// 分组 + 各组是否应显示，一并在这里算好，模板只读现成值（不重复遍历/重复求和）。
// 依赖 committedResources 而不是 rawResources——这是本次拆分要保证的关键点：
// 输入框里越界但还没失焦的值不经过这里，分组结果不会被没提交的值改变。
const groupedEquipments = computed(() => {
  const targets = new Set(developmentStore.getSelectedEquipIds())
  const ids = sortEquipIds(
    Object.keys(currentPoolEquipments.value).map(Number), start2Store.equipList,
  )
  return groupEquipmentsWithVisibility<Api_EquipInfo>(
    ids, start2Store.equipList, currentPoolEquipments.value, committedResources.value, targets,
  )
})

const targetEquipments = computed(() => groupedEquipments.value.target)
const otherEquipments = computed(() => groupedEquipments.value.other)
const insufficientEquipments = computed(() => groupedEquipments.value.insufficient)
const replacedEquipments = computed(() => groupedEquipments.value.replaced)

/**
 * 装备按钮的分组与顺序。
 *
 * ⚠️ 这里是按钮顺序的**唯一**产出点。`filterButtonList` 是个以装备 id 为键的
 * 普通对象，而 JS 对整数样键一律按数值升序枚举、与写入顺序无关 —— 也就是说
 * 无论 store 里以什么顺序写入，读出来都是按 id 升序。参考实现的按钮顺序是
 * types[2] → types[3] → id，所以必须在读出之后重新排一次。
 * 删掉下面这次 sortEquipIds 会让按钮顺序**静默**退化成按 id 升序。
 *
 * 排序用 core 的 sortEquipIds，不要在这里另写一份：此前的内联版本在装备查
 * 不到时 `return 0`（把未知装备与所有装备都判为相等），破坏了比较器的传递性。
 *
 * 分组按 types[2] 切分。参考实现是「相邻两项 types[2] 不同就换行」，因为列表
 * 已按 types[2] 首键排序，这与「按 types[2] 分桶后升序输出」等价。
 */
const equipmentGroups = computed(() => {
  const ids = sortEquipIds(
    Object.keys(developmentStore.filterButtonList).map(Number), start2Store.equipList,
  )

  const groups: number[][] = []
  let currentType: number | null = null
  for (const id of ids) {
    const equip = start2Store.equipList[id]
    if (!equip) continue
    if (equip.types[2] !== currentType) {
      currentType = equip.types[2]
      groups.push([])
    }
    groups[groups.length - 1].push(id)
  }
  return groups
})

// 初始化数据
function refreshCurrentPool() {
  if (!selectedPool.value) return
  const res = committedResources.value as unknown as Resources
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
  // 列表整体换了，旧下标不再指向同一条结果，必须重置 —— 否则「同一行不重复
  // 触发」的判断会拿旧下标去比新列表。排序状态也要一并复位：参考实现在
  // 改选装备时会把列表控件的排序器清掉，回到默认顺序。
  selectedResult.value = null
  sortColumn.value = null
  sortAsc.value = true
}

function refreshEnabled() {
  const targets = developmentStore.getSelectedEquipIds()

  // 没有选中任何装备 → 全部可用，直接置位。参考实现在这条分支上同样不做
  // 任何池遍历；而 computeEnabledEquipIds 在 targets 为空时会把全部池都
  // 走一遍（结果必然是「全部装备」），算完又被下面的判断整个丢掉。
  if (targets.length === 0) {
    for (const key of Object.keys(developmentStore.filterButtonList))
      developmentStore.filterButtonList[Number(key)].enabled = true
    return
  }

  const enabled = new Set(
    computeEnabledEquipIds(
      pools(), developmentStore.existPool, targets,
    ),
  )
  for (const key of Object.keys(developmentStore.filterButtonList)) {
    const id = Number(key)
    const state = developmentStore.filterButtonList[id]
    // 参考实现只更新**未选中**的按钮，已选中的 Enabled 保持不动。
    // 这不是小事：联合准入失败时启用集合会变成空集（真实数据下可达，
    // 例如先选 A 再选 B，而没有任何池能同时出这两件），此时若把已选按钮
    // 也写成 false，它们会带上 disabled 样式渲染成半透明灰态 ——
    // 视觉上告诉用户「你刚点的目标不可用」，而参考实现里这两个按钮恰恰是
    // 当时唯一没变灰的。
    // 顺带保证了「已选 ⟹ enabled 为 true」这条不变式（按钮不可用就点不进来），
    // 于是模板里 :class 的 !enabled 与 :disabled 的 !enabled && !select
    // 不会再打架。
    if (state.select) continue
    state.enabled = enabled.has(id)
  }
}

// 初始化数据
// 覆盖边界：src/views/__tests__/DevelopmentView.spec.ts 现在会用 vitest.config.ts
// 里接入的 @vitejs/plugin-vue + 按文件声明的 jsdom 环境真实挂载这个 SFC（不需要
// @vue/test-utils，vue 自带的编译产物 + createApp().mount() 已经够用），
// 覆盖了 groupedEquipments/refreshCurrentPool 的实参接线（committedResources
// 是否真的被正确传给 core 层函数）。但那份测试为了避免依赖真实的
// fetch(start2.json)/fetch(DevelopmentPool.json) 等大数据文件，直接 mock 了
// developmentStore.initializeData() 的返回值，不经过这里的 onMounted 真实调用
// 它、也不构造 success:false 的场景——所以"View 拿到 success:false 后真的会
// 置位 initFailed、模板真的会据此不渲染主内容"这条路径本身仍未被自动化测试
// 覆盖，目前仍只能靠人工核对。developmentStore.initializeData() 的返回值契约
// （success:false 时不缓存、可重试）由 developmentStore.spec.ts 覆盖到了。
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

// 监听输入框原始值的变化，决定是否把它提交为 committedResources（→ 触发重算）。
//
// 这是本次拆分要保证的核心：groupedEquipments/refreshCurrentPool 等只读
// committedResources，越界或非整数的 rawResources 在这里被挡下时，
// committedResources 根本不会被写入新值——不是"重算函数没被调用"这种控制流
// 层面的门禁（那挡不住 computed 依赖 rawResources 自己重算），而是数据流层面
// 越界值压根不会出现在被依赖的那个状态里。
//
// 输入框的 @input（onResourceInput）已经把非数字字符剥离在先，正常输入路径下
// 这里基本不会再拿到非整数；但 rawResources 也可能被别处整体替换（如
// selectResult 应用配方结果、或空输入被转换成的 NaN），这里仍先做一遍整数
// 判断兜底——有非整数项就整体回退且本轮不提交（回退会再触发一次本 watcher，
// 用纠正后的整数值重新判断），避免非法值在被纠正前先用错误值提交一次。
//
// result.recompute 为 false 且 revertedResources 为 null 时，是"全部是整数但
// 存在越界项"（比如刚打完还没失焦的 "500"）：rawResources 保持原样（用户能
// 看到自己打的 500，因为模板绑的是 rawResources），但不写入 committedResources、
// 也不重算——要等失焦时 normalizeResource 把它夹回 [10,300] 之后才无条件提交
// 并重算（normalizeResource 不受这里的 recompute 门槛影响）。
watch(rawResources, () => {
  const result = applyResourceChange(rawResources.value, lastValid.value)
  lastValid.value = result.lastValid
  if (result.revertedResources) {
    rawResources.value = result.revertedResources
    rawResourceText.value = result.revertedResources.map(String)
    return
  }
  if (!result.recompute) return
  // 与已提交值完全相同 → 这一轮是 selectResult 那类「先同步提交、赋值再
  // 触发一次 watcher」产生的回声，没有新信息，跳过。
  if (result.lastValid.every((v, i) => v === committedResources.value[i])) return
  committedResources.value = result.lastValid.slice()
  // 只重算正向路径。公式列表（computeRecipes）与按钮状态
  // （computeEnabledEquipIds）的入参里既没有资源、也没有所选池，资源一变
  // 它们的输出不可能变化 —— 参考实现在资源变化时同样只重算正向路径。
  // 这两个函数各要跑 existPool × 3 轮池匹配，跑一遍并不便宜。
  refreshCurrentPool()
}, { deep: true })

// 切换池：同上，公式列表与按钮状态都不依赖所选池
function onPoolChanged() {
  refreshCurrentPool()
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
// "100abc" 这类非法形式在输入阶段就不成立，而不是等进了 rawResources 数组、
// 触发一次错误提交之后再回退纠正。
//
// resolveResourceInputText 区分了两种情形（详见其定义处注释）：
// - 逐字符键入混入单个非法字符（比如敲了一下 "."）：清洗结果等于打这个字符
//   之前的文本，效果是"这一下按键被吃掉"，不影响已经打出来的数字。
// - 一次性写入（典型是粘贴）混入非法字符（比如粘贴 "10.5"）：不能接受剥离
//   出来的 "105"——那是用户没打过、也不会预期的数字。这种情况整体拒绝，
//   回退到上一个合法值，等价于"这次输入完全没有发生"。
// 两种情形用同一次判断产出同一个文本，再据此同步写 DOM 与 rawResources，
// 两者不会脱节。这里只写 rawResources，committedResources 是否推进由
// watch(rawResources, ...) 判断，onResourceInput 本身不做校验、不直接影响
// 任何 computed 的结果。
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
  // 文本是显示的唯一真值来源；同时写回 DOM 是因为文本可能与本次按键前相同
  // （比如 "100" 后面又敲了个 "."，清洗后还是 "100"），那样不会触发重渲染，
  // 浏览器会一直显示用户刚打出来的非法字符。
  rawResourceText.value[index] = text
  target.value = text

  const value = parseResourceInput(text)
  // 空输入框是合法的编辑中间态：保持 rawResources 不动 —— 算法读的仍是上一个
  // 合法值，而用户看到的是空框（由 rawResourceText 驱动，不会被重渲染回填）。
  if (Number.isNaN(value)) return
  rawResources.value[index] = value
}

// 验证资源输入（失焦时的兜底夹紧；watcher 已经把非整数拦在前面了）。
// 只钳位 rawResources 与 lastValid 这一个 index，committedResources 的提交
// 交给调用方 normalizeResource 统一处理。
function validateResource(index: number) {
  const validated = validateResourceValue(rawResources.value[index], lastValid.value[index])
  rawResources.value[index] = validated
  lastValid.value[index] = validated
}

// 标准化资源输入（失焦时）。
// 复刻参考实现的 Leave：无条件把当前 rawResources（本 index 已被 validateResource
// 钳位到 [10,300]，其余三项维持各自当前值，可能仍越界——参考实现同样按
// 每个 TextBox 独立的 Leave 处理，不等其它字段一起合法）提交为
// committedResources 并重算，不受 watch(rawResources, ...) 里 recompute
// 门槛的限制。
function normalizeResource(index: number) {
  // 输入框为空 → 还原成上一个合法值，与参考实现失焦时的还原一致。
  // 判断依据是文本而不是 rawResources：后者是数字数组，表达不了「空」，
  // 里面存的是最后一次成功解析出的数字。（若只走 validateResource，
  // 「清空前打过 3」会被钳成下限 10，而不是还原成清空前那个合法值。）
  if (rawResourceText.value[index] === '') rawResources.value[index] = lastValid.value[index]

  validateResource(index)
  rawResourceText.value[index] = String(rawResources.value[index])
  committedResources.value = rawResources.value.slice()
  refreshCurrentPool()   // 同 watch(rawResources)：只有正向路径依赖资源
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
  // 改资源只发生在用户主动选中结果行时。
  // 这里自动应用第一条公式是本项目有意保留的交互改进，经决策确认，非移植遗漏。
  // 代价：会覆盖用户手动输入的资源值。
  //
  // 走 selectResultAt 而不是直接 selectResult，是为了让选中态与手动点击一致
  // （第一行会高亮，并成为方向键的起点）。上面 refreshResults() 刚把
  // selectedResult 复位成 null，所以这一次必定触发。
  if (developmentResults.value.length > 0) {
    selectResultAt(0)
  }
}

function getEquipRate(equipId: number): string {
  const detail = equipRatesDetailMap.value[equipId]
  if (detail) return formatRateDetail(detail, '%')
  return `${currentPoolEquipments.value[equipId] ?? 0}%`
}

function getResourceRequirement(equip: Api_EquipInfo): string {
  const keys = ['label.fuel', 'label.ammo', 'label.steel', 'label.bauxite'] as const
  let out = ''
  for (let i = 0; i < 4; i++)
    if (equip.broken[i] > 1) out += `${t(keys[i])}${equip.broken[i] * 10} `
  return out
}

/**
 * 选中「可用公式」的第 index 行并应用它。
 *
 * 「同一行不重复触发」是有意复刻参考实现：那边挂的是列表控件的**选中项变化**
 * 事件，再点已经选中的行不会触发。差别是可观测的 —— 点某行 → 手工把油改成
 * 200 → 再点同一行：参考实现下油保持 200，而无条件触发的写法会把用户刚输入
 * 的值（以及所选池）静默覆盖回该行的配方。
 */
function selectResultAt(index: number) {
  if (index < 0 || index >= sortedResults.value.length) return
  const result = sortedResults.value[index]
  // 比的是对象标识而不是下标：排序改变的是位置，不是选中的是哪一条
  if (selectedResult.value === result) return
  selectedResult.value = result
  selectResult(result)
}

/** 方向键 / Home / End 在结果行之间移动选中项，与点击走同一条应用路径。 */
function onResultKeydown(event: KeyboardEvent) {
  const rows = (event.currentTarget as HTMLElement).children
  const current = (event.target as HTMLElement).closest('tr')
  if (!current) return
  const index = [...rows].indexOf(current)
  if (index < 0) return

  const last = sortedResults.value.length - 1
  let next: number
  switch (event.key) {
    case 'ArrowDown': next = Math.min(index + 1, last); break
    case 'ArrowUp': next = Math.max(index - 1, 0); break
    case 'Home': next = 0; break
    case 'End': next = last; break
    default: return
  }
  event.preventDefault()
  selectResultAt(next)
  ;(rows[next] as HTMLElement | undefined)?.focus()
}

// 选择结果
function selectResult(result: DevelopResult) {
  // 设置所选池
  const pool = availablePools.value.find(p => p.开发池名称 === result.池名)
  if (pool) {
    selectedPool.value = pool
  }

  // 设置资源。committedResources 与 lastValid 必须在这里**同步**写入 ——
  // 不能只写 rawResources 指望 watch 去提交：下面 refreshCurrentPool() 是
  // 同步调用，而 watch 是 pre-flush（异步），那样此刻 committedResources
  // 还是旧值，会用旧资源算出一份错误的 currentPoolEquipments。
  //
  // rawResources 逐项写而不是整数组替换：整数组替换必然让 deep watcher
  // 触发一次（引用变了），逐项写在值相同时不触发。真有值变化时 watcher
  // 仍会触发一次，但它开头那条「与已提交值相同就跳过」的判断会把这次
  // 回声挡掉。
  for (let i = 0; i < 4; i++) {
    if (rawResources.value[i] !== result.公式[i]) rawResources.value[i] = result.公式[i]
    rawResourceText.value[i] = String(result.公式[i])
  }
  committedResources.value = [...result.公式]
  lastValid.value = [...result.公式]

  // 只重算正向路径：目标装备没变，按钮状态（computeEnabledEquipIds）不会变。
  // 参考实现点结果行时同样只重算左侧列表。
  refreshCurrentPool()
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

/*
 * 这里原本还有 .flagship-info / .flagship-status / .flagship-status.warning
 * 三条规则。模板里没有任何元素带这些 class（秘书舰那块早已拆成
 * FlagshipSearch 组件，且它用的是 .matched / .mismatched / .miss），
 * 属于组件拆分后遗留的死样式，一并删掉。
 */

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

/* 与 FlagshipSearch 的标签共用 --form-label-width（定义见 assets/base.css），
   让「秘书舰类型：」的下拉框与「秘书舰」的搜索框左边缘对齐。
   同时也补上标签与控件之间的间距 —— 这行此前只是靠「：」这个全角冒号
   看着像有空隙，模板里 `</label>\n<select>` 之间的空白同样被
   whitespace: 'condense' 删掉了。 */
.secretary-select label {
  display: inline-block;
  width: var(--form-label-width);
}

.secretary-select select {
  width: var(--form-control-width);
  padding: 5px;
  box-sizing: border-box;
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

/*
 * 装备图标此前**没有任何尺寸约束**——只有右侧 .equipment-buttons button img
 * 那一条限了 24px，表格里的图标一直以 54px 的原始尺寸渲染（实测
 * getBoundingClientRect 为 54×54），把每一行撑到 70px 高，几十行下来整张表
 * 拉出好几屏。这里定到 32px：表格是主要阅读区，比按钮里的 24px 大一档以便
 * 辨认，同时行高降到 48px 左右。
 */
.equipment-list img {
  width: 32px;
  height: 32px;
  vertical-align: middle;
  display: block;
}

/* 图标列定宽，避免某几行没有图标时列宽随内容跳动 */
.equipment-list th:first-child,
.equipment-list td:first-child {
  width: 48px;
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

.development-results th.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.development-results th.sortable:hover {
  background-color: #f0f0f0;
}

.development-results tbody tr.result-selected {
  background-color: #e8f4e8;
}

/* 行可聚焦（tabindex=0）后必须有可见的焦点指示，否则键盘用户看不到自己在哪 */
.development-results tbody tr:focus-visible {
  outline: 2px solid #4a90d9;
  outline-offset: -2px;
}
</style> 