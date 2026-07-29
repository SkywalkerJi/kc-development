# kc-development

舰娘装备开发配方计算器。

## 数据更新

装备开发的出货率表与游戏基础数据存放在 `public/data/`，通过同步脚本更新：

```sh
pnpm sync-data --from /path/to/dir
```

`--from` 指向的目录需包含 `DevelopmentPool.json`、`ctype.json`、`start2.json`。

脚本会剥离源文件中的注释、校验数据完整性，并打印本次变更摘要。

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
