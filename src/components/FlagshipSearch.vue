<template>
  <div class="flagship-search">
    <label for="flagship">秘书舰</label>
    <input
      id="flagship"
      v-model="keyword"
      type="text"
      placeholder="输入舰名，支持中/日文"
      autocomplete="off"
    />
    <ul v-if="suggestions.length" class="suggestions">
      <li v-for="s in suggestions" :key="s.id" @click="choose(s.id)">
        {{ s.name }}<span class="hint">（{{ s.id }}）</span>
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
const resolved = ref<{ poolName: string } | null>(null)

const suggestions = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return []
  const out: { id: number; name: string }[] = []
  for (const [k, ship] of Object.entries(start2Store.shipList)) {
    const id = Number(k)
    if (id >= 1500) continue
    if (ship.name.includes(kw)) out.push({ id, name: ship.name })
    if (out.length >= 12) break
  }
  return out
})

function choose(shipId: number) {
  const hit = developmentStore.setFlagship(shipId)
  if (!hit) { resolved.value = null; return }
  resolved.value = { poolName: hit.pool.开发池名称 }
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
