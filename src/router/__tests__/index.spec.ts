// @vitest-environment jsdom
//
// 需要 DOM 的理由只有一个：`createWebHashHistory` 在**创建时**就去读
// `window.location`，用 node 环境跑连 location 都没有。测的正是"打开这个
// 地址时路由把 hash 解析成了什么"，绕不开真实的 location。
//
// 覆盖的是 issue #1（<https://github.com/SkywalkerJi/kc-development-tools/issues/1>）：
// 旧书签 `https://御坂美琴.cn/kc-development-tools/?ja#/gen` 打开后页面中间
// 空白、且开发者工具里**没有任何报错**。原因不是加载失败，是路由表里只有
// `/` 一条记录，`/gen` 匹配不到任何 record，`matched` 为空数组，
// `<RouterView>` 于是什么都不渲染——vue-router 对"无匹配"只发一条
// `console.warn`，而那条 warn 在生产构建里被剥掉了，所以控制台是干净的。
// 这也是为什么这个缺陷靠"看控制台有没有红字"永远发现不了，值得单独钉一道
// 测试。
import { describe, it, expect, vi } from 'vitest'
import { createApp } from 'vue'
import type { Router } from 'vue-router'

/**
 * 模拟"用户直接打开某个地址"，返回那一刻冷启动出来的路由器。
 *
 * 三个细节都不是可有可无的：
 *
 * 1. **先写 `location.hash`，再 import 路由模块。** `createWebHashHistory`
 *    在构造时读取当时的 `window.location`，之后再改 hash 只会触发一次站内
 *    导航。而 issue #1 的场景是「书签直接命中这个地址」，不是「在站内跳过
 *    去」——两者走的代码路径不同（前者是初始解析，后者是 `push`），只测后者
 *    会漏掉初始解析这条真正出问题的路径。
 * 2. **`vi.resetModules()`。** `src/router/index.ts` 导出的是模块级单例，
 *    同一个测试文件里的第二条用例拿到的会是上一条用例用过、且已经停在上一个
 *    地址上的那一台。重置模块登记表让每条用例都重新执行一遍该模块，拿到真正
 *    "刚打开页面"的状态。
 * 3. **必须 `app.use(router)`，光 `createRouter` 不够。** vue-router 的初次
 *    导航不在创建路由器时发生，而是在 `install()` 里那句
 *    `push(routerHistory.location)`——不装进 app 就永远没有导航发生，
 *    `isReady()` 于是永远挂着（写这份测试时先踩了一次：五条用例全部 5 秒
 *    超时，连本该通过的 `#/` 也一样，症状与"断言失败"完全不同）。这里建一个
 *    不渲染任何东西的空 app，是为了走与 `main.ts` 同一条真实路径；不 `mount`
 *    是因为初次导航由 `use()` 触发，与挂载无关，而挂载会把整个
 *    DevelopmentView 拖进来（那是 views 那份测试的范围，不是这里的）。
 */
async function openAt(hash: string): Promise<Router> {
  window.location.hash = hash
  vi.resetModules()
  const router = (await import('../index')).default
  createApp({ render: () => null }).use(router)
  await router.isReady()
  return router
}

describe('旧书签地址仍然能进到首页（issue #1）', () => {
  // 真正的旧书签形态：**没有前导斜杠**。2021–2024 年住在这个 URL 上的那个
  // 原生 JS 版「KanColle Development Tools」用 tabcontrol.js 读
  // `location.hash.substr(1)` 切标签页，首页上三个标签的锚点就是
  // `#sim` / `#gen` / `#table`（见 router/index.ts 里的考证）。issue 里贴的
  // 是带斜杠的 `#/gen`，但那多半已经是被新应用改写过的地址栏内容，用户手上
  // 存的是下面这三个。三条都要真的跑一遍，而不是"推断前导斜杠会被补上"。
  it.each(['#sim', '#gen', '#table'])('旧版标签页锚点 %s 落到首页', async (hash) => {
    const router = await openAt(hash)
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.name).toBe('home')
  })

  // issue 里原样贴出的那条地址的 hash 部分（带前导斜杠的形态）。
  it('#/gen 落到首页而不是空白页', async () => {
    const router = await openAt('#/gen')
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.name).toBe('home')
  })

  // 顺带钉住 issue 里那条地址为什么带斜杠：vue-router 把 `gen` 规范化成
  // `/gen` 之后会用 `history.replace` 把地址栏改写成规范形式，用户看到、
  // 复制进 issue 的已经是改写后的结果。这条断言让这个解释不再停留在推断。
  it('无斜杠的旧锚点会被规范化后写回地址栏', async () => {
    await openAt('#gen')
    expect(window.location.hash).toBe('#/')
  })

  // 这一条是本仓库真实存在过的旧路由：def9b95 ~ 16e2bc3 期间路由表里有
  // `/development`，16e2bc3「精简路由」把它删了。任何在那段时间存过书签
  // 的人手上都是这个地址。
  it('#/development（本仓库真实存在过的旧路由）落到首页', async () => {
    const router = await openAt('#/development')
    expect(router.currentRoute.value.path).toBe('/')
  })

  // 旧的 history 模式书签（def9b95 用的是 createWebHistory）走的是另一条链：
  // 仓库改名的 301 → `/kc-development-tools/development` → GitHub Pages 找不到
  // 这个文件、返回 public/404.html → 那个跳板页把路径改写成 `#/development`
  // → 最后仍然落到这里。多层深的路径同样要兜住。
  it('多层深的未知路径也落到首页', async () => {
    const router = await openAt('#/a/b/c')
    expect(router.currentRoute.value.path).toBe('/')
  })

  // 真正的失败症状是 `matched` 为空（<RouterView> 无组件可渲染），单看
  // `path` 断言不出这一点——所以显式钉住它。没有这条，一个"重定向到
  // 一个同样匹配不到的地址"的错误实现也能让上面几条通过。
  it('兜底之后 matched 不为空（RouterView 有东西可渲染）', async () => {
    const router = await openAt('#/gen')
    expect(router.currentRoute.value.matched.length).toBeGreaterThan(0)
  })

  it('正常地址不受影响', async () => {
    const router = await openAt('#/')
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.name).toBe('home')
  })
})
