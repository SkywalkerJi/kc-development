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
import { ref, onMounted } from 'vue'
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

const start2Store = useStart2Store()
const developmentStore = useDevelopmentStore()
const isLoading = ref(true)
const hasErrors = ref(false)
// ⚠️ 存 key 不存已翻译的文字：ref 的初值、以及 onMounted 里每次赋的新值，
// 都是在赋值那一刻用当前语言求值一次就定死——如果存的是字符串，语言切换
// 不会触发这几行重新求值，面板文案就会冻结在组件挂载时的语言。存 key、
// 在模板里 `$t(loadingMessageKey)` 才能让翻译随渲染重新执行。
const loadingMessageKey = ref<MsgKey>('loading.data')
// errorMessage 不是纯粹的"例外"：它主要拼接 Error.message / 校验器抛出的
// 诊断文本（那部分按设计不翻译，见下面 catch 分支的注释），但四处
// `未知错误` 兜底按 brief 换成了 `$t('error.unknown')`——这个调用同样是在
// 赋值那一刻求值后把**字符串**存进 ref，不是存 key，所以严格说仍带一点点
// 上面那条注释描述的问题：如果面板显示"未知错误"兜底文案时用户切换语言，
// 这一小段不会跟着重新翻译（而 loadingMessageKey/loadingSteps 那些会）。
// 没有为这四处单独再引入一个"错误兜底 key"式的响应式方案——errorMessage
// 后续还会被同一个 catch 分支的诊断文本 `+=` 追加、拼接，做成完全响应式
// 需要拆分"结构化片段 + 渲染期拼接"，改动面超出 brief 给的逐点替换范围；
// 按 brief 字面执行，已在 Task 9 报告里记录为已知局限，留给后续任务判断
// 是否值得为这一角落单独做响应式化。
const errorMessage = ref('')
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
        // 按设计保持中文，不经消息表翻译；只有兜底的"未知错误"走 t()。
        errorMessage.value = result.error ? (result.error as Error).message || $t('error.unknown') : $t('error.unknown')
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
          errorMessage.value += (errorMessage.value ? '\n' : '') +
            (devResult.error ? (devResult.error as Error).message || '开发池数据加载错误' : '开发池数据加载错误')
        }
      } catch (devError) {
        console.error('开发池数据加载失败', devError)
        hasErrors.value = true
        errorMessage.value += (errorMessage.value ? '\n' : '') +
          (devError instanceof Error ? devError.message : '开发池数据加载失败')
        loadingSteps.value[2].completed = false
      }
    } catch (error) {
      console.error('数据加载失败', error)
      loadingMessageKey.value = 'loading.failed'
      hasErrors.value = true
      errorMessage.value = error instanceof Error ? error.message : $t('error.unknown')
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
    errorMessage.value = error instanceof Error ? error.message : $t('error.unknown')
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