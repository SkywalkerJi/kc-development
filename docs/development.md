# 开发指南

## 环境

| 项 | 要求 |
| --- | --- |
| Node | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` |
| 包管理器 | pnpm 10.33.2（见 `package.json` 的 `packageManager`） |
| IDE | VS Code + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)（禁用 Vetur） |

Node 版本下限来自 jsdom 30 依赖的 undici 8，低于此版本 SFC 挂载测试整个文件无法运行。`package.json` 的 `engines` 与 `.github/workflows/deploy.yml` 两处需保持一致。

## 命令

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 开发服务器（热更新） |
| `pnpm build` | 类型检查 + 生产构建 |
| `pnpm preview` | 预览生产构建产物 |
| `pnpm test` | 单元测试 + 基准对拍 |
| `pnpm type-check` | 类型检查（`vue-tsc`） |
| `pnpm verify-render` | 真实浏览器渲染核验 |
| `pnpm sync-data --from <dir>` | 同步游戏数据，见[数据维护](./data-maintenance.md) |
| `pnpm sync-i18n --kc3 <dir>` | 同步译名，见[数据维护](./data-maintenance.md) |
| `pnpm gen-assets` | 重新生成站点图标与分享卡片位图，见[站点资产](#站点资产)（一次性，产物已提交） |

## 结构

```
src/
  core/        纯计算层：出货率、配方反推、池匹配、编排（零 Vue / Pinia 依赖）
  stores/      Pinia：游戏数据与开发池数据的加载
  i18n/        四语言文案、语言探测、名称表加载
  views/       DevelopmentView 主界面
  components/  页头页脚、秘书舰搜索、语言切换、数据初始化
  assets/      base.css：字体栈、设计令牌（颜色/圆角/阴影）与深色模式
  links.ts     全部站外链接（仓库 / X / 上游译名库 / 许可）的唯一出处
public/data/   游戏数据与译名（i18n/ 下按语言分目录）
public/        另有站点资产：favicon.svg / apple-touch-icon.png / og-image.png
               / robots.txt / sitemap.xml / 404.html
scripts/       数据同步、渲染核验、站点资产生成
scripts/assets/  位图资产的 HTML 源文件
tests/         基准对拍（oracle）与回归测试
```

## 依赖原则

运行时依赖只有 `vue` / `pinia` / `vue-router`。能自己写的不引入依赖 —— 渲染核验直接用 Node 22 的全局 `fetch` / `WebSocket` 说 Chrome DevTools Protocol，不引入 puppeteer / playwright。

## 测试

`pnpm test` 覆盖单元测试与 753 组基准向量对拍（`tests/oracle.spec.ts`）。

单测全部跑在 jsdom 里，而 jsdom **不做布局、不解析 CSS** —— 全绿不代表某语言下标签不会把输入框挤到换行、也不代表字体栈真的解析到位。这类回归由 `pnpm verify-render` 兜。

## 渲染核验

```sh
pnpm verify-render   # 内部先 pnpm build，再驱动真实 headless Chrome
```

对 `zh-Hans` / `zh-Hant` / `ja` / `en` 各跑一轮，在 1400px 与 1024px 两档视口下核验文案、`font-family`、以及标签 / 下拉框 / 输入框 / 建议列表的真实几何。

- ⚠️ 依赖本机 `/usr/bin/google-chrome`，**故意不接入 `pnpm test`** —— 没装 Chrome 的机器不该因此变红
- 结果写入 `.superpowers/sdd-round2/render-verification.json`；JSON 是证据，退出码才是判决
- `VERIFY_RENDER_PORT` 仅用于手动构造「端口被占用」场景，正常使用不需要设置

## SEO

面向社交平台的元数据（`og:*` / `twitter:*`）全部写死在 `index.html` 里，且只有 zh-Hans 一份 —— 抓取器**不执行 JavaScript**，运行时改写它们没有任何消费者能读到。运行时只跟着语言更新 `document.title` 与 `<meta name="description">`（`src/i18n/index.ts` 的 `doSwitch`）。

⚠️ **改站名要同步下面全部位置**（前两行漏改会让 `pnpm verify-render` / `pnpm test` 报红；`index.html` 那一行漏改**没有任何自动检查会发现**）：

| 位置 | 字段 |
| --- | --- |
| `src/i18n/messages/{zh-Hans,zh-Hant,ja,en}.ts` | `title.app`（四个文件，这是真值源） |
| `scripts/verify-render.mjs` | `EXPECTED.<locale>.title`（四条） |
| `src/i18n/__tests__/index.spec.ts` | 那条写死 en 站名的断言 |
| `index.html` | zh-Hans 名出现 8 次：`<title>`、`description`、`og:site_name`、`og:title`、`og:description`、`og:image:alt`、JSON-LD `name`、`<noscript>` 的 `<h1>`；JSON-LD `alternateName` 里另有 ja 与 en 各一份 |
| `scripts/assets/og-image.html` | 卡片上的 `<h1>`；改完要 `pnpm gen-assets` 重新生成 PNG |

其它约定：

- 指向自家静态资源的路径一律走 `%BASE_URL%`（vite 构建期替换成 `base`）。写成 `/xxx` 在 GitHub Pages 项目页上会指到域名根，那是**别的仓库**的地盘
- `canonical` / `og:url` / `og:image` 必须是绝对 URL，带尾斜杠、不带 hash
- `public/robots.txt` 在项目页部署下**读不到**（爬虫只读域名根的那一份），`sitemap.xml` 需要在 Search Console 手动提交，两者都不要当成已生效的 SEO 成果 —— 详见各自文件内的说明
- 没有 `hreflang`：四种语言共用同一个 URL，写了是假信息

## 站点资产

| 文件 | 说明 |
| --- | --- |
| `public/favicon.svg` | 手写的矢量源，是站标形状的唯一真值源 |
| `public/apple-touch-icon.png` | 180×180，由 `scripts/assets/icon.html` 截图生成 |
| `public/og-image.png` | 1200×630 分享卡片，由 `scripts/assets/og-image.html` 截图生成 |

两张 PNG 的产物已提交，只有改了源文件才需要 `pnpm gen-assets` 重跑并把新 PNG 一起提交。该脚本与 `verify-render` 一样依赖本机 `/usr/bin/google-chrome`，**故意不接入构建与 CI**。

必须是位图而不是复用 SVG：X 不接受 SVG 作 `og:image`，iOS 主屏图标也只认位图。

⚠️ 站标形状目前有四份副本（`favicon.svg`、`scripts/assets/og-image.html`、`src/components/AppHeader.vue`、`public/404.html`）。后三处内联而不引用，各有原因（截图脚本的外链易静默失效、页头要避免首屏多一次请求、`public/` 下的文件读不到构建产物），改图标要四处一起改。

## 部署

push 到 `main` 触发 `.github/workflows/deploy.yml`：类型检查 → 测试 → 构建 → GitHub Pages。

⚠️ **仓库改名时，以下三处路径必须一起改**（不一致会让线上页面纯白且无任何可见报错）：

| 位置 | 字段 |
| --- | --- |
| `vite.config.ts` | `base` |
| `scripts/verify-render.mjs` | `BASE_PATH` |
| `public/404.html` | `baseUrl` |

⚠️ `src/i18n/index.ts` 的 `STORAGE_KEY = 'kc-development.locale'` 虽含旧仓库名，但**不要跟着改** —— 那是 localStorage 的键，改了会清空所有老用户已保存的语言选择。
