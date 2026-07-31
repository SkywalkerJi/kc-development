# 数据维护

## 游戏数据

```sh
pnpm sync-data --from /path/to/dir
```

源目录需包含 `DevelopmentPool.json`、`ctype.json`、`start2.json`。脚本剥离源文件注释、校验数据完整性，并打印本次变更摘要，产物落在 `public/data/`。

> [!WARNING]
> **更新这三份文件后必须重新生成 `tests/fixtures/vectors.json`**，否则 `pnpm test` 会因 `tests/oracle.spec.ts` 的哈希校验失败 —— 该测试比对向量里记录的数据文件 SHA-256 与 `public/data/` 的实际哈希，防止「数据更新了但忘记重新生成基准」被静默放过。

> [!WARNING]
> **生成向量的工具不在本仓库内。** `vectors.json` 是一份固化好的基准，`meta.dataHashes` 只能证明「`public/data/` 与生成向量时用的数据一致」，不能证明它可以凭本仓库的内容重新生成。需要更新基准时，须在能访问该工具的环境里生成后再提交进来 —— 仅凭 `git clone` 本仓库无法完成这一步。

> [!WARNING]
> **更新 `start2.json` 后必须重跑 `pnpm sync-i18n`** —— 舰船与装备的译名表是按当前那份 start2 的 ID 集合生成的。

## 译名

```sh
pnpm sync-i18n --kc3 /path/to/kc3-translations
```

数据源 [KC3Kai/kc3-translations](https://github.com/KC3Kai/kc3-translations)（MIT）。脚本跑舰名合成（基础名 + 前后缀表）与舰级派生（首舰译名 + 本地化后缀），产物落在 `public/data/i18n/`。

四项硬性校验，任何一项不过即非零退出：

1. 开发池引用的装备全部有译名
2. 全部玩家舰有译名
3. 开发池引用的舰级有译名
4. 派生出的简体舰级名与既有 `ctype.json` **逐字相同**

产物布局（有意为之，不是缺漏）：

| 路径 | 说明 |
| --- | --- |
| `ja/items.json`、`ja/ships.json` | 空对象 —— 日文名的唯一真值源是 `start2.json`，复制一份进来会在 start2 更新而脚本没重跑时静默漂移 |
| `zh-Hans/ctype.json` | 不产出 —— `public/data/ctype.json` 本身就是那份数据 |
| `i18n/_meta.json` | 记录数据源 URL、许可证、本次同步用的 KC3 commit、四语言各自的产出计数；不在哈希钉死范围内 |

`_meta.json` 里的 commit 是 `--kc3` 目录 `git rev-parse HEAD` 的原样结果，属记录性质 —— 不核验该目录是否真的是 KC3 官方仓库、工作区是否干净。

## 第三方许可

MIT 要求版权声明与许可声明随数据一起保留。许可证正文写死在 `scripts/sync-i18n.mjs` 的 `KC3_LICENSE_TEXT` 常量里，脚本据此生成两份内容相同的 `THIRD_PARTY_NOTICES`：

| 路径 | 用途 |
| --- | --- |
| 仓库根目录 | 供随源码走读的人查看，紧挨本项目自己的 GPLv3 `LICENSE` |
| `public/data/i18n/` | 随生产构建原样进 `dist/data/i18n/`，保证单独拿走这批 JSON 的人也能看到许可证 |

> [!WARNING]
> 两份文件都由脚本生成、每次同步覆盖，**不要手改** —— `scripts/__tests__/thirdPartyNotice.spec.ts` 钉住它们逐字节相同、都带 MIT 版权行与来源 URL。

> [!WARNING]
> 脚本不再从 `--kc3` 目录读取或校验 `LICENSE` 文件。KC3 若更新许可证文本，需手动核对新文本后更新 `KC3_LICENSE_TEXT` 常量。
