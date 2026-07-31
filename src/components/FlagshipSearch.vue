<template>
  <div class="flagship-search">
    <label for="flagship">{{ $t('label.secretary') }}</label>
    <input
      id="flagship"
      v-model="keyword"
      type="text"
      :placeholder="$t('search.placeholder')"
      autocomplete="off"
      @input="onInput"
    />
    <ul v-if="open && suggestions.length" class="suggestions">
      <li v-for="s in suggestions" :key="s.id" @click="choose(s.id)">
        {{ s.display }}<span class="hint">（{{ s.yomi }}）</span>
      </li>
    </ul>
    <p v-if="resolved" :class="{ matched: props.matched, mismatched: !props.matched }">
      {{ $t('search.poolOf') }}{{ poolName(resolved.poolName) }}
      <span v-if="!props.matched">{{ $t('search.mismatch') }}</span>
    </p>
    <p v-else-if="keyword && !suggestions.length" class="miss">{{ $t('search.notFound') }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDevelopmentStore } from '@/stores/developmentStore'
import { useStart2Store } from '@/stores/start2Store'
import type { DevelopmentPoolClass } from '@/core/developmentPool'
// 本地 import 而不是依赖 main.ts 里挂到 globalProperties 的那份：组件测试用
// createApp(FlagshipSearch).mount() 直接挂载，不经过 main.ts，globalProperties
// 上不会有 $t。script setup 顶层绑定会自动暴露给模板，重命名成 $t 后模板里
// 的 {{ $t(...) }} 与 :placeholder="$t(...)" 两种写法都能解析到它——
// 同 LocaleSwitcher.vue / DevelopmentView.vue 的做法。
import { t as $t, shipName, poolName } from '@/i18n'

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
  const out: { id: number; display: string; yomi: string }[] = []
  for (const [k, ship] of Object.entries(start2Store.shipList)) {
    const id = Number(k)
    if (id >= 1500) continue
    const yomi = ship.yomi ?? ''
    // 三个匹配维度：日文原名、假名读音、当前语言的译名（i18n.shipName，
    // 查不到时回退日文原名）。
    //
    // 日文原名与假名读音**保留而不是被译名取代**：数据里两者都真实存在，
    // 日文用户、以及习惯用原始日文名记舰船的玩家会直接照它们输入，把这两
    // 条维度去掉对这部分用户是倒退。译名是新增的第三维，服务的是另一群
    // 用户——不认识日文汉字、只认自己语言译名的人。三者取或，互不排斥。
    const translated = shipName(id)
    if (ship.name.includes(kw) || yomi.includes(kw) || translated.includes(kw))
      out.push({ id, display: translated, yomi })
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
  keyword.value = shipName(shipId)
  emit('select', { pool: hit.pool, shipName: start2Store.shipList[shipId].name })
}
</script>

<style scoped>
/*
 * ⚠️ 不要给 .flagship-search 加 display: flex 来做标签与输入框的间距。
 * 这个容器里除了 label + input，还有下方两个 <p>（归属开发池 / 未找到），
 * 一旦 flex 化，解析出舰船的那一刻结果文字会被拉到输入框同一行。
 * 间距由 label 自己的宽度给出，见下。
 */
.flagship-search { position: relative; margin-bottom: 15px; }

/*
 * 标签与输入框之间的间距**必须**由 CSS 给出，不能指望模板源码里的换行：
 * Vue 模板编译器默认 whitespace: 'condense'，元素之间「只含空白且带换行」
 * 的文本节点会被整个删除，而 `</label>\n<input>` 正是这种形态。
 * 修之前实测 input.x - label.right === 0，两者严丝合缝贴在一起。
 *
 * 宽度取自 --form-label-width（定义与取值依据见 assets/base.css），与上方
 * 「秘书舰类型：」那行共用，让两行的控件左边缘对齐。
 */
.flagship-search label {
  display: inline-block;
  width: var(--form-label-width);
}

.flagship-search input {
  width: var(--form-control-width);
  padding: 5px;
  /* 与 select 视觉同宽：select 的 300px 是内容宽度 + 5px 内边距，input 若
     不改 box-sizing 会比它宽出 10px + 边框 */
  box-sizing: border-box;
}

.suggestions {
  /* 绝对定位但不给 left 时，浏览器用的是「静态位置」——ul 是块级元素，
     会退到容器最左边，与它所属的输入框错开一个标签的宽度。显式对齐到
     输入框左边缘。

     ⚠️ --form-label-width 的值是 em，而 em 在**用到它的那个元素**上解析：
     这里是 ul，上面的 width 是 label，两者当前都继承 16px 根字号，所以
     算出来一样。若将来给 .flagship-search 或其中之一单独设了 font-size，
     标签宽度与这里的偏移会静默错开。真要改字号就把这两处一起换成 px。 */
  left: var(--form-label-width);
  position: absolute; z-index: 10; margin: 2px 0 0; padding: 0;
  list-style: none; border: 1px solid #ccc; background: #fff;
  max-height: 240px; overflow-y: auto;
  min-width: var(--form-control-width);
}
.suggestions li { padding: 4px 8px; cursor: pointer; }
.suggestions li:hover { background: #e8f4e8; }
.hint { color: #888; font-size: 0.85em; }

/* 结果行缩进到与输入框同一条左边缘，避免它们贴着容器最左边、
   与上面的「标签 + 控件」两列错开 */
.flagship-search p {
  margin: 6px 0 0 var(--form-label-width);
  font-size: 0.9em;
}
.matched { color: #000; }
.mismatched { color: #c00; }
.miss { color: #888; }
</style>
