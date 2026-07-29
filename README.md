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
