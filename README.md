<div align="center">

# kc-development-tools

**舰队 Collection 装备开发计算器**

投入资源 → 看出货率 　·　 选中装备 → 反推配方

[![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![License](https://img.shields.io/badge/License-GPL--3.0-blue)](./LICENSE)
[![Deploy](https://github.com/SkywalkerJi/kc-development-tools/actions/workflows/deploy.yml/badge.svg)](https://github.com/SkywalkerJi/kc-development-tools/actions/workflows/deploy.yml)

### [▶ 在线使用](https://skywalkerji.github.io/kc-development-tools/)

简体中文 　·　 繁體中文 　·　 日本語 　·　 English

</div>

---

## 功能

|  |  |
| --- | --- |
| **出货率** | 选定秘书舰、填入四项资源，逐件列出出货率与最低资源要求，边改边算 |
| **结果分组** | 目标装备 / 其它装备 / 资源不足导致失败 / 全部被替换，各组带合计 |
| **反推配方** | 点选想要的装备，「可用公式」给出可行配方，点表头可按总资源 / 出货率等任意列排序 |
| **一键套用** | 点中一行公式即把该配方填回资源输入框，方向键同样可选 |
| **秘书舰搜索** | 输入舰名或假名读音定位，并提示该舰归属的开发池 |
| **四语言** | 界面文案与装备名 / 舰名 / 舰级名全部本地化，选择记在浏览器里 |

## 用法

1. 选秘书舰类型，或直接在搜索框输入舰名 / 假名读音
2. 填入油 · 弹 · 钢 · 铝
3. 左表读出货率；在右侧「自选装备组合」点选想要的装备
4. 「可用公式」列出配方，点中一行即自动填回资源

## 数据来源

| 数据 | 来源 | 许可 |
| --- | --- | --- |
| 装备 · 舰船 · 开发池 | 游戏本体数据 | — |
| 各语言译名 | [KC3Kai/kc3-translations](https://github.com/KC3Kai/kc3-translations) | MIT |

## 开发

| 文档 | 内容 |
| --- | --- |
| [开发指南](./docs/development.md) | 环境 · 命令 · 项目结构 · 测试 · 渲染核验 · 部署 |
| [数据维护](./docs/data-maintenance.md) | 游戏数据同步 · 译名同步 · 第三方许可 |

## 许可

本项目以 [GPL-3.0](./LICENSE) 分发。译名数据以 MIT 分发，声明见 [THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES)。
