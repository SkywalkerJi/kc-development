#!/usr/bin/env node
/**
 * headless-Chrome 渲染核验：跑真实的生产构建 + 真实浏览器布局，人工 review
 * 时那次外部评审能看见的东西（渲染出的文案、真实 getBoundingClientRect、
 * 真实 getComputedStyle），本仓库 1300+ 项单测一条也看不见——它们全部跑在
 * jsdom 里，jsdom 不做布局（宽高、位置一律是 0）、也不解析 CSS（:lang()
 * 选择器、字体栈、CSS 自定义属性统统不生效）。
 *
 * 不用 puppeteer/playwright：本项目的运行时依赖只有 vue/pinia/vue-router，
 * 刻意不引入能自己写的依赖（同 sync-data.mjs/sync-i18n.mjs 的既有原则）。
 * Chrome Devtools Protocol 走的是普通 WebSocket + JSON 消息，Node 22 起
 * `fetch`/`WebSocket` 都是无需额外依赖的全局对象——用它们直接说 CDP 就够了，
 * 犯不上为此再管理一个客户端库的版本。
 *
 * 用法：
 *   pnpm verify-render          # 复用已有的 dist/（需要先 pnpm build）
 *   pnpm build && pnpm verify-render
 * package.json 里的 verify-render 脚本已经把 `pnpm build &&` 接在前面，
 * 直接 `pnpm verify-render` 即可——写成两步是为了这个文件本身也能在
 * 已经 build 过、只想重跑核验的时候单独执行（node scripts/verify-render.mjs）。
 *
 * 覆盖范围见 README「渲染核验」一节；简言之：四语言 × 两档视口的秘书舰
 * 下拉框选项、公式表表头、装备按钮样本、document.title/<html lang>、
 * body 实际解析到的 font-family，以及「秘书舰类型」标签/下拉框/秘书舰
 * 搜索输入框/建议列表 ul 的 getBoundingClientRect；外加两个标签在不受
 * --form-label-width 约束时的 shrink-to-fit 真实宽度与字号
 * （labelIntrinsic，供 base.css 的 --form-label-width 取值使用，
 * 见 captureSnapshot 里的说明）。
 *
 * ⚠️ 故意不接入 `pnpm test`：它依赖本机装有 /usr/bin/google-chrome，
 * 没有 Chrome 的机器上跑 `pnpm test` 不该因此变红——这是一道独立的、
 * 需要真实浏览器才能跑的关卡，不是单测套件的一部分。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const OUT_DIR = join(ROOT, '.superpowers', 'sdd-round2')
const OUT_JSON = join(OUT_DIR, 'render-verification.json')

// 与 vite.config.ts 的 `base: '/kc-development/'`（生产构建）+ 路由用
// createWebHashHistory 保持一致——这两处任何一处改了，这里也要跟着改，
// 不从 vite.config.ts 动态读是因为那是个 TS 模块、这里是纯 Node 脚本，
// 犯不上为一个字符串常量拉一次完整的 vite 配置解析。
const BASE_PATH = '/kc-development/'
const PREVIEW_PORT = 4956
const APP_URL = `http://127.0.0.1:${PREVIEW_PORT}${BASE_PATH}#/`

const LOCALES = ['zh-Hans', 'zh-Hant', 'ja', 'en']
const VIEWPORTS = [1400, 1024]
const STORAGE_KEY = 'kc-development.locale' // 必须与 src/i18n/index.ts 的 STORAGE_KEY 一致

// 搜索关键字必须落在「日文原名 / 假名读音」这两个不随语言变化的维度上
// （见 src/components/FlagshipSearch.vue 的 suggestions computed）——若改用
// 某语言的译名，只有那一种语言下能搜到，其余三语言会看到空的建议列表，
// 报出一个不存在的缺陷。金刚是系列最早期、几乎每一份 start2.json 都有的
// 舰船，用它的日文原名做关键字。
const FLAGSHIP_SEARCH_KEYWORD = '金剛'

const WAIT_TIMEOUT_MS = 20000
const POLL_INTERVAL_MS = 150

function log(...args) { console.log(...args) }

/** SIGTERM 一个子进程并**等它真的退出**（不只是发信号）——`rmSync` user-data-dir
 *  紧跟在 kill 后面时，若不等退出，Chrome 可能还没放开对该目录里文件的持有，
 *  rmSync 会静默失败（catch 吞掉了错误），留下一个没人清理的临时目录。
 *  超时未退出则升级成 SIGKILL，避免僵住整个脚本的收尾。 */
function killAndWait(proc, timeoutMs = 5000) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const t = setTimeout(() => { try { proc.kill('SIGKILL') } catch { /* 已退出也无所谓 */ } }, timeoutMs)
    proc.once('exit', () => { clearTimeout(t); resolve() })
    try { proc.kill('SIGTERM') } catch { clearTimeout(t); resolve() }
  })
}

/** 轮询 `fn()`，直到它返回真值或超时。超时抛错，错误信息里带上 label 方便定位。 */
async function waitFor(label, fn, timeoutMs = WAIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  let lastErr
  while (Date.now() < deadline) {
    try {
      const v = await fn()
      if (v) return v
    } catch (e) {
      lastErr = e
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(`等待超时（${timeoutMs}ms）：${label}${lastErr ? `；最后一次错误：${lastErr}` : ''}`)
}

// ---------------------------------------------------------------------------
// 生产构建 + 静态服务器
// ---------------------------------------------------------------------------

/** `pnpm preview` 就是 vite 自带的静态服务器，遵循同一份 base/build 配置 —— 不必自己再拼一个。 */
function startPreviewServer() {
  if (!existsSync(DIST)) {
    throw new Error(`dist/ 不存在：请先 pnpm build（或直接用 pnpm verify-render，已经把 build 接在前面）`)
  }
  const proc = spawn(
    'pnpm', ['exec', 'vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let out = ''
  proc.stdout.on('data', (d) => { out += d })
  proc.stderr.on('data', (d) => { out += d })
  proc.on('exit', (code) => {
    if (code !== null && code !== 0) log(`[verify-render] vite preview 提前退出，code=${code}\n${out}`)
  })
  return proc
}

async function waitForPreviewReady() {
  await waitFor('vite preview 服务器就绪', async () => {
    try {
      const res = await fetch(APP_URL)
      return res.ok
    } catch {
      return false
    }
  }, 15000)
}

// ---------------------------------------------------------------------------
// headless Chrome + CDP
// ---------------------------------------------------------------------------

/** 启动 headless Chrome，通过 user-data-dir 里的 DevToolsActivePort 文件拿到实际监听端口——
 *  比解析 stderr 里的 "DevTools listening on ws://..." 那行更稳，不依赖具体的日志措辞。 */
function startChrome(userDataDir) {
  const proc = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions', // 关掉自带的 Hangouts 等后台扩展页面，/json/list 里只剩下我们要的那个 page target
    '--disable-background-networking',
    '--no-sandbox', // 容器/CI 环境常见必需项；本机是本地验证工具，不是面向不可信输入的服务
    '--hide-scrollbars',
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  let err = ''
  proc.stderr.on('data', (d) => { err += d })
  proc.on('exit', (code) => {
    if (code !== null && code !== 0) log(`[verify-render] Chrome 提前退出，code=${code}\n${err}`)
  })
  return proc
}

async function waitForChromePort(userDataDir) {
  const portFile = join(userDataDir, 'DevToolsActivePort')
  const port = await waitFor('Chrome 写出 DevToolsActivePort', () => {
    if (!existsSync(portFile)) return null
    const firstLine = readFileSync(portFile, 'utf8').split('\n')[0].trim()
    return firstLine ? Number(firstLine) : null
  }, 10000)
  await waitFor('Chrome CDP HTTP 端点响应', async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      return res.ok
    } catch {
      return false
    }
  }, 10000)
  return port
}

async function findPageTarget(cdpPort) {
  const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
  const page = list.find((t) => t.type === 'page' && !String(t.url).startsWith('chrome-extension://'))
  if (!page) throw new Error(`/json/list 里找不到可用的 page target：${JSON.stringify(list)}`)
  return page
}

/**
 * 极简 CDP 客户端：一个 WebSocket + 自增 id 的请求/响应配对。
 * 不需要事件订阅（Page.loadEventFired 之类）——这里全程靠 Runtime.evaluate
 * 轮询应用自己的状态来判断"是否已经就绪"，比订阅生命周期事件更贴近
 * "用户看到的是什么"，也不用应付 SPA 的 hash 路由不触发新一次 load 事件
 * 这类细节。
 */
class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.nextId = 1
    this.pending = new Map()
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(`CDP 错误 ${JSON.stringify(msg.error)}`))
        else resolve(msg.result)
      }
    })
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true })
      this.ws.addEventListener('error', (e) => reject(e), { once: true })
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  close() { try { this.ws.close() } catch { /* 已经关了也无所谓 */ } }
}

/** Runtime.evaluate 一段返回可 JSON 序列化值的表达式，直接拿到反序列化后的结果。 */
async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  })
  if (result.exceptionDetails) {
    throw new Error(`页面内表达式抛错：${JSON.stringify(result.exceptionDetails)}`)
  }
  return result.result.value
}

// ---------------------------------------------------------------------------
// 每个 locale 内部的核验步骤
// ---------------------------------------------------------------------------

/**
 * 用 Page.addScriptToEvaluateOnNewDocument 在应用自己的脚本跑之前把 locale
 * 写进 localStorage——这正是"真实用户"会经历的路径：src/i18n/index.ts 的
 * initLocale() 冷启动时优先读 localStorage.getItem('kc-development.locale')，
 * 读到合法值就直接用，不再走 navigator.languages 探测。
 *
 * 没有选用另一条路（伪造 navigator.languages 让应用走探测分支）：那需要
 * 用 `--lang=` 启动参数或 Emulation 覆盖，每语言至少一次独立的浏览器/
 * 会话隔离，比 localStorage 注入重得多，換来的收益只是多验证 detect.ts
 * 这一层——而 detect.ts 已经有 Fix A 那份详尽的单测覆盖（src/i18n/
 * __tests__/detect.spec.ts），不需要再靠一个真实浏览器复核一遍纯函数的
 * 输入输出映射。这个核验工具要看的是 jsdom 看不见的部分：真实渲染与真实
 * 布局，locale 只是驱动它们的输入，走哪条路径进来不影响这个目标。
 */
async function seedLocale(cdp, locale, previousScriptId) {
  if (previousScriptId) {
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: previousScriptId })
  }
  const source = `
    try {
      localStorage.clear();
      localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(locale)});
    } catch (e) { /* 隐私模式等场景下 localStorage 不可写，交给应用自己的兜底处理 */ }
  `
  const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source })
  return identifier
}

/** 等到 DataInitializer 的加载态消失、秘书舰下拉框有选项、且 <html lang> 已经写成目标语言。 */
async function waitForAppSettled(cdp, locale) {
  await waitFor(`应用在 ${locale} 下完成初始化`, () => evaluate(cdp, `(() => {
    const loading = document.querySelector('.data-loading');
    const sel = document.querySelector('#poolSelect');
    return !loading && !!sel && sel.options.length > 0
      && document.documentElement.lang === ${JSON.stringify(locale)};
  })()`))
}

/** 往秘书舰搜索框里打字触发建议列表；用 dispatchEvent('input') 而不是只设 .value——
 *  FlagshipSearch.vue 的 v-model 绑的是 @input，只改 DOM 属性不派发事件，Vue 侧的
 *  keyword ref 不会更新，suggestions 计算属性也就不会重新求值，会报出一个不存在的缺陷。 */
async function triggerFlagshipSearch(cdp) {
  const ok = await evaluate(cdp, `(() => {
    const el = document.querySelector('#flagship');
    if (!el) return false;
    el.value = ${JSON.stringify(FLAGSHIP_SEARCH_KEYWORD)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)
  if (!ok) return false
  try {
    await waitFor('秘书舰建议列表出现', () => evaluate(cdp, `document.querySelectorAll('.suggestions li').length > 0`), 2000)
  } catch {
    // 允许失败：某些语言下译名候选可能与关键字不完全一致（理论上不该，
    // 因为搜的是日文原名维度），但这不该让整个核验工具崩掉——记录下来
    // 比在这里抛出中断更有诊断价值，captureSnapshot 里的 suggestionsCount
    // 会如实反映"到底出没出现"。
  }
  return true
}

/** 点第一个可用的装备按钮，让「可用公式」表真的有内容可看——它的 <table> 整体
 *  由 v-if="hasSelectedEquipments" 控制，不选中任何装备时连表头都不会渲染。
 *  副作用（有意接受，不是本工具要规避的东西）：DevelopmentView.toggleEquipment
 *  选中第一件装备后会自动应用第一条可用配方、覆盖资源输入框——这是本项目
 *  区别于参考实现的既有交互设计，不是这个核验脚本引入的副作用。 */
async function selectFirstEquipment(cdp) {
  const ok = await evaluate(cdp, `(() => {
    const btn = document.querySelector('.equipment-buttons button:not(.disabled)')
      || document.querySelector('.equipment-buttons button');
    if (!btn) return false;
    btn.click();
    return true;
  })()`)
  if (!ok) return false
  try {
    await waitFor('公式表表头出现', () => evaluate(cdp, `document.querySelectorAll('.development-results thead th').length > 0`), 2000)
  } catch {
    // 同上：记录空表头本身就是有效发现（比如联合准入判定后确实没有可用配方），
    // 不该让整个核验工具因此中断。
  }
  return true
}

async function setViewport(cdp, width) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height: 1000, deviceScaleFactor: 1, mobile: false,
  })
  // Emulation 覆盖生效到下一帧渲染之间有极短的异步窗口；轮询
  // window.innerWidth 而不是固定 sleep，避免在快/慢机器上二选一都不稳。
  await waitFor(`视口宽度切到 ${width}`, () => evaluate(cdp, `window.innerWidth === ${width}`), 3000)
}

/** 一次性抓取当前 DOM/CSSOM 状态里我们关心的全部东西，一趟 Runtime.evaluate 完成，
 *  减少多次跨进程往返之间状态漂移的窗口（比如两次调用之间用户输入被处理掉一半）。 */
async function captureSnapshot(cdp) {
  return evaluate(cdp, `(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom };
    };
    const texts = (sel) => Array.from(document.querySelectorAll(sel)).map((el) => el.textContent.trim());
    // Fix 5 专用：--form-label-width 三个 :lang() 覆盖值此前是按字符数估的
    // （base.css 里明确写着"pending measurement"），现在有真实浏览器了，
    // 量真的。rect(sel) 量出来的宽度对这两个 label 没用——它们自己就有
    // width: var(--form-label-width) 这条样式规则，读到的永远是这个变量
    // 解析出的值，不是文字实际需要的宽度（循环论证）。这里临时把 inline
    // style 的 width 盖成 auto（inline style 优先级天然高于样式表规则，
    // 不需要 !important），量 shrink-to-fit 之后的真实内容宽度，再把
    // inline style 清空复原——这两个 label 都没有 padding/border（见
    // FlagshipSearch.vue / DevelopmentView.vue 的 scoped 样式），量出来的
    // 就是纯文字宽度，不含盒模型噪音。同时带上 fontSize：两个 label 是否
    // 共享同一套字号是"能不能用同一个 em 值"这个假设成不成立的前提，
    // base.css 里 --form-label-width 那条 ⚠️ 注释警告过 em 在不同元素上
    // 可能解析到不同字号，这里直接测，不再靠假设。
    //
    // （这几行注释同样不能用反引号——原因见下面 boxes 字段里那条已有的
    // 警告，本函数整体是一个反引号模板字符串，注释内容原样发给浏览器
    // 执行，反引号会被当成字符串边界。）
    const intrinsicWidth = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const prevWidth = el.style.width;
      el.style.width = 'auto';
      const width = el.getBoundingClientRect().width;
      const fontSize = getComputedStyle(el).fontSize;
      el.style.width = prevWidth;
      return { width, fontSize };
    };
    return {
      secretaryOptions: texts('#poolSelect option'),
      equipmentListHeaders: texts('.equipment-list thead th'),
      recipeTableHeaders: texts('.development-results thead th'),
      equipmentButtonSample: texts('.equipment-buttons button').slice(0, 8),
      suggestionsCount: document.querySelectorAll('.suggestions li').length,
      suggestionsSample: texts('.suggestions li').slice(0, 5),
      title: document.title,
      htmlLang: document.documentElement.lang,
      bodyFontFamily: getComputedStyle(document.body).fontFamily,
      // 设计稿里唯一标注"从未用真实浏览器测过"的量：base.css 的 --form-label-width。
      // 自定义属性本身只读得到作者写的原始 token（比如 "11em"），不是解析后的像素——
      // 真正回答"到底占多宽"的是下面 boxes.secretaryTypeLabel 的 getBoundingClientRect。
      formLabelWidthRaw: getComputedStyle(document.body).getPropertyValue('--form-label-width').trim(),
      boxes: {
        secretaryTypeLabel: rect('.secretary-select label'),
        secretarySelect: rect('#poolSelect'),
        flagshipInput: rect('#flagship'),
        suggestionsList: rect('.suggestions'),
        // 额外多带两个（⚠️ 这几行注释不能用反引号——本函数整体是一个用
        // 反引号包起来的模板字符串，字符串内容原样发给浏览器执行，注释里
        // 出现的反引号会被当成模板字符串的边界，把这段字符串截断，见本函数
        // 上一次修订踩过的坑）：
        // - FlagshipSearch 自己的「秘书舰」标签同样吃 --form-label-width，
        //   任务原文没点名它，但它与上面四个共同回答的是同一个问题（标签是
        //   否会在窄视口把输入框挤到换行），多一个选择器的成本可以忽略。
        // - .left-panel 是"标签+控件够不够宽"这个问题里真正的分母——
        //   .left-panel 的 flex: 0 0 45% 外面还套着 .development-view 的
        //   max-width: 1200px + padding: 20px，以及 main 的 padding: 1rem，
        //   45% 不是直接乘视口宽度就完，实测这个盒子的宽度才能算出"标签+
        //   控件"与"可用空间"的真实对比，不用再对着一堆 padding/max-width
        //   心算、心算还容易算错（这条正是上一轮报告审阅时被指出的错误）。
        flagshipLabel: rect('.flagship-search label'),
        leftPanel: rect('.left-panel'),
      },
      labelIntrinsic: {
        secretaryType: intrinsicWidth('.secretary-select label'),
        flagship: intrinsicWidth('.flagship-search label'),
      },
    };
  })()`)
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const previewProc = startPreviewServer()
  const userDataDir = mkdtempSync(join(tmpdir(), 'kc-dev-verify-render-'))
  let chromeProc
  let cdp
  const findings = { generatedAt: new Date().toISOString(), appUrl: APP_URL, locales: {} }
  const hardFailures = []

  try {
    await waitForPreviewReady()
    log(`[verify-render] preview 就绪：${APP_URL}`)

    chromeProc = startChrome(userDataDir)
    const cdpPort = await waitForChromePort(userDataDir)
    log(`[verify-render] Chrome CDP 就绪，端口 ${cdpPort}`)

    const pageTarget = await findPageTarget(cdpPort)
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl)
    await cdp.ready()
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    let scriptId = null
    for (const locale of LOCALES) {
      log(`[verify-render] === ${locale} ===`)
      const localeResult = { viewports: {} }
      try {
        scriptId = await seedLocale(cdp, locale, scriptId)
        // 每个 locale 用带唯一 query 的 URL 而不是重复用同一个 APP_URL：
        // 应用是 hash-router 的单页应用，Page.navigate 到一个与当前地址栏
        // 完全相同的 URL（协议+host+path+hash 全同）不保证触发真实的整页
        // 重新加载——实测第二个 locale 起，Chrome 把它当同文档导航处理，
        // 页面 JS 上下文原样保留，新写进 localStorage 的 locale 根本没机会
        // 被读到，<html lang> 永远停在第一个 locale，等 400 秒都等不到目标
        // 值。query 只用来让每次的 URL 字符串互不相同，服务器和路由都不解析它。
        const navUrl = `${APP_URL.replace('#/', '')}?_locale=${locale}#/`
        await cdp.send('Page.navigate', { url: navUrl })
        await waitForAppSettled(cdp, locale)

        const searchTriggered = await triggerFlagshipSearch(cdp)
        const equipmentSelected = await selectFirstEquipment(cdp)
        localeResult.searchTriggered = searchTriggered
        localeResult.equipmentSelected = equipmentSelected

        for (const width of VIEWPORTS) {
          await setViewport(cdp, width)
          localeResult.viewports[width] = await captureSnapshot(cdp)
        }
      } catch (e) {
        const msg = `${locale} 核验失败：${e.message ?? e}`
        log(`[verify-render] ✗ ${msg}`)
        localeResult.error = msg
        hardFailures.push(msg)
      }
      findings.locales[locale] = localeResult
    }
  } finally {
    cdp?.close()
    await killAndWait(chromeProc)
    await killAndWait(previewProc)
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* 尽力清理，失败不影响退出码 */ }
  }

  writeFileSync(OUT_JSON, JSON.stringify(findings, null, 2))
  log(`\n[verify-render] 完整结果已写入 ${OUT_JSON}`)
  log('\n' + '='.repeat(78))
  log(JSON.stringify(findings, null, 2))
  log('='.repeat(78))

  if (hardFailures.length > 0) {
    log(`\n[verify-render] ${hardFailures.length} 个语言未能完成核验：`)
    hardFailures.forEach((m) => log(`  - ${m}`))
    process.exitCode = 1
  } else {
    log(`\n[verify-render] 全部 ${LOCALES.length} 个语言 × ${VIEWPORTS.length} 档视口核验完成。`)
  }
}

main().catch((e) => {
  console.error('[verify-render] 未捕获的错误：', e)
  process.exitCode = 1
})
