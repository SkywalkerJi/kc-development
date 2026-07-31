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

⚠️ **KC3 clone 里必须有 `LICENSE` 文件**：这批译名数据以 MIT 协议分发，
MIT 要求版权声明与许可声明随数据一起保留。脚本会在读取任何 KC3 数据**之前**
检查 `<kc3 clone>/LICENSE` 是否存在，缺了就直接非零退出、不产出数据——不能
让「数据同步成功」和「许可证留存条款被满足」这两件事脱钩。校验通过后，
脚本用这份 `LICENSE` 的原文生成 [`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES)
（仓库根目录）与 `public/data/i18n/THIRD_PARTY_NOTICES`（内容相同）两份文件，
记录项目名、来源 URL、本次同步用的 commit，以及 MIT 协议全文（含版权行）：
根目录那份供随源码走读的人查看，紧挨着本仓库自己的 GPLv3 `LICENSE`；
`public/data/i18n/` 那份随生产构建原样进 `dist/data/i18n/`，保证单独拿走这批
JSON 数据的人也能看到它的许可证——这两份文件都由脚本生成、随每次同步覆盖，
不要手改。`scripts/__tests__/thirdPartyNotice.spec.ts` 钉住它们的 commit
与 `_meta.json` 保持一致，防止两者未来因为忘记同步更新而各说各话。

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
  `<select>`/秘书舰搜索 `<input>`/建议列表 `<ul>` 四者的 `getBoundingClientRect`；
  外加两个标签（「秘书舰类型」「秘书舰」）在不受 `--form-label-width` 约束时
  的 shrink-to-fit 真实宽度与字号（`labelIntrinsic`）——这是 `base.css` 里
  三个 `:lang()` 覆盖值的取值依据，此前按字符数估、标注过「pending
  measurement」，现在直接测。

**⚠️ 故意不接入 `pnpm test`**：它依赖本机装有 `/usr/bin/google-chrome`，
没装 Chrome 的机器上 `pnpm test` 不该因此变红——这是一道独立于单测套件、
需要真实浏览器才能跑的关卡，人工或后续 agent 按需单独执行。

**它既是报告也是关卡**：上面抓到的每一项都会被 `assertSnapshot()` 拿去核验，
不只是记进 JSON，但"核验"具体做的事因字段而异，不是每一项都逐字比对期望值
（下面如实列出，不夸大）：
- **逐字精确比对期望值**（`EXPECTED` 表，按语言各自列出）：`document.title`、
  「秘书舰类型」「秘书舰」两个标签的文字、两张表格的表头、`body` 实际解析到
  的 `font-family`、`--form-label-width`、秘书舰搜索建议列表的前几条样本。
  这些要么是静态 i18n 文案、要么是纯 CSS 声明值，同一份源码在任何机器上
  应该解析出逐字相同的结果。
- **锚点 + 数量 + 全表性质**（不逐字比对整份列表）：秘书舰下拉框选项（45
  条）与装备按钮样本——这两张列表由游戏数据驱动、数量大，逐字钉死整份
  列表会让任何一次合法的数据更新都报出一堆无关的假警报；改成钉住每个
  语言的第一条 + 总数（下拉框恒为 45）+（仅 `en`）全表不出现汉字表意
  文字——最后一条直接针对"英文整个/部分回退成中文或日文"这一具体缺陷。
- **纯粹检查存在/非空**：`equipmentListHeaders`、`equipmentButtonSample`
  非空，`suggestionsCount > 0`。
- **几何性质**：`getBoundingClientRect` 能拿到（`REQUIRED_BOXES`）且宽高
  为正、不越出当前视口右边界；建议列表与输入框左边缘对齐；`labelIntrinsic`
  的两个宽度（这台机器实际解析到的字体量出来的 shrink-to-fit 像素宽度，
  换一台字体不同的机器数值会变，不能精确比对）退到"形状"断言：两者都
  必须为正，「秘书舰类型」那个必须比「秘书舰」那个宽，且两者的 `fontSize`
  必须相等。

秘书舰下拉框没有选项、表头缺失、任何一个盒子的 `getBoundingClientRect`
拿不到、搜索没产出建议、建议列表与输入框没有左对齐、`<html lang>` 与目标
语言不符、上面任何一条精确比对/锚点/几何断言不成立，都会让整个进程以
非零状态码退出，可以接入 CI 网关；某个语言整体核验失败（初始化超时等）
同样如此。结果同时打印到 stdout、并写入
`.superpowers/sdd-round2/render-verification.json` 供后续脚本化比对——
JSON 是证据，退出码才是判决。

预览服务器的端口默认交给操作系统在 `vite preview` 真正绑定的那一刻分配
（`--port 0`），脚本解析 `vite preview` 自己在 stdout 报告的、它实际绑定
成功的端口号，再用这个端口连接——不是反过来自己猜一个端口再假定绑定
成功。TCP 端口的绑定在同一时刻是排他的，一旦确认这是本进程自己报告绑定
成功的端口、且进程仍然存活，接下来连接这个端口就不可能连到别的服务器；
`dist/` 里额外写的一次性 marker 文件是这层身份确认**之外**的内容新鲜度
校验（确认当前提供的确实是这次构建的产物），不是身份证据本身——同一份
`dist/` 如果恰好也被另一个服务器（比如没清理干净的旧 `vite preview`）
提供，那个旧服务器一样会从磁盘现读现返新写入的 marker、原样应答，marker
匹配因此不能单独证明"连到的是这次启动的进程"，能证明这件事的只有"连接
的端口是本进程自己报告绑定成功的那个"。`vite preview` 子进程从确认就绪
到核验流程结束期间的任何非预期退出（非零 code、或被信号杀掉，且不是本
工具自己收尾导致的）都会被记成硬失败，不管在那之后其余步骤看起来是否
仍然"正常"。`VERIFY_RENDER_PORT` 环境变量可以覆盖动态端口选择，强制
`vite preview` 绑定到一个指定端口，仅用于手动构造"端口被占用"场景的
测试/演示，正常使用不需要设置它。

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
