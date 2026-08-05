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
    /*
     * 认不出来的地址一律回首页。
     *
     * 缺这一条时的症状不是报错，是**静默的白页**（issue #1）：路由表只有
     * `/`，`#/gen` 这样的地址匹配不到任何 record，`matched` 是空数组，
     * `<RouterView>` 于是什么都不渲染；vue-router 对"无匹配"只发一条
     * console.warn，而那条 warn 在生产构建里被剥掉——报告人原话是"开发者
     * 工具也没有报错"，页面中间空白。整个失败模式没有任何可见信号，这也是
     * 它值得配一份测试（`__tests__/index.spec.ts`）而不只是"改一行"的原因。
     *
     * 需要兜底的根源是：`/kc-development-tools/` 这个地址上**先后住过三个
     * 不同的应用**，各自有各自的一套地址，而书签不会跟着换。按时间：
     *
     * 1. 2018 ~ 2024-12：原生 JS 版「KanColle Development Tools」
     *    （<https://github.com/SkywalkerJi/kc-development-tools-old> 的早期
     *    历史，已归档）。三个标签页由 tabcontrol.js 读
     *    `location.hash.substr(1)` 切换，首页锚点是 `#sim` / `#gen` /
     *    `#table` —— issue #1 报告的 `#/gen` 就是其中的 `#gen`（generator.js
     *    那一页）。**注意锚点原本没有前导斜杠**，issue 里贴出的那条带斜杠，
     *    是因为新应用加载后 vue-router 把 `gen` 规范化成 `/gen` 又用
     *    history.replace 写回了地址栏，用户复制到的已经是改写后的结果
     *    （`__tests__/index.spec.ts` 里有一条断言钉住这个改写）。
     * 2. 2024-12：同一仓库改写为 Next.js，地址变成真实路径 `/formula`
     *    `/simulator` `/table` `/secretary-editor`。
     * 3. 2026-07-31 起：本仓库（Vue）改名后接管这个路径。
     *
     * 另外还有本仓库自己产生的一类：`#/development` —— def9b95 ~ 16e2bc3
     * 期间路由表里真的有这一条，16e2bc3「精简路由」把它删了。
     *
     * 第 2 类那种真实路径的旧书签经过的链更长，但终点相同：
     * `/kc-development-tools/formula` → GitHub Pages 没有这个文件、返回
     * public/404.html → 那个跳板页把路径改写成 `#/formula` → 落到这里。
     * 这条链只有在这条兜底存在时才闭合，改 404.html 的人需要知道它的下游
     * 是这里。
     *
     * 选 `redirect` 而不是"渲染一个提示页"：整个应用只有「装备开发」这一个
     * 界面，任何旧地址的用户意图都只可能是"打开这个工具"，多一次点击没有
     * 给他任何他不知道的信息。`redirect` 还会顺手把地址栏改写成规范地址，
     * 用户重新收藏时拿到的就是新的那个。
     *
     * 不会遮住 `/`：vue-router 的匹配按路径评分排序，静态段永远优于
     * 通配参数，与声明顺序无关。以后新增真实路由同样不需要考虑这条的位置。
     *
     * ⚠️ 这条只管路由，**不**恢复 `?ja` 这类查询串。上面第 1 代应用的
     * lang.js 确实读过 `location.search.substr(1)`，取值 `en` / `zh` /
     * `zh-tw` / `ja`，查不到就退回浏览器探测——所以 `?ja` 在这个地址上历史
     * 上是有意义的。但它在第 2 代（Next.js）重写时就已经失效（那一版把语言
     * 写死成 zh_cn，只留页内切换器），不是本仓库这次接管造成的回归。本仓库
     * 的语言由 localStorage 与浏览器探测决定，见 i18n/index.ts 的
     * initLocale——那里对"localStorage 记的是用户的选择、不是探测结果"有一段
     * 专门的论证，要加第三个来源需要先回答"查询串该不该盖过用户存过的选择、
     * 该不该被持久化"，不是这条兜底路由能顺手带上的事。
     */
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
