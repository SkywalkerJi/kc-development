<template>
  <div v-if="isLoading || hasErrors" class="data-loading">
    <p>{{ $t(loadingMessageKey) }}</p>
    <div v-if="hasErrors" class="error-details">
      <p class="error-title">{{ $t('error.title') }}</p>
      <p>{{ errorMessage }}</p>
    </div>
    <div v-if="loadingSteps.length > 0" class="loading-steps">
      <p>{{ $t('loading.steps') }}</p>
      <ul>
        <li v-for="(step, index) in loadingSteps" :key="index" :class="{ completed: step.completed }">
          {{ $t(step.key) }}: <span v-if="step.completed">{{ $t('loading.stepDone') }}</span><span v-else>{{ $t('loading.stepPending') }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useStart2Store } from '@/stores/start2Store'
import { useDevelopmentStore } from '@/stores/developmentStore'
// 本地 import 而不是依赖 main.ts 里挂到 globalProperties 的那份：组件测试用
// createApp(DataInitializer).mount() 直接挂载，不经过 main.ts，globalProperties
// 上不会有 $t。同 LocaleSwitcher.vue / FlagshipSearch.vue 的做法。
import { t as $t } from '@/i18n'
import type { MsgKey } from '@/i18n/types'

// key 而不是 name：见下面 loadingSteps / loadingMessageKey 的注释
interface LoadingStep {
  key: MsgKey;
  completed: boolean;
}

/**
 * errorMessage 的一行来源：要么是消息表 key（渲染期按当前语言翻译），要么
 * 是已经定型的诊断文本（Error.message / 校验器抛出的信息，按设计保持
 * 中文、原样透传，不查表）。
 *
 * 不能只存拼好的字符串——那样任何"未知错误"一类的兜底文案都是在赋值那一
 * 刻调一次 t() 存死结果，跟改造前 loadingMessage 犯的是同一个错误：语言
 * 切换不会触发重新求值。这里改存结构化片段，翻译推迟到 errorMessage 这个
 * computed 里，随渲染重新执行。
 */
type ErrorFragment = { key: MsgKey } | { text: string }

/**
 * 从 store 返回的 `{ success, error }` 里的 error 字段构造一行片段。
 * 该字段类型是 unknown，运行时要么是 Error、要么是 null/undefined
 * （见 start2Store/developmentStore 的 `_initializeData`：所有失败都
 * `throw new Error(...)`）。err 存在且 message 非空才当诊断文本原样保留，
 * 否则退回消息表兜底 key——与原来的 `err ? (err as Error).message ||
 * fallback : fallback` 等价。
 */
function fragmentFromStoreError(err: unknown, fallbackKey: MsgKey): ErrorFragment {
  const message = err ? (err as Error).message : undefined
  return message ? { text: message } : { key: fallbackKey }
}

/**
 * 从 catch 到的异常构造一行片段。是 Error 实例就原样取 message——哪怕是
 * 空字符串也不退回兜底，与原来的 `err instanceof Error ? err.message :
 * fallback` 保持同样的边界行为；不是 Error 实例（比如 reject 了一个字符串）
 * 才退回消息表兜底 key。
 */
function fragmentFromCaught(err: unknown, fallbackKey: MsgKey): ErrorFragment {
  return err instanceof Error ? { text: err.message } : { key: fallbackKey }
}

const start2Store = useStart2Store()
const developmentStore = useDevelopmentStore()
const isLoading = ref(true)
const hasErrors = ref(false)
// ⚠️ 存 key 不存已翻译的文字：ref 的初值、以及 onMounted 里每次赋的新值，
// 都是在赋值那一刻用当前语言求值一次就定死——如果存的是字符串，语言切换
// 不会触发这几行重新求值，面板文案就会冻结在组件挂载时的语言。存 key、
// 在模板里 `$t(loadingMessageKey)` 才能让翻译随渲染重新执行。
const loadingMessageKey = ref<MsgKey>('loading.data')
const errorFragments = ref<ErrorFragment[]>([])
// 模板不用改：这里从 errorFragments 派生出最终展示的字符串，key 片段在
// 每次求值时调用 $t()，随当前语言重新翻译；text 片段（诊断文本）原样
// 透传。多行之间用 \n 拼接——用 join 而不是原来的
// `errorMessage.value += (errorMessage.value ? '\n' : '') + x`，是因为
// 换行判断现在完全由数组元素个数决定，不需要再手动查"目前是不是空串"。
const errorMessage = computed(() =>
  errorFragments.value.map((f) => ('key' in f ? $t(f.key) : f.text)).join('\n')
)
const loadingSteps = ref<LoadingStep[]>([
  { key: 'loading.stepShip', completed: false },
  { key: 'loading.stepAbyssal', completed: false },
  { key: 'loading.stepPool', completed: false }
])

onMounted(async () => {
  try {
    // 使用统一的初始化方法
    loadingMessageKey.value = 'loading.gameData'
    try {
      const result = await start2Store.initializeData()

      // 更新加载步骤状态
      loadingSteps.value[0].completed = true
      loadingSteps.value[1].completed = true

      if (!result.success) {
        hasErrors.value = true
        // result.error 来自数据校验器（dataSchema.js），面向维护者的诊断，
        // 按设计保持中文，不经消息表翻译；只有兜底的"未知错误"走消息表。
        errorFragments.value = [fragmentFromStoreError(result.error, 'error.unknown')]
      }

      // 显示加载结果（面向维护者的诊断日志，不翻译）
      console.log(`加载了 ${Object.keys(start2Store.shipList).length} 条舰船数据`)
      console.log(`加载了 ${Object.keys(start2Store.equipList).length} 条装备数据`)
      console.log(`同型舰分组: ${start2Store.sameShipList.length} 组`)

      // 初始化开发池数据
      loadingMessageKey.value = 'loading.poolData'
      try {
        const devResult = await developmentStore.initializeData()
        loadingSteps.value[2].completed = true

        // 显示开发池数据加载结果
        // 同 start2Store：只打计数，不 dump 整个池数组
        console.log(`加载了 ${developmentStore.developmentPools.length} 条开发池数据`)

        if (!devResult.success) {
          hasErrors.value = true
          errorFragments.value = [
            ...errorFragments.value,
            fragmentFromStoreError(devResult.error, 'error.poolLoadFailed'),
          ]
        }
      } catch (devError) {
        console.error('开发池数据加载失败', devError)
        hasErrors.value = true
        errorFragments.value = [
          ...errorFragments.value,
          fragmentFromCaught(devError, 'error.poolLoadException'),
        ]
        loadingSteps.value[2].completed = false
      }
    } catch (error) {
      console.error('数据加载失败', error)
      loadingMessageKey.value = 'loading.failed'
      hasErrors.value = true
      errorFragments.value = [fragmentFromCaught(error, 'error.unknown')]
      isLoading.value = false
      return
    }

    // 完成加载
    loadingMessageKey.value = hasErrors.value ? 'loading.partial' : 'loading.done'
    isLoading.value = false
  } catch (error) {
    console.error('数据加载过程发生错误', error)
    loadingMessageKey.value = 'loading.failedRetry'
    hasErrors.value = true
    errorFragments.value = [fragmentFromCaught(error, 'error.unknown')]
    isLoading.value = false
  }
})
</script>

<style scoped>
.data-loading {
  padding: 1rem;
  background-color: #f5f5f5;
  border-radius: 4px;
  margin-bottom: 1rem;
  text-align: center;
}

.error-details {
  margin-top: 1rem;
  color: #d9534f;
  text-align: left;
  padding: 0.5rem;
  background-color: #f9eaea;
  border-radius: 4px;
}

.error-title {
  font-weight: bold;
}

.loading-steps {
  margin-top: 1rem;
  text-align: left;
}

.loading-steps ul {
  list-style-type: none;
  padding-left: 1rem;
}

.loading-steps li {
  margin-bottom: 0.5rem;
}

.loading-steps .completed {
  color: #5cb85c;
}
</style> 