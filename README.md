# kc-development

舰娘装备开发配方计算器。

## 数据更新

装备开发的出货率表与游戏基础数据存放在 `public/data/`，通过同步脚本更新：

```sh
pnpm sync-data --from /path/to/dir
```

`--from` 指向的目录需包含 `DevelopmentPool.json`、`ctype.json`、`start2.json`。

脚本会剥离源文件中的注释、校验数据完整性，并打印本次变更摘要。

⚠️ **更新这三份数据文件后必须重新生成 `tests/fixtures/vectors.json`**（基准对拍向量），
否则 `pnpm test` 会因为 `tests/oracle.spec.ts` 的哈希校验测试而失败——该测试比对
`vectors.json` 里记录的数据文件 SHA-256 与 `public/data/` 下的实际哈希，
用来防止「数据更新了但忘记重新生成基准」这种情况被静默放过。

⚠️ **生成向量的工具不在本仓库内**：`tests/fixtures/vectors.json` 是一份固化好的基准，
`meta.dataHashes` 只能证明「`public/data/` 与生成向量时使用的数据一致」，
不能证明向量可以凭本仓库的内容重新生成——生成它的独立工具及其自身的校验逻辑
都不随本仓库分发。需要更新基准时，须在能访问该工具的环境里重新生成
`vectors.json` 后再提交进来；仅凭 `git clone` 这个仓库无法完成这一步。

## 译名数据更新

装备 / 舰船 / 舰级的各语言译名存放在 `public/data/i18n/`，由同步脚本从
[KC3Kai/kc3-translations](https://github.com/KC3Kai/kc3-translations)（MIT）生成：

```sh
pnpm sync-i18n --kc3 /path/to/kc3-translations
```

脚本会跑舰名合成（基础名 + 前后缀表）与舰级派生（首舰译名 + 本地化后缀），
并做四项硬性校验，任何一项不过就非零退出：开发池引用的装备全部有译名、
全部玩家舰有译名、开发池引用的舰级有译名，以及**派生出的简体舰级名必须与
既有 `ctype.json` 逐字相同**（这条同时验证派生算法与两条取数路径的等价性）。

`ja` 的 `items.json`/`ships.json` **故意是空对象**：日文名的唯一真值源是
`start2.json`，复制一份进来会在 start2 更新而脚本没重跑时静默漂移。
`zh-Hans` **不产出 `ctype.json`**：`public/data/ctype.json` 本身就是那份数据。

校验全部通过后，脚本还会写一份 `public/data/i18n/_meta.json`，记录数据源
URL、许可证、本次同步用的 KC3 commit（解析不到时诚实记为 `null` 而不是
伪造一个像哈希的占位符）与四语言各自的产出计数——控制台输出不随仓库分发，
这份文件是产出数据出处的唯一持久记录。它不在 `tests/oracle.spec.ts` 的
哈希钉死范围内。

⚠️ 更新 `public/data/start2.json` 后必须重跑本脚本 —— 舰船与装备的译名表是
按当前那份 start2 的 ID 集合生成的。

## 渲染核验（headless Chrome）

```sh
pnpm verify-render   # 内部先 pnpm build，再驱动一份真实 headless Chrome
```

**为什么需要这个，`pnpm test` 还不够**：本仓库的单测全部跑在 jsdom 里——
jsdom **不做布局**（任何元素的 `getBoundingClientRect` 一律是 0）、也**不解析
CSS**（`:lang()` 选择器、`--form-label-width` 这类自定义属性、字体栈解析
统统不生效）。四语言 i18n 支持落地后，这份测试套件对渲染结果与真实布局
完全是盲的——1300+ 项测试全绿，不代表某个语言下标签真的不会把输入框挤到
换行、也不代表 `font-family` 真的解析到了预期字体。`scripts/verify-render.mjs`
就是用来看这些东西的：它跑生产构建（`pnpm build` 产物，不是 dev server），
用 `/usr/bin/google-chrome` 的 headless 模式把页面真的渲染出来，读真实的
`getBoundingClientRect()` / `getComputedStyle()`。

**用什么驱动 Chrome**：不引入 puppeteer/playwright——本项目运行时依赖只有
`vue`/`pinia`/`vue-router`，同 `sync-data.mjs`/`sync-i18n.mjs` 的既有原则，
能自己写的依赖不引入。Chrome Devtools Protocol 是纯 WebSocket + JSON 消息，
Node 22 起 `fetch`/`WebSocket` 都是无需额外依赖的全局对象，直接拿它们说
CDP 即可。

**覆盖内容**：对 `zh-Hans`/`zh-Hant`/`ja`/`en` 各一轮，每轮：
- 用 `Page.addScriptToEvaluateOnNewDocument` 在应用自己的脚本跑之前把目标
  语言写进 `localStorage['kc-development.locale']`——这是应用支持的真实
  持久化路径（`src/i18n/index.ts` 的 `initLocale()` 冷启动时优先读它），
  不是伪造 `navigator.languages` 走探测分支（那需要独立的浏览器/会话隔离，
  且探测逻辑本身已由 `detect.spec.ts` 详尽单测覆盖，不需要真实浏览器复核）；
- 等应用异步数据加载与该语言的名称表加载都结束（`.data-loading` 消失、
  秘书舰下拉框有选项、`<html lang>` 写成目标语言）；
- 在秘书舰搜索框里打字触发建议列表、点第一个可用装备按钮让「可用公式」
  表有内容；
- 在 1400px（宽）与 1024px（窄）两档视口下，分别抓取：秘书舰下拉框选项
  文案、两张表格的表头、装备按钮文案样本、`document.title`/`<html lang>`、
  `body` 实际解析到的 `font-family`，以及「秘书舰类型」标签/其
  `<select>`/秘书舰搜索 `<input>`/建议列表 `<ul>` 四者的 `getBoundingClientRect`。

**⚠️ 故意不接入 `pnpm test`**：它依赖本机装有 `/usr/bin/google-chrome`，
没装 Chrome 的机器上 `pnpm test` 不该因此变红——这是一道独立于单测套件、
需要真实浏览器才能跑的关卡，人工或后续 agent 按需单独执行。任何一个语言
未能在规定超时内完成初始化，脚本以非零状态码退出，可以接入 CI 网关；
结果同时打印到 stdout、并写入 `.superpowers/sdd-round2/render-verification.json`
供后续脚本化比对。

## 测试

```sh
pnpm test        # 单元测试 + 基准对拍
pnpm type-check  # 类型检查
```

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
pnpm install
```

### Compile and Hot-Reload for Development

```sh
pnpm dev
```

### Type-Check, Compile and Minify for Production

```sh
pnpm build
```
