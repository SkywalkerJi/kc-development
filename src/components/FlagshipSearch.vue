<template>
  <div class="flagship-search">
    <label for="flagship">秘书舰</label>
    <input
      id="flagship"
      v-model="keyword"
      type="text"
      placeholder="输入日文舰名或假名读音"
      autocomplete="off"
      @input="onInput"
    />
    <ul v-if="open && suggestions.length" class="suggestions">
      <li v-for="s in suggestions" :key="s.id" @click="choose(s.id)">
        {{ s.name }}<span class="hint">（{{ s.yomi }}）</span>
      </li>
    </ul>
    <p v-if="resolved" :class="{ matched: props.matched, mismatched: !props.matched }">
      归属开发池：{{ resolved.poolName }}
      <span v-if="!props.matched">（与当前所选池不一致）</span>
    </p>
    <p v-else-if="keyword && !suggestions.length" class="miss">未找到该舰或它不属于任何开发池</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDevelopmentStore } from '@/stores/developmentStore'
import { useStart2Store } from '@/stores/start2Store'
import type { DevelopmentPoolClass } from '@/core/developmentPool'

const props = defineProps<{ matched: boolean }>()
const emit = defineEmits<{ select: [payload: { pool: DevelopmentPoolClass; shipName: string }] }>()

const developmentStore = useDevelopmentStore()
const start2Store = useStart2Store()

const keyword = ref('')
const open = ref(false)
const resolved = ref<{ poolName: string } | null>(null)

/**
 * 用户一改输入就丢弃上次的反查结果，并重新展开建议列表。
 * 少了这一步会有两个后果：选中某舰后继续编辑，下方会一直显示与当前输入
 * 不符的旧归属；且模板里「未找到该舰」那条 v-else-if 因 resolved 恒真
 * 而永远不可达。
 *
 * ⚠️ 只绑 @input，**不要**同时绑 @focus。
 * 「展开列表」和「清空结果」是两件事，绑在一起会让用户选中某舰后
 * 再点回输入框时，刚查到的归属池凭空消失。列表只在输入真正变化时展开。
 */
function onInput() {
  open.value = true
  resolved.value = null
}

const suggestions = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return []
  const out: { id: number; name: string; yomi: string }[] = []
  for (const [k, ship] of Object.entries(start2Store.shipList)) {
    const id = Number(k)
    if (id >= 1500) continue
    const yomi = ship.yomi ?? ''
    // 舰名取自游戏原始数据，是日文汉字，项目里没有中文译名层 ——
    // 简体输入「长门」搜不到「長門」，而「赤城」这类简繁同形的又能搜到，
    // 这种半通不通比全搜不到更容易误导。假名读音是数据里真实存在的
    // 第二匹配维度，一并纳入。
    if (ship.name.includes(kw) || yomi.includes(kw)) out.push({ id, name: ship.name, yomi })
    if (out.length >= 12) break
  }
  return out
})

function choose(shipId: number) {
  const hit = developmentStore.setFlagship(shipId)
  open.value = false // 收起建议列表，否则它会绝对定位悬浮在下方结果之上
  if (!hit) { resolved.value = null; return }
  resolved.value = { poolName: hit.pool.开发池名称 }
  // 程序化赋值不触发 @input，所以这里不会把刚设好的 resolved 清掉
  keyword.value = start2Store.shipList[shipId].name
  emit('select', { pool: hit.pool, shipName: start2Store.shipList[shipId].name })
}
</script>

<style scoped>
.flagship-search { position: relative; margin-bottom: 8px; }
.suggestions {
  position: absolute; z-index: 10; margin: 2px 0 0; padding: 0;
  list-style: none; border: 1px solid #ccc; background: #fff;
  max-height: 240px; overflow-y: auto; min-width: 200px;
}
.suggestions li { padding: 4px 8px; cursor: pointer; }
.suggestions li:hover { background: #e8f4e8; }
.hint { color: #888; font-size: 0.85em; }
.matched { color: #000; }
.mismatched { color: #c00; }
.miss { color: #888; }
</style>
