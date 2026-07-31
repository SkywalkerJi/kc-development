#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { buildShipTranslator, deriveCtypeName } from './kc3Names.mjs'
import { validate } from './syncI18nValidate.mjs'
import { buildThirdPartyNotice } from './thirdPartyNotice.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'public', 'data')
const OUT = join(DATA, 'i18n')
const KC3_SOURCE_URL = 'https://github.com/KC3Kai/kc3-translations'

// KC3Kai/kc3-translations 项目本身以 MIT 授权，MIT 要求版权声明与许可声明
// 随衍生数据一起保留（见下面 buildThirdPartyNotice() 那段注释）。这段文本
// 不再是每次 `pnpm sync-i18n` 时从 --kc3 指向的 clone 里读 LICENSE 文件
// 转录出来的——不再读取、也不再校验 clone 里的 LICENSE，直接写死在这里。
// 逐字节等于本仓库 THIRD_PARTY_NOTICES 里已经转录的那份文本，最初来自
// KC3Kai/kc3-translations commit 55a0d67653dec49a0a2a8fa5e90922ff8a7f1ef2
// 的 LICENSE 文件。KC3 如果未来更新了许可证文本，需要有人手动核对新文本、
// 更新这个常量——不再由脚本自动读取或校验。
const KC3_LICENSE_TEXT = `The MIT License (MIT)

Copyright (c) 2015-2021 KC3改

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

// --kc3 必填，不给默认值：写死路径会把某台机器的目录布局固化进仓库
// （与 sync-data.mjs 的 --from 同一处理）
const idx = process.argv.indexOf('--kc3')
const KC3_ARG = idx !== -1 ? process.argv[idx + 1] : undefined
if (!KC3_ARG) {
  console.error('用法：pnpm sync-i18n --kc3 <kc3-translations 仓库路径>')
  console.error('  例：pnpm sync-i18n --kc3 ../vendor/kc3-translations')
  process.exit(1)
}

/** 本仓库自己的数据文件（public/data/ 下）：普通文件系统读取，与 KC3
 *  出处无关，不受下面 kc3Load() 的任何约束。 */
const load = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''))

// KC3 clone 路径解析：只用来定位读取 KC3 数据文件的实际目录，以及记录一个
// best-effort 的 commit 到 _meta.json / THIRD_PARTY_NOTICES 里，供人工核对
// 版本时参考。这里曾经有一整套出处核验（--show-toplevel 核对 --kc3 给的
// 目录确实是仓库根、核对 origin 远程地址指向官方仓库、拒绝脏工作区、只读
// commit 指向的 git blob 而不读工作区）——这些检查保护的是"生成数据的人
// 有没有操作正确"：跑 `pnpm sync-i18n` 的人就坐在屏幕前，能亲眼看到打印
// 出的 commit、能亲眼看到产出的译名对不对，这类检查的边际收益低，维护
// 成本（~90 行、四个失败分支各自的报错文案）不成比例，整体去掉了。commit
// 字段因此降级为"大概率对、可用来定位版本"的记录，不再是"已验证确实来自
// 官方仓库、工作区干净"的断言——如果 --kc3 指向的目录本身不是 git 仓库、
// 解析不出 HEAD，仍然直接拒绝，因为那样就真的没有任何 commit 可记。
let kc3Real
try {
  kc3Real = realpathSync(resolve(KC3_ARG))
} catch {
  console.error(`${KC3_ARG} 不存在或不可读`)
  process.exit(1)
}

let commit
try {
  commit = execFileSync('git', ['-C', kc3Real, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
} catch {
  console.error(`${KC3_ARG}（解析为 ${kc3Real}）不是 git 仓库，或没有可解析的 HEAD——`)
  console.error('拿不到任何 commit 可记录，换一份真正的 git clone 后重试。')
  process.exit(1)
}

console.log(`数据源：KC3Kai/kc3-translations（MIT）commit ${commit}（记录性质，未核验来源仓库/工作区是否干净）`)

/** 从 KC3 clone 的工作区读取文件——直接读磁盘上的当前内容，不再走
 *  `git show <commit>:<path>` 读 blob。relPath 是相对 kc3Real 的路径。 */
function kc3ReadFile(relPath) {
  const fullPath = join(kc3Real, relPath)
  try {
    return readFileSync(fullPath, 'utf8')
  } catch (e) {
    console.error(`无法读取 ${fullPath}：`)
    console.error(String(e.message ?? e))
    process.exit(1)
  }
}
/** KC3 的 json 有的带 BOM，统一剥掉 */
const kc3Load = (relPath) => JSON.parse(kc3ReadFile(relPath).replace(/^﻿/, ''))

/** 本项目 locale → KC3 目录名。ja 不对应任何目录，名称直接取自 start2。 */
const KC3_DIR = { 'zh-Hans': 'scn', 'zh-Hant': 'tcn', en: 'en' }

const start2 = load(join(DATA, 'start2.json'))
const pools = load(join(DATA, 'DevelopmentPool.json'))
const ctypeZhHans = load(join(DATA, 'ctype.json'))

const equipJa = new Map(start2.api_mst_slotitem.map((e) => [e.api_id, e.api_name]))
const shipJa = new Map(start2.api_mst_ship.map((s) => [s.api_id, s.api_name]))
const playerShipIds = [...shipJa.keys()].filter((id) => id < 1500)
// 开发池实际引用到的装备与舰级 —— 硬性校验只针对它们，
// start2 里那些开发池根本不会出的装备翻不出来不该阻断同步
const refEquipIds = [...new Set(pools.flatMap((p) => Object.keys(p.出货率 ?? {}).map(Number)))]
const refCtypeIds = [...new Set(pools.flatMap((p) => (p.舰型 ?? []).map(Number).filter((n) => !Number.isNaN(n))))]

// KC3 的 en/ctype.json 存的是**日文**舰级名（数组，下标即 ctype ID），
// 是 ja 的直接来源，也是其余语言派生的输入
const ctypeJa = kc3Load('data/en/ctype.json')

// 四种语言的产出先全部算进内存，等 validate() 通过之后才落盘 ——
// 同 sync-data.mjs 的 validate-then-write 顺序，避免"部分语言校验失败、
// 但已经写出的文件"这种半成品状态误导下一步（运行时或下一次对拍）。
const produced = {}

for (const locale of ['ja', 'zh-Hans', 'zh-Hant', 'en']) {
  let items = {}
  let ships = {}
  let ctype = {}
  let derivedCtype = {} // 仅 zh-Hans 用得到：scn 派生出的舰级名，只喂自校验，从不落盘
  // 仅 zh-Hant/en 用得到：deriveCtypeName 真正派生成功（而不是 89 行那句
  // `?? jaName` 兜底成日文原文）的舰级 ID 集合。只喂 validate() 的校验 4，
  // 从不落盘——理由见 syncI18nValidate.mjs 里 validate() 对这个字段的注释：
  // 「有译名」和「有值」在 ctype 表这里是两件不同的事，日文回填两者都满足
  // 第二条却不满足第一条，只看 ctype[id] 是否 truthy 分不出这两种情况。
  let derivedIds = new Set()

  if (locale === 'ja') {
    // items/ships 留空：日文名的唯一真值源是 start2.json 本身。复制一份进来
    // 会造成第二个真值源 —— start2 更新而本脚本没重跑时会静默漂移。
    // 运行时按「缺键 → 回退 start2 原名」处理，正好落到这条路径上。
    ctype = Object.fromEntries(ctypeJa.map((n, i) => [i, n]).filter(([, n]) => n))
  } else {
    const kc3Dir = `data/${KC3_DIR[locale]}`
    const kc3Items = kc3Load(`${kc3Dir}/items.json`)
    const kc3Ships = kc3Load(`${kc3Dir}/ships.json`)
    const kc3Affix = kc3Load(`${kc3Dir}/ship_affix.json`)
    const translateShip = buildShipTranslator(kc3Ships, kc3Affix)

    for (const [id, ja] of equipJa) {
      const t = kc3Items[ja]
      if (t) items[id] = t
    }
    for (const id of playerShipIds) {
      const t = translateShip(id, shipJa.get(id))
      if (t) ships[id] = t
    }

    if (locale === 'zh-Hans') {
      // zh-Hans 不产 ctype 文件：public/data/ctype.json 已经是那份数据，
      // 再产一份就是第二个真值源（而且复制的是被哈希钉死的文件）。
      // derivedCtype 只是拿 scn 的舰船/前后缀表把 ctypeJa 走一遍派生算法，
      // 结果只喂给 syncI18nValidate 的自校验，从不写进任何文件。
      derivedCtype = Object.fromEntries(
        ctypeJa.map((n, i) => [i, n ? deriveCtypeName(n, kc3Ships, kc3Affix.ctype ?? {}) : null]).filter(([, n]) => n),
      )
    } else {
      // ?? jaName：查不到译名时直接回填日文原文，让 ctype 表本身自洽
      // （运行时 ctypeName() 不存在另一份日文源可回退，见 src/i18n/index.ts
      // 里 ctypeName 的注释）。但「回填了日文」不等于「派生出了译名」——
      // derivedIds 只记真正 deriveCtypeName() 成功的那些 ID，喂给 validate()
      // 的校验 4，让「开发池引用的舰级能不能查到值」与「查到的是不是真译名」
      // 分开判断，不再混为一谈。
      ctype = Object.fromEntries(
        ctypeJa
          .map((jaName, i) => {
            if (!jaName) return [i, '']
            const derived = deriveCtypeName(jaName, kc3Ships, kc3Affix.ctype ?? {})
            if (derived) derivedIds.add(i)
            return [i, derived ?? jaName]
          })
          .filter(([, n]) => n),
      )
    }
  }

  produced[locale] = { items, ships, ctype, derivedCtype, derivedIds }
  const note = locale === 'ja' ? '（items/ships 故意为空，名称取自 start2.json）'
    : (locale === 'zh-Hant' || locale === 'en')
      ? `（其中派生 ${derivedIds.size} / 日文回填 ${Object.keys(ctype).length - derivedIds.size}）`
      : ''
  console.log(`[${locale}] 装备 ${Object.keys(items).length} / 舰船 ${Object.keys(ships).length} / 舰级 ${Object.keys(ctype).length} ${note}`)
}

// KC3 clone 路径解析与 commit 记录（best-effort，未核验来源仓库/工作区是否
// 干净）都已经在文件顶部（写任何文件之前）做完——`commit` 是那段代码留下的
// 同一个变量，下面直接用。

const errors = validate(produced, { refEquipIds, playerShipIds, refCtypeIds, ctypeZhHans })

if (errors.length) {
  console.error('\n校验失败，未写入任何文件：')
  errors.forEach((e) => console.error('  ' + e))
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })
for (const locale of ['ja', 'zh-Hans', 'zh-Hant', 'en']) {
  mkdirSync(join(OUT, locale), { recursive: true })
}

const filesToWrite = []
for (const locale of ['ja', 'zh-Hans', 'zh-Hant', 'en']) {
  const dir = join(OUT, locale)
  const { items, ships, ctype } = produced[locale]
  filesToWrite.push({ path: join(dir, 'items.json'), content: JSON.stringify(items) })
  filesToWrite.push({ path: join(dir, 'ships.json'), content: JSON.stringify(ships) })
  if (locale !== 'zh-Hans') filesToWrite.push({ path: join(dir, 'ctype.json'), content: JSON.stringify(ctype) })
}

// 产出的 items/ships/ctype.json 本身都是裸的 id → 译名映射，不带任何出处信息。
// _meta.json 不受 tests/oracle.spec.ts 的哈希钉死（不在那三份文件之列），把数据源、
// 许可证与本次同步用的 KC3 commit 落到这里，比只打印在终端上更可靠 —— 控制台输出
// 不会随仓库一起被 clone 下来。刻意不记生成时间戳：这份文件应当是
// (KC3 commit, start2.json, DevelopmentPool.json) 的纯函数，同一输入重跑
// 应该产出逐字节相同的 _meta.json，方便靠 git diff 判断"这次同步到底有没有变化"。
// commit 字段现在只是 --kc3 指向目录的 `git rev-parse HEAD` 原样结果——不再
// 验证这个目录确实是 KC3Kai/kc3-translations 官方仓库、工作区是否干净，也不
// 再保证读到的文件内容恰好对应这个 commit（现在直接读工作区；如果调用时
// 工作区有未提交的改动，读到的内容可能和这里记录的 commit 对不上）。记录
// 它仍然比不记录好——至少给出一个大概率正确、可用来定位版本的线索，只是
// 不再是"已核实"的断言。
const metaJson = JSON.stringify(
  {
    source: KC3_SOURCE_URL,
    license: 'MIT',
    commit,
    counts: Object.fromEntries(
      Object.entries(produced).map(([locale, { items, ships, ctype }]) => [
        locale,
        { items: Object.keys(items).length, ships: Object.keys(ships).length, ctype: Object.keys(ctype).length },
      ]),
    ),
  },
  null,
  2,
)
filesToWrite.push({ path: join(OUT, '_meta.json'), content: metaJson })

// MIT 的留存条款不能只满足在仓库层面——一份从 dist/ 单独拿出去的构建产物
// 也得带着它，见本文件顶部 KC3_LICENSE_TEXT 那段注释。两份内容完全相同
// （都是 buildThirdPartyNotice() 的输出，同一个 commit/licenseText）：
// - 仓库根：随源码走读的人最先看到的地方，紧挨着本仓库自己的 GPLv3 LICENSE。
// - public/data/i18n/：随生产构建一起进 dist/data/i18n/（vite 原样拷贝
//   public/ 下的文件，不需要额外配置），挨着它描述的那批 JSON 数据本身——
//   只有这一份能保证"数据"和"数据的许可声明"在任何裁剪/分发场景下都不分家。
const notice = buildThirdPartyNotice({ source: KC3_SOURCE_URL, commit, licenseText: KC3_LICENSE_TEXT })
filesToWrite.push({ path: join(ROOT, 'THIRD_PARTY_NOTICES'), content: notice })
filesToWrite.push({ path: join(OUT, 'THIRD_PARTY_NOTICES'), content: notice })

// 逐个直接写入，不再做"先写临时文件、全部成功后统一 rename"的原子落盘。
// 那套机制（~70 行）防的是"某次 writeFileSync 中途失败，磁盘上留下一棵
// 数据文件是新的、THIRD_PARTY_NOTICES 还是旧的"这种半成品树；这类失败
// 实践中只在目标目录只读/磁盘满时发生，触发后原样重跑一次 pnpm sync-i18n
// 就能恢复一致状态，不值得为一个第一次就很少触发、且总能靠重跑修复的
// 失败模式常驻这么多代码。取舍很直接：如果写到一半真的失败了，磁盘上会
// 短暂留下不一致的产出，直到修好问题后重新跑一次——不再有代码保证这个
// 窗口不会出现。
for (const { path, content } of filesToWrite) {
  writeFileSync(path, content, 'utf8')
}

console.log('校验通过，THIRD_PARTY_NOTICES 已更新。')
