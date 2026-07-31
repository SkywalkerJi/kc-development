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

## 结构

```
src/
  core/        纯计算层：出货率、配方反推、池匹配、编排（零 Vue / Pinia 依赖）
  stores/      Pinia：游戏数据与开发池数据的加载
  i18n/        四语言文案、语言探测、名称表加载
  views/       DevelopmentView 主界面
  components/  秘书舰搜索、语言切换、数据初始化
public/data/   游戏数据与译名（i18n/ 下按语言分目录）
scripts/       数据同步与渲染核验脚本
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

## 部署

push 到 `main` 触发 `.github/workflows/deploy.yml`：类型检查 → 测试 → 构建 → GitHub Pages。

⚠️ **仓库改名时，以下三处路径必须一起改**（不一致会让线上页面纯白且无任何可见报错）：

| 位置 | 字段 |
| --- | --- |
| `vite.config.ts` | `base` |
| `scripts/verify-render.mjs` | `BASE_PATH` |
| `public/404.html` | `baseUrl` |

⚠️ `src/i18n/index.ts` 的 `STORAGE_KEY = 'kc-development.locale'` 虽含旧仓库名，但**不要跟着改** —— 那是 localStorage 的键，改了会清空所有老用户已保存的语言选择。
