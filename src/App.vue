<script setup lang="ts">
import { RouterView } from 'vue-router'
import DataInitializer from './components/DataInitializer.vue'

// 此前这里有一段「数据加载状态面板」：三个 computed（舰船数/装备数/同型舰
// 组数）、三个 ref（dataError/dataLoaded/errorMessage），外加 onMounted 里
// 把全局 console.error 替换成一个会记录 abyssal_stats.json 报错的包装函数。
//
// 整段删掉的原因：读它们的模板早已被注释掉，六个状态全是「只写不读」。
// 代价却是实打实的 —— 那个 console.error 包装**没有在 onUnmounted 里还原**，
// 属于永久的全局副作用；开发时热更新每重挂载一次就再包一层，wrapper 链无界
// 增长，之后每条错误都要穿过 N 层。
//
// 若将来真要做这个面板：把 computed 接进模板，并且在 onUnmounted 里还原
// console.error（或者改用真正的错误上报，而不是猴补丁全局函数）。
</script>

<template>
  <main>
    <DataInitializer />
    <RouterView />
  </main>
</template>

<style scoped>
body {
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
}

main {
  padding: 1rem;
}
</style>
