<template>
  <div class="flagship-search">
    <label for="flagship">{{ $t('label.secretary') }}</label>
    <!-- input 与 suggestions 共享这个定位容器（Fix 5）：见下面 .field 的
         样式注释，这里不重复。 -->
    <div class="field">
      <input
        id="flagship"
        v-model="keyword"
        type="text"
        :placeholder="$t('search.placeholder')"
        autocomplete="off"
        role="combobox"
        :aria-expanded="listOpen ? 'true' : 'false'"
        aria-autocomplete="list"
        :aria-controls="listOpen ? SUGGESTIONS_ID : undefined"
        :aria-activedescendant="activeOptionId"
        @input="onInput"
        @keydown="onKeydown"
        @blur="close"
      />
      <!--
        @mousedown.prevent 是 @blur="open = false" 的必要配套，不是可选优化：
        真实浏览器点 <li> 的序列是 mousedown → blur → mouseup → click，
        失焦关闭会在 click 落地**之前**把这个 <li> 摘掉，点击于是永远送不到
        choose()。preventDefault 掉 mousedown 就不会发生焦点转移，blur 不触发，
        click 照常落地。
        （用 setTimeout 延迟关闭也能绕过，但那是把时序竞争藏进定时器；
        阻止焦点转移是直接消除竞争本身，而且正好是 ARIA combobox 要的形态：
        焦点始终留在 input 上，高亮项由 aria-activedescendant 表达。）
      -->
      <ul v-if="listOpen" :id="SUGGESTIONS_ID" class="suggestions" role="listbox" @mousedown.prevent>
        <li
          v-for="(s, i) in suggestions"
          :id="optionId(s.id)"
          :key="s.id"
          role="option"
          :aria-selected="i === activeIndex ? 'true' : 'false'"
          :class="{ active: i === activeIndex }"
          @click="choose(s.id)"
        >
          {{ s.display }}<span class="hint">（{{ s.yomi }}）</span>
        </li>
      </ul>
    </div>
    <p v-if="props.trackedPool" :class="{ matched: props.matched, mismatched: !props.matched }">
      {{ $t('search.poolOf') }}{{ poolName(props.trackedPool) }}
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

const props = defineProps<{
  matched: boolean
  /**
   * 当前正在跟踪的那艘秘书舰的归属池名；null / 不传表示没在跟踪任何舰。
   *
   * 这份状态**属于父组件**（DevelopmentView 的 flagshipPoolName），子组件
   * 只读它来决定下方那条提示显不显示（发现 21）。改造前子组件另有一份
   * 本地 resolved 决定"显不显示"、父组件那份决定"相符不相符"，两份状态
   * 只有 choose() 一个共同写入点，而子组件那份在用户继续编辑时会被清空、
   * 父组件那份没有任何清空点——于是父组件会一直记着一艘早已不在跟踪的舰。
   */
  trackedPool?: string | null
}>()
const emit = defineEmits<{
  select: [payload: { pool: DevelopmentPoolClass }]
  /**
   * 「我不再跟踪任何秘书舰了」。父组件的 flagshipPoolName 必须跟着放下
   * ——否则它会一直记着一艘早已不在跟踪的舰的归属池（发现 21：这份
   * 「谁在被跟踪」的状态曾经有两个真值源，且父组件那份只写不清）。
   */
  clear: []
}>()

const developmentStore = useDevelopmentStore()
const start2Store = useStart2Store()

// 手动输入的原始文本。只在「没有选中态」时才是输入框的展示值——见下面
// keyword 这个 computed 的说明。
const rawKeyword = ref('')
const open = ref(false)
/**
 * 当前选中的舰船 ID；未选中（或选中后用户又开始手动改字）为 null。
 * Fix 4 的核心状态：输入框显示值不再在 choose() 那一刻求值一次存成字符串
 * （语言切换后不会跟着变——本分支已经在 RESULT_COLUMNS、loadingSteps 上
 * 踩过同一类"求值一次就存起来"的缺陷），而是只记这个 ID，展示值由下面
 * keyword 的 getter 现场查 shipName(id)。
 */
const selectedShipId = ref<number | null>(null)

/**
 * 输入框实际绑定的值。
 *
 * - 有选中态（selectedShipId 非 null）：展示"当前语言下这艘舰的译名"，
 *   现查现算，语言切换时 shipName() 内部读的名称表变了，这个 getter 自动
 *   重新求值——不需要另外 watch 语言变化再手动赋值一次。
 * - 无选中态：展示用户手动打的原始文本 rawKeyword，不经过 shipName。
 *
 * setter 只在用户真正编辑输入框时触发（v-model 的原生 @input 监听器）：
 * 记下新文本，并把 selectedShipId 清空——这就是"手动输入必须清除选中态"
 * 的落点：清空之后 getter 转回展示 rawKeyword，语言切换不会再用旧的选中
 * ID 覆盖用户刚打的字。choose() 只写 selectedShipId、不经过这个 setter，
 * 所以选中某舰不会连带清空自己刚设好的选中态。
 */
const keyword = computed({
  get: () => (selectedShipId.value !== null ? shipName(selectedShipId.value) : rawKeyword.value),
  set: (v: string) => {
    rawKeyword.value = v
    selectedShipId.value = null
  },
})

/**
 * 搜索关键字与三个匹配维度统一走的规范化，解决"kongou 搜不到 Kongou"
 * "全角/片假名输入搜不到半角/平假名数据"两类大小写与字符形态问题（Fix 3）。
 *
 * - `normalize('NFKC')`：把兼容字符折叠成标准形态，覆盖全角数字/拉丁字母
 *   → 半角（'ｋｏｎｇｏｕ' → 'kongou'）、半角片假名 → 全角片假名等场景。
 * - `toLowerCase()`：大小写不敏感匹配（输入 'kongou' 也能命中 'Kongou'）。
 * - 片假名 → 平假名：JS 没有内建 API 做这一步，NFKC 也不做——两者是不同的
 *   Unicode 区块，不算"兼容字符"。手动按码位平移覆盖：片假名主体区间
 *   U+30A1–U+30F6，对应平假名 U+3041–U+3096，偏移量固定 -0x60（`ー`
 *   U+30FC 是长音符号，片假名/平假名共用同一个字符，不在这个区间内，
 *   不需要映射；浊音半浊音片假名如 'ガ' U+30AC 减 0x60 落在 'が' U+304C，
 *   同样成立）。
 *
 * 顺序有讲究：NFKC 必须排在片假名转换**之前**——半角片假名（U+FF66-FF9F）
 * 要先被 NFKC 折成全角片假名，才会落进下面这个正则的区间，顺序反了会漏转。
 */
function normalizeForSearch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

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
  // 只在**确实**放下了什么的时候通知：没选中过任何舰时敲字不是「停止跟踪」，
  // 那样每个按键都会往上抛一次无意义的 clear。
  if (props.trackedPool) emit('clear')
  // 高亮下标是相对**当前**建议列表的，换了输入就换了列表：不重置的话旧下标
  // 要么指向另一艘舰（Enter 选错船），要么直接越界。
  activeIndex.value = -1
}

/**
 * 当前键盘高亮的建议项下标；-1 表示没有高亮项。
 * 焦点**始终留在 input 上**（<li> 不可聚焦），高亮由 aria-activedescendant
 * 指过去——这是 ARIA 1.2 combobox 的 activedescendant 形态，也是
 * @mousedown.prevent 已经在维持的那个不变式。
 */
const activeIndex = ref(-1)

/*
 * 写死的 id，与上面 input 的 id="flagship" 同一个立场：这个组件全站只挂
 * 一份（scripts/verify-render.mjs 与组件测试都按 #flagship 选它）。要支持
 * 多实例就得三处一起改成 useId()，不能只改这里。
 */
const SUGGESTIONS_ID = 'flagship-suggestions'
const optionId = (shipId: number) => `flagship-option-${shipId}`

/** 与 <ul> 的 v-if 同一个条件：aria-expanded 必须与列表**实际**在不在场一致。 */
const listOpen = computed(() => open.value && suggestions.value.length > 0)

/**
 * 当前高亮的那一项，**越界即视为没有高亮**。
 *
 * activeIndex 是相对某一份 suggestions 的下标，而 suggestions 会从两个
 * 互不相干的方向变化：用户改输入（走 onInput，已重置）、以及**语言切换**
 * ——译名是搜索的第三个匹配维度，换语言会让列表在用户没碰键盘的情况下
 * 自己变短。与其去追每一个"列表可能变化"的来源（下一个来源迟早漏掉），
 * 不如把不变式放在取用点：这里越界返回 undefined，Enter 与
 * aria-activedescendant 都读它，两边自动一致。
 */
const activeOption = computed(() =>
  listOpen.value && activeIndex.value >= 0 ? suggestions.value[activeIndex.value] : undefined,
)

/** 没有高亮项时求值为 undefined，Vue 会整条略掉这个属性——不留空串。 */
const activeOptionId = computed(() =>
  activeOption.value ? optionId(activeOption.value.id) : undefined,
)

/**
 * 键盘操作（发现 23）与关闭路径（发现 15）共用的入口。
 *
 * Escape 放在最前、不受「列表是否有内容」的守卫约束：无论列表处于什么
 * 状态，Escape 都应该是一条无条件的退出路径。
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close()
    event.preventDefault()
    return
  }
  if (!open.value || !suggestions.value.length) return

  const last = suggestions.value.length - 1
  switch (event.key) {
    // 到头即回绕：列表短、用户按住方向键时不会"卡住"，也免得再维护一条
    // "到底了要不要停"的边界规则
    case 'ArrowDown':
      activeIndex.value = activeIndex.value >= last ? 0 : activeIndex.value + 1
      break
    case 'ArrowUp':
      activeIndex.value = activeIndex.value <= 0 ? last : activeIndex.value - 1
      break
    case 'Enter': {
      // 与 aria-activedescendant 读同一份派生值，两者不会各说各话
      const hit = activeOption.value
      // 没有高亮项时不拦 Enter：让它保持浏览器默认行为，不要把一个
      // "什么都没选"的回车吃掉
      if (!hit) return
      choose(hit.id)
      break
    }
    default:
      return
  }
  event.preventDefault()
}

/** 收起列表并清掉高亮，两者必须一起——留着旧下标，下次展开会闪一下错位的高亮。 */
function close() {
  open.value = false
  activeIndex.value = -1
}

const suggestions = computed(() => {
  const kw = normalizeForSearch(keyword.value.trim())
  if (!kw) return []
  const out: { id: number; display: string; yomi: string }[] = []
  for (const [k, ship] of Object.entries(start2Store.shipList)) {
    const id = Number(k)
    if (id >= 1500) continue
    const yomi = ship.yomi ?? ''
    // 三个匹配维度：日文原名、假名读音、当前语言的译名（i18n.shipName，
    // 查不到时回退日文原名）。三者都先经 normalizeForSearch 规范化再比较
    // （Fix 3），关键字与被匹配文本必须用同一套规则，否则"规范化只做了
    // 一半"会比完全不做更难排查。
    //
    // 日文原名与假名读音**保留而不是被译名取代**：数据里两者都真实存在，
    // 日文用户、以及习惯用原始日文名记舰船的玩家会直接照它们输入，把这两
    // 条维度去掉对这部分用户是倒退。译名是新增的第三维，服务的是另一群
    // 用户——不认识日文汉字、只认自己语言译名的人。三者取或，互不排斥。
    const translated = shipName(id)
    if (
      normalizeForSearch(ship.name).includes(kw) ||
      normalizeForSearch(yomi).includes(kw) ||
      normalizeForSearch(translated).includes(kw)
    )
      out.push({ id, display: translated, yomi })
    if (out.length >= 12) break
  }
  return out
})

function choose(shipId: number) {
  const hit = developmentStore.setFlagship(shipId)
  close() // 收起建议列表，否则它会绝对定位悬浮在下方结果之上
  // 查不到归属池时没有东西要放下：列表能展开就说明刚刚走过 onInput，
  // 那一步已经 emit 过 clear、父组件的 trackedPool 此刻必为空。
  if (!hit) return
  // 只记 ID，不在这里把此刻的译名字符串求值存死——keyword 的 getter 会
  // 现场查 shipName()，语言切换时自动跟着变（Fix 4，见 keyword 定义处的
  // 说明）。这一行不经过 keyword 的 setter，rawKeyword/后续手动输入不受
  // 影响；也不会触发 <input> 的原生 input 事件。
  selectedShipId.value = shipId
  // payload 曾经还带一个 shipName 字段（start2Store.shipList[shipId].name，
  // 未翻译的日文原名）：唯一消费者 DevelopmentView.onFlagshipSelect 从不读
  // 它，而且这个名字与本文件顶部 `import { ... shipName } from '@/i18n'`
  // 的函数同名，在这个作用域里读起来像是那个函数的返回值——两个理由都
  // 够删掉它了，不需要事件带出不被消费的数据。
  emit('select', { pool: hit.pool })
}
</script>

<style scoped>
/*
 * ⚠️ 不要给 .flagship-search 加 display: flex 来做标签与输入框的间距。
 * 这个容器里除了 label + .field，还有下方两个 <p>（归属开发池 / 未找到），
 * 一旦 flex 化，解析出舰船的那一刻结果文字会被拉到输入框同一行。
 * 间距由 label 自己的宽度给出，见下。
 */
.flagship-search { margin-bottom: 15px; }

/*
 * 标签与输入框之间的间距**必须**由 CSS 给出，不能指望模板源码里的换行：
 * Vue 模板编译器默认 whitespace: 'condense'，元素之间「只含空白且带换行」
 * 的文本节点会被整个删除，而 `</label>\n<div class="field">` 正是这种
 * 形态。修之前实测 input.x - label.right === 0，两者严丝合缝贴在一起。
 *
 * 宽度取自 --form-label-width（定义与取值依据见 assets/base.css），与上方
 * 「秘书舰类型：」那行共用，让两行的控件左边缘对齐。窄视口下标签+输入框
 * 合起来放不下当前行时，两者各自的 inline-block 自然换行——label 独占
 * 一行，.field（下一个 inline-block）掉到下一行贴容器左边缘，不需要
 * 另外写媒体查询去复刻这条换行规则：真正决定"够不够宽"的是
 * .left-panel 的 45%/max-width/padding 组合（DevelopmentView.vue），
 * 那个宽度本身就会随视口连续变化，任何写死的像素断点都只是在猜它，
 * 猜的断点还会与它各玩各的、迟早对不上。
 */
/* ⚠️ 不要给这个标签设 font-size：scripts/verify-render.mjs 断言它与
   DevelopmentView 的「秘书舰类型」标签**字号相等**（那是 --form-label-width
   用 em 表达、两处共用同一个值的前提）。要改字号必须两个组件一起改。 */
.flagship-search label {
  display: inline-block;
  width: var(--form-label-width);
}

/*
 * input 与 suggestions 共同的定位容器（Fix 5）。
 *
 * 改之前 suggestions 直接是 .flagship-search 的子元素，用
 * `left: var(--form-label-width)` 把自己对齐到 input 左边缘——这个值
 * 只在「label 与 input 同一行」时才等于 input 的真实 x 坐标。窄视口下
 * label 撑不下、input 换到下一行贴容器左边缘（x=0）时，这个写死的偏移量
 * 不会跟着变，suggestions 依然悬浮在"label 宽度"那个位置，与真正的
 * input 错开一整个标签宽、还可能探出右侧面板——这正是 harness 用真实
 * Chrome 在 en/1024px 测出的缺陷，不是假设。
 *
 * 用 .field 把两者包起来、display: inline-block + position: relative：
 * input 与 suggestions 现在共享同一个定位祖先，suggestions 只需要
 * left: 0 就能对齐到 input 左边缘，且这句在 label/input 是否换行两种
 * 布局下都成立——不必知道 input 实际落在哪个 x 坐标，也不需要再维护
 * "两处 em 必须在同一个字号下解析"这类耦合（下面 .suggestions 原来的
 * 那条 ⚠️ 注释就是在警告这件事：警告是对的，但正确的应对是消灭这个
 * 耦合本身，不是把警告写得更详细）。
 *
 * inline-block 而不是默认的 block：block 会让 .field 永远独占一行，
 * 在 label/input 不需要换行的常规宽度下也会把 input 挤到 label 下方，
 * 破坏未换行时本该并排的布局。
 */
.field { display: inline-block; position: relative; }

.flagship-search input {
  width: var(--form-control-width);
  padding: 5px;
  /* 与 select 视觉同宽：select 的 300px 是内容宽度 + 5px 内边距，input 若
     不改 box-sizing 会比它宽出 10px + 边框 */
  box-sizing: border-box;
}

.suggestions {
  /* 定位祖先是 .field（见上），不再是 .flagship-search 与
     --form-label-width 的运算结果——固定在 left: 0 / top: 100% 就是
     input 的左下角，label/input 换不换行都对，不需要再关心两者当前
     解析到的 em 是否一致。
     top: 100% 显式写出来，不依赖"不设 top 时退回静态位置、恰好排在
     input 正下方"这种隐式行为——静态位置只在 ul 紧邻 input 之后、两者
     中间没有其它兄弟节点时才凑巧正确，显式声明更不容易在以后改动模板
     结构时又踩一次同样的坑。 */
  left: 0;
  top: 100%;
  position: absolute; z-index: 10; margin: 2px 0 0; padding: 0;
  list-style: none;
  max-height: 240px; overflow-y: auto;
  min-width: var(--form-control-width);
  /* ⚠️ 上面 margin 的左值必须保持 0：scripts/verify-render.mjs 断言
     suggestionsList.x 与 flagshipInput.x **严格相等**（零容差）。任何
     margin-left / transform / 给 .field 加 padding，都会让这一条报红。 */
  border: 1px solid var(--c-border-strong);
  border-radius: var(--radius-sm);
  background: var(--c-surface);
  box-shadow: var(--shadow-lg);
}
.suggestions li { padding: 5px 9px; cursor: pointer; }
/* 键盘高亮与鼠标悬停用同一个底色：焦点始终留在 input 上（activedescendant
   形态），<li> 永远不会真的获得焦点，所以 :focus 在这里派不上用场，必须
   自己画。两者取同一个变量，免得出现"键盘走到的那一项看起来和鼠标划过的
   那一项不是一回事"。 */
.suggestions li:hover,
.suggestions li.active { background: var(--c-accent-soft); }
.hint { color: var(--c-text-faint); font-size: 0.85em; }

/* 结果行缩进到与输入框同一条左边缘，避免它们贴着容器最左边、
   与上面的「标签 + 控件」两列错开 */
.flagship-search p {
  margin: 6px 0 0 var(--form-label-width);
  font-size: 0.9em;
}
.matched { color: var(--c-text); }
.mismatched { color: var(--c-danger); }
.miss { color: var(--c-text-faint); }
</style>
