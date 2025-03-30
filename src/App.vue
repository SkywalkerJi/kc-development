<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import DataInitializer from './components/DataInitializer.vue'
import { useStart2Store } from './stores/start2Store'
import { computed, ref, watch, onMounted } from 'vue'

const start2Store = useStart2Store()
const shipCount = computed(() => Object.keys(start2Store.shipList).length)
const equipCount = computed(() => Object.keys(start2Store.equipList).length)
const sameShipCount = computed(() => start2Store.sameShipList.length)

// 错误处理和状态
const dataError = ref(false)
const dataLoaded = ref(false)
const errorMessage = ref('')

onMounted(() => {
  // 监听控制台错误
  const originalConsoleError = console.error
  console.error = (...args) => {
    // 记录错误信息
    if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('abyssal_stats.json')) {
      dataError.value = true
      errorMessage.value = args.join(' ')
    }
    // 调用原始方法
    originalConsoleError(...args)
  }
})

// 监视数据加载情况
watch([shipCount, equipCount], ([ships, equips]) => {
  if (ships > 0 && equips > 0) {
    dataLoaded.value = true
  }
})
</script>

<template>
  <header>
    <nav>
      <router-link to="/">首页</router-link>
      <router-link to="/development">装备开发</router-link>
    </nav>
  </header>
  
  <main>
    <DataInitializer />

    <!-- <div v-if="dataLoaded" class="data-summary" :class="{ error: dataError }">
      <h2>{{ dataError ? '数据部分加载成功' : '数据加载成功' }}</h2>
      <p>舰船数据: {{ shipCount }} 条</p>
      <p>装备数据: {{ equipCount }} 条</p>
      <p>同型舰分组: {{ sameShipCount }} 组</p>
      
      <div v-if="dataError" class="error-message">
        <h3>加载过程中出现错误:</h3>
        <p>深海舰船数据未能成功加载，但不影响基本功能。</p>
      </div>
    </div> -->
    
    <RouterView />
  </main>
</template>

<style scoped>
body {
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
}

header {
  background-color: #2c3e50;
  padding: 1rem;
}

nav {
  display: flex;
  gap: 1rem;
}

nav a {
  color: white;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
}

nav a:hover {
  background-color: #4e6a88;
}

nav a.router-link-active {
  background-color: #1a2533;
}

main {
  padding: 1rem;
}

.data-summary {
  background-color: #f0f8ff;
  padding: 1rem;
  border-radius: 4px;
  margin: 1rem;
  max-width: 800px;
  margin: 0 auto;
}

.data-summary.error {
  background-color: #fff8f0;
}

.error-message {
  background-color: #ffebeb;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  margin-top: 1rem;
}
</style>
