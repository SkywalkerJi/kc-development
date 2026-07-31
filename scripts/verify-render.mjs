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
 * 它既是一份报告，也是一道关卡：上面这些量不只是被记进
 * .superpowers/sdd-round2/render-verification.json，assertSnapshot() 还会
 * 拿它们跟期望值比较——元素缺失、秘书舰搜索没有产出建议、建议列表与输入框
 * 没有左对齐，任何一条不成立都会让整个进程以非零码退出。只把数字记进 JSON
 * 而不断言，等于没做核验：那样的话"这份 JSON 显示某处不对"这件事永远不会
 * 让人知道去看它。
 *
 * `VERIFY_RENDER_PORT` 环境变量：仅用于测试/演示——手动构造"端口已被占用"
 * 这类场景时，用它把 vite preview 强行钉在一个指定端口上（见 getFreePort()
 * 与 PORT_OVERRIDE 的注释）。pnpm verify-render 的正常路径不设它。
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
import { createServer as createNetServer } from 'node:net'
import { randomUUID } from 'node:crypto'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const OUT_DIR = join(ROOT, '.superpowers', 'sdd-round2')
const OUT_JSON = join(OUT_DIR, 'render-verification.json')

// 与 vite.config.ts 的 `base: '/kc-development/'`（生产构建）+ 路由用
// createWebHashHistory 保持一致——这两处任何一处改了，这里也要跟着改，
// 不从 vite.config.ts 动态读是因为那是个 TS 模块、这里是纯 Node 脚本，
// 犯不上为一个字符串常量拉一次完整的 vite 配置解析。
const BASE_PATH = '/kc-development/'

// 仅用于可控地复现"端口已被占用"这类失败场景（见 .superpowers/sdd-round3/
// report.md 里 Path A 的核验记录）——设了这个环境变量就跳过下面的
// getFreePort()，直接用给定端口起 vite preview（仍然带 --strictPort，
// 端口真被占用时 vite 照样绑定失败）。pnpm verify-render 的正常路径不设
// 它，永远走 getFreePort() 动态取一个当下空闲的端口。
const PORT_OVERRIDE = process.env.VERIFY_RENDER_PORT ? Number(process.env.VERIFY_RENDER_PORT) : null

const MARKER_FILENAME = '.verify-render-marker'

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

function ensureDistBuilt() {
  if (!existsSync(DIST)) {
    throw new Error(`dist/ 不存在：请先 pnpm build（或直接用 pnpm verify-render，已经把 build 接在前面）`)
  }
}

/** 找一个当下空闲的 TCP 端口：临时在 0 端口上监听拿 OS 分配到的实际端口号，
 *  随后立刻释放，再把这个端口号传给 vite preview --strictPort。用来替换
 *  写死的固定端口——机器上任何东西（包括这个工具自己上一次没清理干净的
 *  残留进程）占着某个固定端口都不会再影响这次运行。
 *
 *  这一步本身仍有极窄的竞态窗口（close() 之后、vite 真正 bind() 之前，
 *  理论上可能被第三个进程抢先绑到同一个端口），单靠"挑一个当下空闲的
 *  端口"不能 100% 排除连错服务器——所以不是唯一防线，下面 waitForPreviewReady()
 *  的 marker 核验才是"确认接的真的是这次启动的 vite"的决定性证据；动态
 *  端口只是把命中这条窄窗口的概率从"任何人固定用同一个端口都会撞上"
 *  降到"极小概率的时间竞态"。 */
async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createNetServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address()
      const port = typeof address === 'object' && address ? address.port : null
      srv.close((err) => {
        if (err) reject(err)
        else if (port === null) reject(new Error('无法从临时监听里读到分配到的端口号'))
        else resolve(port)
      })
    })
  })
}

/** 在 dist/ 里放一个内容随机、每次运行都不同的标记文件，配合下面
 *  waitForPreviewReady() 的 HTTP 核验使用：响应体与这里生成的 token
 *  逐字相同，才能确认驱动 Chrome 去访问的那台服务器，此刻确实在原样
 *  提供这一次的 dist/，而不是端口恰好被别的东西占用、或提供的是某次
 *  更早构建遗留下来的静态文件（Path A 的原始复现：vite preview 因端口
 *  被占用而绑定失败、提前退出，但端口上原本就有别的东西在监听，脚本
 *  对着那个东西核验还报出"全部完成"）。vite preview 对 outDir 下的
 *  任意文件一视同仁地原样提供，不需要它认识这个文件名。 */
function writeBuildMarker() {
  const token = randomUUID()
  writeFileSync(join(DIST, MARKER_FILENAME), token, 'utf8')
  return token
}

function removeBuildMarker() {
  try { rmSync(join(DIST, MARKER_FILENAME), { force: true }) } catch { /* 尽力清理，失败不影响退出码 */ }
}

/** `pnpm preview` 就是 vite 自带的静态服务器，遵循同一份 base/build 配置 —— 不必自己再拼一个。 */
function startPreviewServer(port) {
  ensureDistBuilt()
  const proc = spawn(
    'pnpm', ['exec', 'vite', 'preview', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  proc.capturedOutput = ''
  proc.stdout.on('data', (d) => { proc.capturedOutput += d })
  proc.stderr.on('data', (d) => { proc.capturedOutput += d })
  proc.on('exit', (code) => {
    if (code !== null && code !== 0) log(`[verify-render] vite preview 提前退出，code=${code}\n${proc.capturedOutput}`)
  })
  return proc
}

/**
 * 等预览服务器"真的"就绪——不是"能连上某个端口"，而是"这个端口应答的
 * 内容里有本次运行专属的 marker token"。这是 Path A 修复的核心：固定端口
 * 时代的 bug 正是 vite preview 绑端口失败、提前退出，但端口上原本就有别的
 * 东西在监听，`fetch(APP_URL)` 照样 200，脚本因此对着一个自己根本没启动
 * 的服务器往下核验，还报出"全部核验完成"退出码 0（复现记录见
 * .superpowers/sdd-round3/report.md）。
 *
 * 两件事同时做：
 * - 子进程提前退出就立即失败，不再傻等到 15s 超时——失败信息带上完整
 *   stdout/stderr，不需要再去猜为什么。用 Promise.race 而不是先 await
 *   一个再检查另一个：子进程可能在 marker 轮询期间的任意时刻退出，
 *   race 保证不管退出发生得多早都能被立刻捕捉到。
 * - "就绪"的判定标准是 marker 匹配，不是"能连上"——即便端口号本身没
 *   撞上任何人（现在是动态取的，撞上的概率已经很低），这条核验仍然是
 *   唯一直接回答"我接的到底是不是我刚启动的那个进程"的证据，不依赖
 *   端口选择策略本身有多可靠。
 */
async function waitForPreviewReady(proc, markerUrl, expectedToken) {
  const exited = new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve({ code: proc.exitCode, signal: proc.signalCode })
      return
    }
    proc.once('exit', (code, signal) => resolve({ code, signal }))
  })

  const ready = waitFor('vite preview 服务器就绪（marker 核验通过）', async () => {
    try {
      const res = await fetch(markerUrl)
      if (!res.ok) return false
      const body = await res.text()
      return body === expectedToken
    } catch {
      return false
    }
  }, 15000)

  const winner = await Promise.race([
    ready.then((v) => ({ kind: 'ready', v })),
    exited.then((v) => ({ kind: 'exited', v })),
  ])

  if (winner.kind === 'exited') {
    throw new Error(
      `vite preview 子进程在就绪前退出（code=${winner.v.code}, signal=${winner.v.signal}）——` +
      `没有连接到任何服务器，避免核验一个自己没启动的东西。子进程输出：\n${proc.capturedOutput}`,
    )
  }
  // winner.kind === 'ready'：到这里说明 marker 核验已经通过。如果 ready 这个
  // Promise 本身 reject（waitFor 超时），Promise.race 会直接把那次 rejection
  // 抛出来，不会走到这一行——用的还是 waitFor 原有的"等待超时"诊断信息。
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
    // 这里不抛出中断，只是为了让流程走到 captureSnapshot()、把
    // suggestionsCount===0 这个真实状态如实拍下来，而不是让整个核验工具
    // 在这一步就崩掉、连快照都拍不到。"不在这里抛错"不等于"这个结果被
    // 放过"——assertSnapshot() 会在快照拍完之后把 suggestionsCount===0
    // 变成一条 hardFailures，最终仍然让整个进程以非零码退出，见下面
    // assertSnapshot() 的定义与注释。
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
    // 同上（见 triggerFlagshipSearch 里的同款注释）：不在这里抛错，只是
    // 为了让 captureSnapshot() 仍能拍到"表头没出现"这个真实状态，而不是
    // 让核验工具在这一步就崩掉。空表头不是"有效的业务性结果"——.development-results
    // 的 <table> 由 v-if="hasSelectedEquipments" 控制，<thead> 里的列头是
    // RESULT_COLUMNS 这个静态常量渲染出来的、不依赖是否算出任何可用配方
    // 行；"某件装备确实没有可用配方"这种业务性的空，表现是 tbody 没有
    // 行，thead 仍然会有列头。thead 为空只能是选中没生效或表没渲染成功，
    // 是真实缺陷——assertSnapshot() 会把它变成一条 hardFailures，见该函数
    // 的定义与注释，不是"记录下来就算数"。
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
// 断言
// ---------------------------------------------------------------------------

/** boxes 里要求非空（getBoundingClientRect 拿到了元素）的选择器，
 *  与 captureSnapshot() 里 boxes 字段的键一一对应。 */
const REQUIRED_BOXES = ['secretaryTypeLabel', 'secretarySelect', 'flagshipInput', 'suggestionsList', 'flagshipLabel', 'leftPanel']

/**
 * 把 captureSnapshot() 抓到的原始数据变成断言。这个 harness 存在的唯一
 * 理由就是查这几件事有没有做到——只记录数字、不拿它们跟期望值比较，
 * 等于没做核验：改造前 hardFailures 只收"整个 locale 核验失败"这一种
 * 情况，搜索空结果、建议列表零条、元素缺失、建议列表与输入框没对齐，
 * 全部只进 JSON、不进 hardFailures，退出码永远是 0（复现记录见
 * .superpowers/sdd-round3/report.md 的 Path B 部分）。
 *
 * 返回失败描述数组，调用方把它们追加进 hardFailures；长度 0 表示这份
 * 快照的全部断言通过。
 */
function assertSnapshot(locale, width, snapshot) {
  const failures = []
  const fail = (msg) => failures.push(`[${locale}@${width}] ${msg}`)

  if (snapshot.secretaryOptions.length === 0) fail('秘书舰下拉框没有任何选项')
  if (snapshot.equipmentListHeaders.length === 0) fail('装备列表表头缺失')
  // .development-results 的 <table> 由 v-if="hasSelectedEquipments" 控制，
  // 但 <thead> 里的列头本身是 RESULT_COLUMNS 这个静态常量渲染出来的、不
  // 依赖是否算出任何可用配方行——selectFirstEquipment() 已经在进入这个
  // 视口循环之前选中了一件装备，这里为空只能是选中没生效或表没渲染，
  // 不是"这件装备恰好没有可用配方"那种业务性的空（那种情况下 thead 仍然
  // 会有列头，只是 tbody 没有行，不会让这条断言失败）。
  if (snapshot.recipeTableHeaders.length === 0) fail('可用公式表头缺失（selectFirstEquipment 应已选中装备并渲染出静态列头）')
  if (snapshot.equipmentButtonSample.length === 0) fail('装备按钮样本为空')
  if (!snapshot.title) fail('document.title 为空')
  if (snapshot.htmlLang !== locale) fail(`<html lang>=${JSON.stringify(snapshot.htmlLang)}，应为 ${JSON.stringify(locale)}`)

  if (snapshot.suggestionsCount === 0) fail(`秘书舰搜索（关键字「${FLAGSHIP_SEARCH_KEYWORD}」）没有产出任何建议`)

  for (const key of REQUIRED_BOXES) {
    if (snapshot.boxes[key] === null) fail(`元素缺失，getBoundingClientRect 拿不到：boxes.${key}`)
  }
  for (const key of ['secretaryType', 'flagship']) {
    if (snapshot.labelIntrinsic[key] === null) fail(`元素缺失：labelIntrinsic.${key}`)
  }

  // 建议列表要与输入框左边缘对齐（详见 FlagshipSearch.vue 里 .field 那段
  // 样式注释），不能因为窄视口下标签把输入框挤到换行、建议列表却还悬浮在
  // 按标签宽度算出的旧位置。这两个矩形此前只被记进 JSON，从未在这里
  // 比较过——记录不等于核验。
  const { suggestionsList, flagshipInput } = snapshot.boxes
  if (suggestionsList && flagshipInput && suggestionsList.x !== flagshipInput.x) {
    fail(`建议列表与输入框未左对齐：suggestionsList.x=${suggestionsList.x} ≠ flagshipInput.x=${flagshipInput.x}`)
  }

  return failures
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  ensureDistBuilt()

  const previewPort = PORT_OVERRIDE ?? await getFreePort()
  const origin = `http://127.0.0.1:${previewPort}`
  const appUrl = `${origin}${BASE_PATH}#/`
  const markerUrl = `${origin}${BASE_PATH}${MARKER_FILENAME}`
  const marker = writeBuildMarker()

  const previewProc = startPreviewServer(previewPort)
  const userDataDir = mkdtempSync(join(tmpdir(), 'kc-dev-verify-render-'))
  let chromeProc
  let cdp
  const findings = { generatedAt: new Date().toISOString(), appUrl, locales: {} }
  const hardFailures = []

  try {
    await waitForPreviewReady(previewProc, markerUrl, marker)
    log(`[verify-render] preview 就绪（marker 核验通过）：${appUrl}`)

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
        // 每个 locale 用带唯一 query 的 URL 而不是重复用同一个 appUrl：
        // 应用是 hash-router 的单页应用，Page.navigate 到一个与当前地址栏
        // 完全相同的 URL（协议+host+path+hash 全同）不保证触发真实的整页
        // 重新加载——实测第二个 locale 起，Chrome 把它当同文档导航处理，
        // 页面 JS 上下文原样保留，新写进 localStorage 的 locale 根本没机会
        // 被读到，<html lang> 永远停在第一个 locale，等 400 秒都等不到目标
        // 值。query 只用来让每次的 URL 字符串互不相同，服务器和路由都不解析它。
        const navUrl = `${appUrl.replace('#/', '')}?_locale=${locale}#/`
        await cdp.send('Page.navigate', { url: navUrl })
        await waitForAppSettled(cdp, locale)

        const searchTriggered = await triggerFlagshipSearch(cdp)
        const equipmentSelected = await selectFirstEquipment(cdp)
        localeResult.searchTriggered = searchTriggered
        localeResult.equipmentSelected = equipmentSelected
        // 这两步本身也是 harness 存在的理由之一：元素找不到、点不动都是
        // 真实缺陷，不能只记录布尔值不追究。
        if (!searchTriggered) hardFailures.push(`[${locale}] 秘书舰搜索输入框 #flagship 不存在，无法触发搜索`)
        if (!equipmentSelected) hardFailures.push(`[${locale}] 没有任何可点击的装备按钮，无法选中装备`)

        for (const width of VIEWPORTS) {
          await setViewport(cdp, width)
          const snapshot = await captureSnapshot(cdp)
          localeResult.viewports[width] = snapshot
          hardFailures.push(...assertSnapshot(locale, width, snapshot))
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
    removeBuildMarker()
  }

  writeFileSync(OUT_JSON, JSON.stringify(findings, null, 2))
  log(`\n[verify-render] 完整结果已写入 ${OUT_JSON}`)
  log('\n' + '='.repeat(78))
  log(JSON.stringify(findings, null, 2))
  log('='.repeat(78))

  if (hardFailures.length > 0) {
    log(`\n[verify-render] ${hardFailures.length} 项断言未通过：`)
    hardFailures.forEach((m) => log(`  - ${m}`))
    process.exitCode = 1
  } else {
    log(`\n[verify-render] 全部 ${LOCALES.length} 个语言 × ${VIEWPORTS.length} 档视口，核验断言全部通过。`)
  }
}

main().catch((e) => {
  console.error('[verify-render] 未捕获的错误：', e)
  process.exitCode = 1
})
