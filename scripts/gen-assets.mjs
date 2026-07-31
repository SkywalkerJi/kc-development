#!/usr/bin/env node
/**
 * 由矢量源生成两张位图资产：
 *
 *   scripts/assets/icon.html      →  public/apple-touch-icon.png  (180×180)
 *   scripts/assets/og-image.html  →  public/og-image.png          (1200×630)
 *
 * 用法：`node scripts/gen-assets.mjs`
 *
 * ⚠️ **一次性工具，刻意不接进 `pnpm build` / CI**，理由与
 * scripts/verify-render.mjs 完全相同：它依赖本机装有
 * /usr/bin/google-chrome，没有 Chrome 的机器上构建不该因此失败。产物
 * （两张 PNG）已经提交进仓库，正常开发/部署不需要跑这个脚本，只有改了
 * public/favicon.svg 或 scripts/assets/*.html 之后才需要重跑一次、把新
 * PNG 一起提交。
 *
 * 为什么需要 PNG（而不是到处直接用 SVG）：
 * - `og:image`：X（Twitter）与多数社交抓取器不接受 SVG。
 * - `apple-touch-icon`：iOS 主屏图标只认位图。
 * 浏览器标签页图标那一路仍然直接用 public/favicon.svg，不经过这里。
 *
 * 为什么两张图都过 Chrome 而不是用 ImageMagick 转：og-image 里是中日文
 * 排版 + 渐变 + flex 布局，那是浏览器的活；而 favicon.svg 用了线性渐变，
 * ImageMagick 内建的 MSVG 渲染器对渐变与 stroke-linecap 的支持要看本机
 * 有没有装 librsvg 委托，是个赌局。Chrome 本来就是本仓库既有的核验依赖
 * （verify-render.mjs），用它不引入任何新东西。
 *
 * ⚠️ 为什么走 CDP 而不是 Chrome 自带的 `--screenshot`：
 * `--screenshot` 配 `--window-size=W,H` 产出的 PNG **确实是 W×H**，但
 * 真实视口只有 `H - 90`（headless 窗口装饰的固定开销），剩下那 90px 是
 * 未重绘的陈旧缓冲——表现为页面顶部内容在图片底部又出现一次。实测：
 * `--window-size=180,360` 截出的图，0–270 是真内容，270–360 是页首的重复。
 * 90 这个数字是这个 Chrome 版本的实现细节，靠它去补偿窗口高度等于把一个
 * 版本相关的魔数写死进脚本。`Emulation.setDeviceMetricsOverride` 设的是
 * **视口**本身，没有这层窗口装饰的账要算，尺寸精确可控。
 *
 * CDP 客户端手写而不是引 puppeteer：同 verify-render.mjs 的既有原则——
 * Node 22 起 `fetch`/`WebSocket` 都是全局对象，说 CDP 只是普通 WebSocket
 * 上收发 JSON，犯不上为此多管理一个客户端库的版本。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = '/usr/bin/google-chrome'

/** 要生成的资产。source 是提交进仓库的 HTML 源，out 是产物。 */
const TARGETS = [
  {
    source: join(ROOT, 'scripts', 'assets', 'icon.html'),
    out: join(ROOT, 'public', 'apple-touch-icon.png'),
    width: 180,
    height: 180,
    // iOS 会把主屏图标铺在自己的背景上，圆角之外必须透明，否则四角是白的
    transparent: true,
  },
  {
    source: join(ROOT, 'scripts', 'assets', 'og-image.html'),
    out: join(ROOT, 'public', 'og-image.png'),
    width: 1200,
    height: 630,
    // 分享卡片自己铺满了背景，透不透明无所谓；显式给 false 免得将来
    // 有人看到两条都写 true 而以为这是必需项
    transparent: false,
  },
]

const POLL_INTERVAL_MS = 100

async function waitFor(label, fn, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  let lastErr
  while (Date.now() < deadline) {
    try {
      const v = await fn()
      if (v) return v
    } catch (e) { lastErr = e }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(`等待超时（${timeoutMs}ms）：${label}${lastErr ? `；最后一次错误：${lastErr}` : ''}`)
}

/** 极简 CDP 客户端：一个 WebSocket + 自增 id 的请求/响应配对（同 verify-render.mjs）。 */
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

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(`页面内表达式抛错：${JSON.stringify(result.exceptionDetails)}`)
  return result.result.value
}

async function main() {
  if (!existsSync(CHROME)) {
    console.error(`[gen-assets] 找不到 ${CHROME}——这个脚本需要本机 Chrome，见文件顶部说明。`)
    process.exitCode = 1
    return
  }
  for (const t of TARGETS) {
    if (!existsSync(t.source)) throw new Error(`源文件不存在：${t.source}`)
  }

  const userDataDir = mkdtempSync(join(tmpdir(), 'kc-gen-assets-'))
  const proc = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--hide-scrollbars',
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  let cdp
  try {
    // 端口从 user-data-dir 里的 DevToolsActivePort 读，不解析 stderr 的日志
    // 措辞（同 verify-render.mjs）
    const portFile = join(userDataDir, 'DevToolsActivePort')
    const port = await waitFor('Chrome 写出 DevToolsActivePort', () => {
      if (!existsSync(portFile)) return null
      const first = readFileSync(portFile, 'utf8').split('\n')[0].trim()
      return first ? Number(first) : null
    }, 10000)
    await waitFor('Chrome CDP HTTP 端点响应', async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).ok, 10000)

    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const page = list.find((x) => x.type === 'page' && !String(x.url).startsWith('chrome-extension://'))
    if (!page) throw new Error(`/json/list 里找不到可用的 page target：${JSON.stringify(list)}`)

    cdp = new CDPClient(page.webSocketDebuggerUrl)
    await cdp.ready()
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    for (const { source, out, width, height, transparent } of TARGETS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: false,
      })
      await cdp.send('Emulation.setDefaultBackgroundColorOverride',
        transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {})

      await cdp.send('Page.navigate', { url: `file://${source}` })
      // 轮询页面自己的状态而不是订阅 Page.loadEventFired：`document.fonts.ready`
      // 这一条尤其要等——中日文字体是本机字体，命中前浏览器会先用回退字体
      // 排一版，抢在那之前截图会拍到一张字体不对、断行位置也不对的图。
      await waitFor(`${out} 的页面就绪`, () => evaluate(cdp, `(async () => {
        if (document.readyState !== 'complete') return false;
        await document.fonts.ready;
        return true;
      })()`))

      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        // clip 显式给全尺寸 + scale 1：不依赖"不给 clip 时恰好等于视口"这个
        // 隐式行为，产出的像素尺寸就是这里写的数
        clip: { x: 0, y: 0, width, height, scale: 1 },
        captureBeyondViewport: true,
      })
      writeFileSync(out, Buffer.from(data, 'base64'))
      console.log(`[gen-assets] ${out}  (${width}×${height})`)
    }
  } finally {
    cdp?.close()
    try { proc.kill('SIGTERM') } catch { /* 已退出也无所谓 */ }
    // 等 Chrome 真的放开 user-data-dir 再删，否则 rmSync 可能删不干净
    await new Promise((resolve) => {
      if (proc.exitCode !== null || proc.signalCode !== null) return resolve()
      const t = setTimeout(() => { try { proc.kill('SIGKILL') } catch { /* 同上 */ } resolve() }, 5000)
      proc.once('exit', () => { clearTimeout(t); resolve() })
    })
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* 尽力清理 */ }
  }
}

main().catch((e) => {
  console.error('[gen-assets] 失败：', e)
  process.exitCode = 1
})
