<template>
  <div v-if="isLoading || hasErrors" class="data-loading">
    <p>{{ loadingMessage }}</p>
    <div v-if="hasErrors" class="error-details">
      <p class="error-title">错误详情:</p>
      <p>{{ errorMessage }}</p>
    </div>
    <div v-if="loadingSteps.length > 0" class="loading-steps">
      <p>加载步骤:</p>
      <ul>
        <li v-for="(step, index) in loadingSteps" :key="index" :class="{ completed: step.completed }">
          {{ step.name }}: <span v-if="step.completed">已完成</span><span v-else>处理中...</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useStart2Store } from '@/stores/start2Store'
import { useDevelopmentStore } from '@/stores/developmentStore'

interface LoadingStep {
  name: string;
  completed: boolean;
}

const start2Store = useStart2Store()
const developmentStore = useDevelopmentStore()
const isLoading = ref(true)
const hasErrors = ref(false)
const loadingMessage = ref('正在加载数据...')
const errorMessage = ref('')
const loadingSteps = ref<LoadingStep[]>([
  { name: '加载舰船数据', completed: false },
  { name: '加载深海舰船数据', completed: false },
  { name: '加载开发池数据', completed: false }
])

onMounted(async () => {
  try {
    // 使用统一的初始化方法
    loadingMessage.value = '正在加载游戏数据...'
    try {
      const result = await start2Store.initializeData()
      
      // 更新加载步骤状态
      loadingSteps.value[0].completed = true
      loadingSteps.value[1].completed = true
      
      if (!result.success) {
        hasErrors.value = true
        errorMessage.value = result.error ? (result.error as Error).message || '未知错误' : '未知错误'
      }
      
      // 显示加载结果
      console.log(`加载了 ${Object.keys(start2Store.shipList).length} 条舰船数据`)
      console.log(`加载了 ${Object.keys(start2Store.equipList).length} 条装备数据`)
      console.log(`同型舰分组: ${start2Store.sameShipList.length} 组`)
      
      // 初始化开发池数据
      loadingMessage.value = '正在加载开发池数据...'
      try {
        const devResult = await developmentStore.initializeData()
        loadingSteps.value[2].completed = true
        
        // 显示开发池数据加载结果
        console.log(`加载了 ${developmentStore.developmentPools.length} 条开发池数据`)
        console.log('开发池详细内容:')
        console.log(developmentStore.developmentPools)
        
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
      loadingMessage.value = '数据加载失败'
      hasErrors.value = true
      errorMessage.value = error instanceof Error ? error.message : '未知错误'
      isLoading.value = false
      return
    }
    
    // 完成加载
    loadingMessage.value = hasErrors.value ? '数据加载部分完成，存在错误' : '数据加载完成'
    isLoading.value = false
  } catch (error) {
    console.error('数据加载过程发生错误', error)
    loadingMessage.value = '数据加载失败，请刷新页面重试'
    hasErrors.value = true
    errorMessage.value = error instanceof Error ? error.message : '未知错误'
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