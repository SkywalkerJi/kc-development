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
 * 拿它们跟期望值比较。这份"期望值"不是单一种比法——文案类的量（标题、
 * 两个标签、两张表头、建议列表前几条、字体栈、--form-label-width）逐字
 * 精确到每个语言各自的期望字符串；秘书舰下拉框/装备按钮这两张数据驱动、
 * 数量大（前者 45 条、后者六七百条）的列表不逐字全量钉死（那样任何一次
 * 游戏数据更新都会让这里报一堆无关的假警报），改成"锚点 + 形状"：钉住
 * 每个语言各自的第一条（真的换了语言、顺序错了照样会报错），加上一条
 * 贯穿全表的性质校验——见 assertSnapshot() 里 en 分支的说明；元素缺失、
 * 秘书舰搜索没有产出建议、建议列表与输入框没有左对齐、任意 box 越出视口，
 * 任何一条不成立都会让整个进程以非零码退出。只把数字记进 JSON 而不断言，
 * 等于没做核验：那样的话"这份 JSON 显示某处不对"这件事永远不会让人知道
 * 去看它。
 *
 * `VERIFY_RENDER_PORT` 环境变量：仅用于测试/演示——手动构造"端口已被占用"
 * 这类场景时，用它把 vite preview 强行钉在一个指定端口上（见 PORT_OVERRIDE
 * 的注释）。pnpm verify-render 的正常路径不设它。
 *
 * ⚠️ 故意不接入 `pnpm test`：它依赖本机装有 /usr/bin/google-chrome，
 * 没有 Chrome 的机器上跑 `pnpm test` 不该因此变红——这是一道独立的、
 * 需要真实浏览器才能跑的关卡，不是单测套件的一部分。
 *
 * round4 Fix 1（重要，纠正 round3 遗留的一个错误结论）：round3 曾经认为
 * "marker 内容匹配"本身就是"接到的是我们这次启动的进程"的证据（见下面
 * waitForPreviewReady() 和 writeBuildMarker() 的注释——那两段注释这次
 * 都改写了，原因见那里）。这个结论是错的：marker 文件写在 dist/ 里，
 * vite preview 对 dist/ 下的任意文件都是"每次请求现读磁盘、原样返回"，
 * 不区分是不是本进程启动之后才出现的文件——这意味着**任何**同样指向
 * 这份 dist/ 的服务器（哪怕是上一次会话遗留、没清理干净的旧 vite
 * preview）都会读到我们刚写的新 marker、原样答对，marker 检查因此测的是
 * "dist/ 目录正被正确提供"，不是"提供它的是这个进程"——这两件事只有在
 * "同一时刻只有一个服务器指向这份 dist/"这个从未被验证过的假设下才等价。
 * round3 的验证复现用的是一个根本不读 dist/、只会说"我不是 vite preview"
 * 的傀儡服务器，它未通过 marker 检查是因为它答不对 marker，不是因为
 * marker 机制识别出了"这不是我启动的进程"——两者看起来都是"核验失败"，
 * 但对应的是完全不同的失败原因，前者不能证明后者成立。真正贴合原始报告
 * 场景的复现是"另一个也在正确提供这份 dist/ 的 vite preview"，见下面
 * waitForBoundPort() 的注释。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
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

// 仅用于可控地复现"端口已被占用"这类失败场景——设了这个环境变量就把这个
// 固定端口号传给 vite preview --strictPort（仍然带 --strictPort，端口真被
// 占用时 vite 照样绑定失败、非零退出）。pnpm verify-render 的正常路径不设
// 它：不传时下面直接用 `--port 0`，端口号交给操作系统在 bind() 那一刻分配
// ——不再需要 round3 那版"自己先探测一个当下空闲的端口、再传给 vite"的
// getFreePort()（round4 之前的版本），那个做法本身留了一个"探测端口与 vite
// 真正 bind() 之间"的窄竞态窗口；`--port 0` 把"挑端口"这件事完全交给内核在
// 一次系统调用里原子地完成，连这个窄窗口都不存在了。
const PORT_OVERRIDE = process.env.VERIFY_RENDER_PORT ? Number(process.env.VERIFY_RENDER_PORT) : null

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

/** 在 dist/ 里放一个内容随机、每次运行都不同的标记文件，配合下面
 *  waitForMarkerServed() 的 HTTP 核验使用。
 *
 *  ⚠️ 这个 marker 检查不是（round3 曾经以为的）"确认接的是这次启动的进程"
 *  的证据——见本文件顶部的 round4 Fix 1 说明：vite preview 对 dist/ 下的
 *  任意文件都是逐请求现读磁盘、原样返回，不区分文件是不是本进程启动之后
 *  才写入的，所以任何同样指向这份 dist/ 的服务器（不管是不是本次启动的）
 *  都会读到刚写的新 token、原样答对。marker 检查真正验证的是"当前连接到
 *  的服务器正在正确地提供这次构建的 dist/ 内容"（防的是"连到的服务器提供
 *  的是某次更早构建、或另一个 outDir"这类内容不新鲜的问题），是对
 *  waitForBoundPort() 已经建立的身份证据（见其注释）的补充校验，不是
 *  身份证据本身。
 *
 *  文件名（不只是内容）带每次运行专属的随机后缀：如果两次 verify-render
 *  并发跑、且共享同一个 dist/（比如 CI 里两个任务都读同一份构建产物），
 *  固定文件名会让后启动的那次覆盖掉先启动的那次的 marker 文件——先启动
 *  的那次轮询到的会是后一次运行写的 token，两次运行的 marker 核验可能
 *  互相"提前"判定为通过，即使各自的服务器其实还没就绪。随机文件名让
 *  两次运行的 marker 落在不同路径上，不会互相踩踏。 */
function writeBuildMarker(markerFilename) {
  const token = randomUUID()
  writeFileSync(join(DIST, markerFilename), token, 'utf8')
  return token
}

function removeBuildMarker(markerFilename) {
  try { rmSync(join(DIST, markerFilename), { force: true }) } catch { /* 尽力清理，失败不影响退出码 */ }
}

/** `pnpm preview` 就是 vite 自带的静态服务器，遵循同一份 base/build 配置 —— 不必自己再拼一个。
 *
 *  `proc.teardownRequested`：main() 主动收尾（finally 块里的 killAndWait）
 *  之前会把它设成 true——下面的 'exit' 监听器靠它区分"我们自己 SIGTERM
 *  它、它正常退出"与"它在我们预期之外自己退出/被杀"，只有后者才会被记进
 *  `proc.unexpectedExit`。不做这个区分的话，正常收尾时的 SIGTERM 也会被
 *  当成一次"意外退出"，让每一次干净的运行都在下面 main() 里被判成失败——
 *  这正是本轮 Fix 1 要避免的一个新坑：不能为了『抓住真的意外退出』，反而
 *  连自己主动发起的收尾也一并抓成了误报。 */
function startPreviewServer(port) {
  ensureDistBuilt()
  const proc = spawn(
    'pnpm', ['exec', 'vite', 'preview', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  proc.capturedOutput = ''
  proc.teardownRequested = false
  proc.unexpectedExit = null
  proc.stdout.on('data', (d) => { proc.capturedOutput += d })
  proc.stderr.on('data', (d) => { proc.capturedOutput += d })
  proc.on('exit', (code, signal) => {
    if (code !== null && code !== 0) log(`[verify-render] vite preview 提前退出，code=${code}\n${proc.capturedOutput}`)
    if (!proc.teardownRequested && (code !== 0 || signal !== null)) {
      // 不是我们主动收尾导致的退出：要么带了非零 code，要么被信号杀掉——
      // 正常运行中 vite preview 不应该在我们叫它停下来之前自己退出，不管
      // 退出发生在核验流程的哪个阶段（就绪前/后都一样处理，见 main() 里
      // 对这个字段的检查）。
      proc.unexpectedExit = { code, signal }
    }
  })
  return proc
}

/**
 * 等 vite preview 自己报告"我绑定成功了，绑的是这个端口"——这是本轮
 * （round4）Fix 1 的核心，取代了 round3 版本里"marker 内容匹配"充当身份
 * 证据的角色（见本文件顶部与 writeBuildMarker() 的说明：那个角色 marker
 * 从未真正胜任过）。
 *
 * TCP 端口的绑定在同一时刻是排他的（不设 SO_REUSEPORT 的前提下，这里
 * 没有设），一旦我们确认——(a) 这个子进程自己打印出了"绑定成功"，且
 * (b) 报告的端口号，且 (c) 这个子进程此刻仍然存活——那么接下来连接这个
 * 端口，接到的就必然是这个进程，不可能是别的进程：不存在"两个进程同时
 * 绑在同一个端口"这种情况，OS 不允许。这才是能回答"我接的到底是不是我
 * 刚启动的那个进程"的证据，且不依赖对方是否恰好也在正确提供 dist/ 内容
 * ——即使原始报告里那种"另一个 vite preview 恰好也在正确提供同一份
 * dist/"的场景，这里也不会被骗：那个旧进程绑的是它自己当时选中的端口，
 * 不是我们这次 `--port 0` 让 OS 新分配的端口，我们只会连接后者。
 *
 * 不直接指定端口号、而是解析 vite 自己报告的："--port 0"意味着连我们
 * 自己都不知道最终会是哪个端口，只有真正执行了 bind() 的 vite 进程知道
 * OS 分配给它的是哪个号——所以这个号必须从它的 stdout 解析，不能反过来
 * 由我们指定后假定它一定绑定成功（那正是 round3 之前"固定端口"版本的
 * 错误：请求某个端口，不代表真的绑定到了那个端口）。
 *
 * @returns {Promise<number>} vite preview 报告的、它实际绑定成功的端口号
 */
async function waitForBoundPort(proc) {
  const exited = new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve({ code: proc.exitCode, signal: proc.signalCode })
      return
    }
    proc.once('exit', (code, signal) => resolve({ code, signal }))
  })

  const found = waitFor('vite preview 报告绑定成功的端口', () => {
    // eslint-disable-next-line no-control-regex -- 剥掉 vite 输出里的 ANSI 颜色码，方便下面正则匹配纯文本
    const plain = proc.capturedOutput.replace(/\x1b\[[0-9;]*m/g, '')
    const m = /Local:\s*https?:\/\/[^/:]+:(\d+)\//.exec(plain)
    return m ? Number(m[1]) : null
  }, 15000)

  const winner = await Promise.race([
    found.then((v) => ({ kind: 'found', v })),
    exited.then((v) => ({ kind: 'exited', v })),
  ])

  if (winner.kind === 'exited') {
    // 原始报告场景的核心分支：端口被占用时 vite --strictPort 绑定失败、
    // 打印错误、非零退出——不会打印"Local: ..."那一行，found 永远等不到，
    // exited 会先赢下这场 race。抛错、不再往下走一步，是"没有连接到任何
    // 服务器"这件事本身，不依赖端口上是否还有别的东西在监听、更不依赖
    // 那个东西是否恰好也在正确提供 dist/。
    throw new Error(
      `vite preview 子进程在报告绑定端口之前退出（code=${winner.v.code}, signal=${winner.v.signal}）——` +
      `没有连接到任何服务器，避免核验一个自己没启动的东西。子进程输出：\n${proc.capturedOutput}`,
    )
  }
  return winner.v
}

/** 在已经确认是本进程绑定的端口上，进一步核验它当前提供的确实是这次
 *  构建的 dist/ 内容（不是内容不新鲜——理由见 writeBuildMarker() 的注释，
 *  这里不是身份证据，是身份证据之外的内容新鲜度校验）。仍然与子进程退出
 *  赛跑：身份已经确认，但确认之后到这轮轮询之间，这个已确认的进程本身
 *  仍可能崩溃/被杀。 */
async function waitForMarkerServed(proc, markerUrl, expectedToken) {
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
      `vite preview 子进程在 marker 核验通过前退出（code=${winner.v.code}, signal=${winner.v.signal}）——` +
      `子进程输出：\n${proc.capturedOutput}`,
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
      // Fix 2（round4）新增：round3 只拍了这两个标签的 getBoundingClientRect
      // （下面 boxes.secretaryTypeLabel/flagshipLabel），没拍它们的文字本身——
      // 一个 box 存在、宽高都对，不能证明标签文字是当前语言的翻译而不是
      // 别的语言残留下来的字符串。这里补上文字，供 assertSnapshot() 逐字比对。
      labelTexts: {
        secretaryType: texts('.secretary-select label')[0] ?? null,
        flagship: texts('.flagship-search label')[0] ?? null,
      },
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
 * 每个语言的期望值——round4 Fix 2：round3 版本的 assertSnapshot() 对多数
 * 文案类字段只查"非空"，查不出"内容对不对"（`bodyFontFamily`、
 * `formLabelWidthRaw`、`suggestionsSample` 甚至连"非空"都没查，见下面
 * assertSnapshot 里对应几行的说明）。这张表就是"对不对"的标准答案。
 *
 * 取值依据（改这里之前先改真值源，这里跟着更新，不要反过来）：
 * - title/labelSecretaryType/labelSecretary/recipeTableHeaders/
 *   equipmentListHeaders：对应 src/i18n/messages/<locale>.ts 的
 *   title.app / label.secretaryType / label.secretary / DevelopmentView.vue
 *   RESULT_COLUMNS 数组（label.secretary/fuel/ammo/steel/bauxite/
 *   totalResource/poolType/hitRate/failRate 九个 key 依次拼出） /
 *   label.icon+equipment+hitRate+minResourceReq 四个 key。
 * - formLabelWidthRaw/bodyFontFamily：src/assets/base.css 的 :root 默认值
 *   与三个 :lang() 覆盖块（zh-Hans 用 :root 默认的 6.5em，没有专属覆盖）。
 *   这两个是纯 CSS 声明值（不是被渲染出来的像素宽度），不随本机装了哪些
 *   字体变化——同一份样式表在任何机器上解析出的 getComputedStyle().
 *   fontFamily/--form-label-width 都应该逐字相同，可以精确比对，不需要
 *   容差（与下面 labelIntrinsic 的处理刻意不同，理由见 assertSnapshot()
 *   里 labelIntrinsic 那段）。
 * - suggestionsSample：关键字"金剛"（FLAGSHIP_SEARCH_KEYWORD）在
 *   public/data/i18n/**（受 Fix 7 的字节级不变约束）+ start2.json（受
 *   tests/oracle.spec.ts 钉死）下的真实产出，四条一致来自"金剛"本舰及三个
 *   改造/改二形态；ja 因为 items/ships 故意为空（真值源是 start2 本身），
 *   显示的就是日文原名，与 zh-Hant 恰好同形不是巧合以外的重合，是两者都
 *   合法地显示了未简化的汉字写法。
 * - secretaryOptionsFirst/equipmentButtonSampleFirst：秘书舰下拉框（45 条，
 *   来自 DevelopmentPool.json 的池描述）与装备按钮样本（六七百条，来自
 *   start2.json 的装备表）都是数据驱动、数量大的列表，逐字钉死整份列表
 *   会让任何一次合法的游戏数据更新都在这里报出一堆与本次改动无关的假
 *   警报（这正是"检查存在而非正确性"的反面——把及格线定得比需要的更严，
 *   同样会制造噪音、削弱信号）。只钉住每个语言各自的第一条：能测出"整份
 *   表用错了语言/顺序错乱"这类结构性错误，不为游戏数据的正常波动报警。
 *   下面 assertSnapshot() 里另有 secretaryOptions.length===45 的数量校验，
 *   以及针对 en 的全表汉字缺席校验（这两者与"第一条"合起来，覆盖的正是
 *   "整表回退成别的语言"这个具体缺陷，见该处注释）。
 */
const EXPECTED = {
  'zh-Hans': {
    title: '装备开发',
    labelSecretaryType: '秘书舰类型：',
    labelSecretary: '秘书舰',
    recipeTableHeaders: ['秘书舰', '油', '弹', '钢', '铝', '总资源', '池类型', '出货率', '失败率'],
    equipmentListHeaders: ['', '装备', '出货率', '最低资源要求'],
    formLabelWidthRaw: '6.5em',
    bodyFontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Micro Hei", sans-serif',
    suggestionsSample: ['金刚（こんごう）', '金刚改二（こんごう）', '金刚改（こんごう）', '金刚改二丙（こんごう）'],
    secretaryOptionsFirst: '炮战系-意(利托里奥,罗马,扎拉,波拉)',
    equipmentButtonSampleFirst: '12cm单装炮',
  },
  'zh-Hant': {
    title: '裝備開發',
    labelSecretaryType: '秘書艦類型：',
    labelSecretary: '秘書艦',
    recipeTableHeaders: ['秘書艦', '油', '彈', '鋼', '鋁', '總資源', '池類型', '出貨率', '失敗率'],
    equipmentListHeaders: ['', '裝備', '出貨率', '最低資源需求'],
    formLabelWidthRaw: '6.5em',
    bodyFontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", "Source Han Sans TC", sans-serif',
    suggestionsSample: ['金剛（こんごう）', '金剛改二（こんごう）', '金剛改（こんごう）', '金剛改二丙（こんごう）'],
    secretaryOptionsFirst: '砲戰系-義(利托里奧,羅馬,扎拉,波拉)',
    equipmentButtonSampleFirst: '12cm單裝炮',
  },
  ja: {
    title: '装備開発',
    labelSecretaryType: '秘書艦タイプ：',
    labelSecretary: '秘書艦',
    recipeTableHeaders: ['秘書艦', '燃料', '弾薬', '鋼材', 'ボーキ', '総資源', 'プール種別', '開発率', '失敗率'],
    equipmentListHeaders: ['', '装備', '開発率', '最低資源'],
    formLabelWidthRaw: '7.5em',
    bodyFontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, "Noto Sans CJK JP", "Source Han Sans JP", sans-serif',
    suggestionsSample: ['金剛（こんごう）', '金剛改二（こんごう）', '金剛改（こんごう）', '金剛改二丙（こんごう）'],
    secretaryOptionsFirst: '砲戦系-伊(Littorio,Roma,Zara,Pola)',
    equipmentButtonSampleFirst: '12cm単装砲',
  },
  en: {
    title: 'Equipment Development',
    labelSecretaryType: 'Secretary Ship Type:',
    labelSecretary: 'Secretary',
    recipeTableHeaders: ['Secretary', 'Fuel', 'Ammo', 'Steel', 'Bauxite', 'Total', 'Pool Type', 'Rate', 'Fail Rate'],
    equipmentListHeaders: ['', 'Equipment', 'Rate', 'Min. Resources'],
    formLabelWidthRaw: '9.95em',
    bodyFontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, "Noto Sans CJK JP", "Source Han Sans JP", sans-serif',
    suggestionsSample: ['Kongou（こんごう）', 'Kongou Kai Ni（こんごう）', 'Kongou Kai（こんごう）', 'Kongou Kai Ni C（こんごう）'],
    secretaryOptionsFirst: 'Gunnery - Italian(Littorio, Roma, Zara, Pola)',
    equipmentButtonSampleFirst: '12cm Single Gun Mount',
  },
}

/** 匹配 CJK 表意文字，用来检测"英文语境下出现了未翻译的中/日文汉字"这类
 *  回退缺陷；不含假名（平假名/片假名）——秘书舰搜索建议列表里的假名读音
 *  （如「こんごう」）在任何语言下都会出现，是设计如此（见 base.css
 *  :lang(en) 字体栈那段注释里对这一点的详细说明），不能被这条检查误伤；
 *  这里要抓的具体缺陷是"整段文案回退成了未翻译的日文/中文汉字"——round1
 *  曾经真实发生过（45 个下拉池描述里 11 个残留了未翻译的日文舰名，见
 *  base.css --form-label-width 那段注释里的历史记录），不是凭空设想的
 *  边界情况。 */
// \u 转义而不是直接贴字符：CJK 兼容表意文字区的边界字符本身极易与
// 视觉相似的统一表意文字混淆、复制粘贴时出错还不容易肉眼发现——写这段
// 代码核对码位的过程里，就曾经把想要的 U+F900 误输入成视觉几乎一样但
// 码位不同的 U+8C48。\u 转义把"这条正则到底覆盖哪个码位区间"变成可以
// 逐字符核对的十六进制数字，不依赖终端/编辑器能不能把两个长得像的
// 字符区分开来——覆盖 CJK 统一表意文字（U+4E00-9FFF）、扩展 A 区
// （U+3400-4DBF）、兼容表意文字（U+F900-FAFF），不含假名。
const HAN_IDEOGRAPH = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/

/** 数组/普通对象的深度相等——这里只用来比较 captureSnapshot() 产出的、
 *  内容全是字符串/数字的普通数组（recipeTableHeaders、equipmentListHeaders、
 *  suggestionsSample），JSON.stringify 足够也足够简单，不需要为此引入一个
 *  真正的深度比较库。 */
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * 把 captureSnapshot() 抓到的原始数据变成断言。这个 harness 存在的唯一
 * 理由就是查这几件事有没有做到——只记录数字、不拿它们跟期望值比较，
 * 等于没做核验：改造前 hardFailures 只收"整个 locale 核验失败"这一种
 * 情况，搜索空结果、建议列表零条、元素缺失、建议列表与输入框没对齐，
 * 全部只进 JSON、不进 hardFailures，退出码永远是 0（复现记录见
 * .superpowers/sdd-round3/report.md 的 Path B 部分）。round4 Fix 2 在此
 * 基础上补上"记录的数字对不对"——round3 版本对文案类字段大多只查非空，
 * 一份整体回退成另一种语言的文案、一个整个变了的字体栈、一个悄悄改小的
 * --form-label-width，全部一样是"非空"，round3 的版本会照样放行。
 *
 * 返回失败描述数组，调用方把它们追加进 hardFailures；长度 0 表示这份
 * 快照的全部断言通过。
 */
function assertSnapshot(locale, width, snapshot) {
  const failures = []
  const fail = (msg) => failures.push(`[${locale}@${width}] ${msg}`)
  const expect = EXPECTED[locale]

  if (snapshot.secretaryOptions.length === 0) fail('秘书舰下拉框没有任何选项')
  // 45 条是 DevelopmentPool.json 实际的池数量（该文件受 tests/oracle.spec.ts
  // 与本轮 Fix 7 的字节级不变约束，不会在这个分支的生命周期内变化）；数量
  // 对不上通常意味着某个语言的池描述整表没渲染全，"非空"测不出这种"少了
  // 一半"的故障。
  if (snapshot.secretaryOptions.length !== 45) {
    fail(`秘书舰下拉框选项数量=${snapshot.secretaryOptions.length}，应为 45`)
  }
  if (snapshot.secretaryOptions[0] !== expect.secretaryOptionsFirst) {
    fail(`秘书舰下拉框第一项=${JSON.stringify(snapshot.secretaryOptions[0])}，应为 ${JSON.stringify(expect.secretaryOptionsFirst)}`)
  }
  if (locale === 'en' && snapshot.secretaryOptions.some((o) => HAN_IDEOGRAPH.test(o))) {
    // 这条是"英文整表回退成中文/日文"这类缺陷的直接体检：只查第一条测不出
    // "第一条对、后面 44 条都没翻"这种局部回退；只查数量测不出"数量对、内容
    // 全是汉字"。全表扫描一次汉字表意文字的存在性，不要求知道每一条池
    // 描述具体该翻成什么英文（那需要逐字钉死整份列表，见上面 EXPECTED 的
    // 注释里权衡过的理由）。
    fail('英文下秘书舰下拉框选项里出现了汉字表意文字（怀疑整表或部分回退成了中文/日文）')
  }

  if (snapshot.equipmentListHeaders.length === 0) fail('装备列表表头缺失')
  // 四个语言的 equipmentListHeaders 第一项都是空字符串，这不是漏填：图标列的
  // 表头文字是**刻意**去掉的（48px 的定宽列减去 th 两侧 padding 只剩 32px，
  // ja 的「アイコン」在页面上会折行），理由与取舍见 DevelopmentView.vue 里
  // .equipment-list th:first-child 的注释。这里保留这个空位而不是把数组缩成
  // 三项，是为了继续钉住"这张表是四列、且图标列排在最前"——列数或列序错了
  // 仍然会被这条断言抓到。谁要是把 $t('label.icon') 加回模板，这里也会红。
  if (!deepEqual(snapshot.equipmentListHeaders, expect.equipmentListHeaders)) {
    fail(`装备列表表头=${JSON.stringify(snapshot.equipmentListHeaders)}，应为 ${JSON.stringify(expect.equipmentListHeaders)}`)
  }
  // .development-results 的 <table> 由 v-if="hasSelectedEquipments" 控制，
  // 但 <thead> 里的列头本身是 RESULT_COLUMNS 这个静态常量渲染出来的、不
  // 依赖是否算出任何可用配方行——selectFirstEquipment() 已经在进入这个
  // 视口循环之前选中了一件装备，这里为空只能是选中没生效或表没渲染，
  // 不是"这件装备恰好没有可用配方"那种业务性的空（那种情况下 thead 仍然
  // 会有列头，只是 tbody 没有行，不会让这条断言失败）。
  if (snapshot.recipeTableHeaders.length === 0) fail('可用公式表头缺失（selectFirstEquipment 应已选中装备并渲染出静态列头）')
  if (!deepEqual(snapshot.recipeTableHeaders, expect.recipeTableHeaders)) {
    fail(`可用公式表头=${JSON.stringify(snapshot.recipeTableHeaders)}，应为 ${JSON.stringify(expect.recipeTableHeaders)}`)
  }

  if (snapshot.equipmentButtonSample.length === 0) fail('装备按钮样本为空')
  if (snapshot.equipmentButtonSample[0] !== expect.equipmentButtonSampleFirst) {
    fail(`装备按钮样本第一项=${JSON.stringify(snapshot.equipmentButtonSample[0])}，应为 ${JSON.stringify(expect.equipmentButtonSampleFirst)}`)
  }
  if (locale === 'en' && snapshot.equipmentButtonSample.some((n) => HAN_IDEOGRAPH.test(n))) {
    fail('英文下装备按钮样本里出现了汉字表意文字（怀疑装备名回退成了中文/日文）')
  }

  if (!snapshot.title) fail('document.title 为空')
  if (snapshot.title !== expect.title) fail(`document.title=${JSON.stringify(snapshot.title)}，应为 ${JSON.stringify(expect.title)}`)
  if (snapshot.htmlLang !== locale) fail(`<html lang>=${JSON.stringify(snapshot.htmlLang)}，应为 ${JSON.stringify(locale)}`)

  if (snapshot.labelTexts.secretaryType !== expect.labelSecretaryType) {
    fail(`「秘书舰类型」标签文字=${JSON.stringify(snapshot.labelTexts.secretaryType)}，应为 ${JSON.stringify(expect.labelSecretaryType)}`)
  }
  if (snapshot.labelTexts.flagship !== expect.labelSecretary) {
    fail(`「秘书舰」标签文字=${JSON.stringify(snapshot.labelTexts.flagship)}，应为 ${JSON.stringify(expect.labelSecretary)}`)
  }

  // bodyFontFamily/formLabelWidthRaw：round3 版本完全没断言过这两个字段
  // （只记进 JSON）——字体栈整个回退成默认的 Times New Roman、或
  // --form-label-width 从实测值改回旧的心算近似值，都不会被 round3 版本
  // 发现。这两个都是纯 CSS 声明值，不随本机装了哪些字体变化，可以精确
  // 比对（见 EXPECTED 表顶部注释）。
  if (snapshot.bodyFontFamily !== expect.bodyFontFamily) {
    fail(`body 的 font-family=${JSON.stringify(snapshot.bodyFontFamily)}，应为 ${JSON.stringify(expect.bodyFontFamily)}`)
  }
  if (snapshot.formLabelWidthRaw !== expect.formLabelWidthRaw) {
    fail(`--form-label-width=${JSON.stringify(snapshot.formLabelWidthRaw)}，应为 ${JSON.stringify(expect.formLabelWidthRaw)}`)
  }

  if (snapshot.suggestionsCount === 0) fail(`秘书舰搜索（关键字「${FLAGSHIP_SEARCH_KEYWORD}」）没有产出任何建议`)
  // suggestionsSample 此前完全没断言过——四条具体建议逐字比对，能测出
  // "搜索确实有结果，但显示的是别的语言/别的舰"这类此前测不到的缺陷。
  if (!deepEqual(snapshot.suggestionsSample, expect.suggestionsSample)) {
    fail(`建议列表样本=${JSON.stringify(snapshot.suggestionsSample)}，应为 ${JSON.stringify(expect.suggestionsSample)}`)
  }

  for (const key of REQUIRED_BOXES) {
    const box = snapshot.boxes[key]
    if (box === null) {
      fail(`元素缺失，getBoundingClientRect 拿不到：boxes.${key}`)
      continue
    }
    // "存在"不等于"占了实际空间"——一个 display:none 或高度塌陷的元素也能
    // 返回一个非 null 的 rect，宽/高却是 0。round3 版本只查非 null，这里
    // 补上尺寸必须为正。
    if (box.width <= 0 || box.height <= 0) {
      fail(`boxes.${key} 的尺寸不合理：width=${box.width}, height=${box.height}`)
    }
    // 不越出当前视口右边界（几何性质里"不溢出"的直接体现）——base.css 里
    // --form-label-width 那段注释记录过的真实缺陷（标签宽度算错时，标签+
    // 控件会探出 .left-panel、乃至探出视口，需要横向滚动才能看全）正是
    // 这条要拦的东西。留 0.5px 的容差，容纳亚像素取整误差，不是放宽标准。
    if (box.right > width + 0.5) {
      fail(`boxes.${key} 越出视口右边界：right=${box.right} > 视口宽度 ${width}`)
    }
  }
  for (const key of ['secretaryType', 'flagship']) {
    if (snapshot.labelIntrinsic[key] === null) fail(`元素缺失：labelIntrinsic.${key}`)
  }

  // labelIntrinsic 的绝对像素宽度是"这台机器实际解析到的字体"量出来的
  // shrink-to-fit 宽度（见 captureSnapshot() 里 intrinsicWidth 的注释），
  // 不是纯 CSS 声明值——换一台没装同一套中日文字体的机器，量出来的像素数
  // 会不一样，逐字/逐像素钉死会把"这台机器缺一款字体"误判成"渲染出了缺陷"。
  // 断言退到"形状"而不是具体数值：两个宽度都必须是正数（元素真的占了
  // 空间，不是塌陷成 0）；"秘书舰类型"这个标签的文字在四个语言下都比
  // "秘书舰"本身长，量出来的宽度也必须更宽——这个大小关系不依赖具体解析到
  // 哪款字体，换字体只会让两个数字同时变大或变小，不会颠倒谁比谁宽；两个
  // 标签的 fontSize 必须相等——base.css 里 --form-label-width 的定义注释
  // 明确写过"两个标签共享同一套字号"是这几个 em 值能通用的前提，这里直接
  // 验证这个前提没有被打破，不再只是靠注释里的一句话立约。
  const { secretaryType, flagship } = snapshot.labelIntrinsic
  if (secretaryType && flagship) {
    if (!(secretaryType.width > 0)) fail(`labelIntrinsic.secretaryType.width 不是正数：${secretaryType.width}`)
    if (!(flagship.width > 0)) fail(`labelIntrinsic.flagship.width 不是正数：${flagship.width}`)
    if (secretaryType.width > 0 && flagship.width > 0 && !(secretaryType.width > flagship.width)) {
      fail(`labelIntrinsic.secretaryType.width（${secretaryType.width}）应大于 labelIntrinsic.flagship.width（${flagship.width}）——"秘书舰类型"类标签的文字在所有语言下都比"秘书舰"类标签长`)
    }
    if (secretaryType.fontSize !== flagship.fontSize) {
      fail(`两个标签的 fontSize 不一致：secretaryType=${secretaryType.fontSize}, flagship=${flagship.fontSize}（--form-label-width 的 em 值要求两者共享同一套字号）`)
    }
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

  // 见文件顶部 PORT_OVERRIDE 的注释：正常路径传 0，端口号交给 OS 在 vite
  // 真正 bind() 的那一刻原子分配；PORT_OVERRIDE 只用于测试/演示，把这个
  // 固定端口传给 --strictPort，端口被占用时 vite 会绑定失败、非零退出。
  const previewProc = startPreviewServer(PORT_OVERRIDE ?? 0)
  // 每次运行专属的 marker 文件名（不只是内容随机，文件名本身也带
  // randomUUID()）——理由见 writeBuildMarker() 的注释：避免两次并发运行
  // 共享同一个 dist/ 时互相覆盖对方的 marker 文件。
  const markerFilename = `.verify-render-marker-${randomUUID()}`

  const userDataDir = mkdtempSync(join(tmpdir(), 'kc-dev-verify-render-'))
  let chromeProc
  let cdp
  let appUrl // 下面 findings 会用到，但要等 waitForBoundPort() 拿到真实端口才能拼出来
  const findings = { generatedAt: new Date().toISOString(), locales: {} }
  const hardFailures = []

  try {
    // 先确认这是我们自己的进程、绑定到了哪个端口（身份证据），再用这个
    // 端口做后续所有事——不是反过来先假定一个端口、再核验它是不是我们的。
    const boundPort = await waitForBoundPort(previewProc)
    if (PORT_OVERRIDE !== null && boundPort !== PORT_OVERRIDE) {
      // 理论上不会发生：--strictPort 要么绑定到我们请求的那个固定端口，
      // 要么直接绑定失败、非零退出（上面 waitForBoundPort 已经处理了后者）。
      // 这里只是一条完整性自检，万一 vite 未来版本改了这个约定，宁可在这
      // 里报错也不要静默接受一个跟请求的端口对不上的绑定结果。
      throw new Error(`vite preview 报告绑定的端口（${boundPort}）与 VERIFY_RENDER_PORT 请求的（${PORT_OVERRIDE}）不一致`)
    }
    const origin = `http://127.0.0.1:${boundPort}`
    appUrl = `${origin}${BASE_PATH}#/`
    findings.appUrl = appUrl
    const markerUrl = `${origin}${BASE_PATH}${markerFilename}`
    const marker = writeBuildMarker(markerFilename)

    await waitForMarkerServed(previewProc, markerUrl, marker)
    log(`[verify-render] preview 就绪（绑定端口 ${boundPort}，marker 核验通过）：${appUrl}`)

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
    // 主动收尾：先标记 teardownRequested，再发信号——见 startPreviewServer()
    // 里对这个字段的注释。必须在 killAndWait 发出 SIGTERM 之前完成这次
    // 赋值（这里是同步赋值，下一行才 await 发信号，顺序上不会有竞态）。
    previewProc.teardownRequested = true
    await killAndWait(previewProc)
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* 尽力清理，失败不影响退出码 */ }
    removeBuildMarker(markerFilename)
  }

  // round4 Fix 1：不管上面的核验流程本身跑出了什么结果，只要 vite preview
  // 在我们主动收尾之前的任何时刻意外退出过（非零 code，或被信号杀掉），
  // 都是硬失败——这条子进程一旦不在了，它之后的任何"核验通过"都不可信：
  // 可能是连到了别的东西（比如同一台机器上另一个巧合也在监听同一端口的
  // 进程——虽然 waitForBoundPort() 已经把这个概率降到了"同一时刻抢到同一
  // 个刚被 OS 分配出来的端口"这种几乎不可能发生的窗口），也可能是后续步骤
  // 其实什么都没真正连上、只是恰好没报错。不局限于"启动阶段"检查：
  // unexpectedExit 在整个运行期间的任何时刻被设置都会被这里捕捉到。
  if (previewProc.unexpectedExit) {
    const { code, signal } = previewProc.unexpectedExit
    hardFailures.push(
      `vite preview 子进程在核验过程中意外退出（code=${code}, signal=${signal}），` +
      '不是本工具主动收尾导致的——在此之后的任何核验结果都不可信',
    )
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
