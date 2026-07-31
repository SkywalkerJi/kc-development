<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import DataInitializer from './components/DataInitializer.vue'
// LocaleSwitcher 不再由这里渲染——它搬进了 AppHeader，与 GitHub/X 两个链接
// 排在同一组页头控件里。这里保留这行说明，是因为"语言选择器去哪了"是下一个
// 人在这个文件里最可能找的东西。

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
  <!--
    header / main / footer 三段是 body 这个 flex 列的直接子元素（布局见
    assets/base.css 里 body 的注释）。header 与 footer 刻意放在 <main>
    **之外**：<main> 的语义是"本页的主要内容"，站名、语言选择器、外链、
    署名都不属于它，塞进去会让读屏软件的"跳到主内容"落在一堆导航上。
  -->
  <AppHeader />
  <main>
    <DataInitializer />
    <RouterView />
  </main>
  <AppFooter />
</template>

<style scoped>
/*
 * 这里原本还有一条 `body { margin: 0; padding: 0; font-family: Arial, sans-serif }`。
 * 它从来没有生效过 —— scoped 会把它编译成 `body[data-v-xxx]`，而 data-v 属性
 * 只加在组件模板渲染出的元素上，body 由 index.html 提供，永远匹配不上。
 * 规则已移到 src/assets/base.css（由 main.ts 引入），那里还说明了为什么
 * 字体栈不能只写 Arial。
 *
 * 下面这条 main 规则则相反，留在 scoped 里就对了：它是 App.vue 自己的布局，
 * 不是全站规则。（这条注释以前的理由是「HomeView.vue 也有一个裸 <main>，
 * 全局化会连它一起加上内边距」——那个只有空 <main>、从未被路由到的脚手架
 * 残留组件已经删了，理由随之作废，但结论没变。）
 */
main {
  padding: 1rem;
  /* body 是 flex 列（见 assets/base.css）：main 吃掉 header/footer 之外的
     全部剩余高度，内容不足一屏时页脚才会被推到视口底部而不是浮在半空。
     ⚠️ flex: 1 的 flex-basis 是 0%，纵向布局下这正是想要的；它不影响宽度
     （容器 align-items 默认 stretch）。 */
  flex: 1;
}
</style>
