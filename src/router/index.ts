import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * 单路由。整个应用只有「装备开发」这一个界面，路由存在的意义只剩下
 * hash 模式那一条：GitHub Pages 是纯静态托管，没有服务端可以把任意路径
 * 回退到 index.html，createWebHashHistory 把路由完全放进 `#` 之后，
 * 静态服务器只需要认识一个真实文件（配合 public/404.html 兜住直接输入
 * 深链的情况）。
 *
 * 这里原本还有一条被注释掉的 `/development` 路由和一个 `redirect`，
 * 连同一个只 import 不使用的 HomeView（内容是一个空的 <main>）。三者都是
 * Vue 脚手架时期的残留，从未被任何代码走到过，一并删掉——注释掉的路由不是
 * 文档，它既不会随重构一起更新，也拦不住任何人再加一条新的。
 */
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/DevelopmentView.vue'),
    },
  ],
})

export default router
