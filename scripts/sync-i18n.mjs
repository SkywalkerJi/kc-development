#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { buildShipTranslator, deriveCtypeName } from './kc3Names.mjs'
import { validate } from './syncI18nValidate.mjs'
import { buildThirdPartyNotice } from './thirdPartyNotice.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'public', 'data')
const OUT = join(DATA, 'i18n')

// --kc3 必填，不给默认值：写死路径会把某台机器的目录布局固化进仓库
// （与 sync-data.mjs 的 --from 同一处理）
const idx = process.argv.indexOf('--kc3')
const KC3 = idx !== -1 ? process.argv[idx + 1] : undefined
if (!KC3) {
  console.error('用法：pnpm sync-i18n --kc3 <kc3-translations 仓库路径>')
  console.error('  例：pnpm sync-i18n --kc3 ../vendor/kc3-translations')
  process.exit(1)
}

/** KC3 的 json 有的带 BOM，统一剥掉 */
const load = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''))
/** 剥 BOM 但不当 JSON 解析——LICENSE 是纯文本 */
const loadText = (p) => readFileSync(p, 'utf8').replace(/^﻿/, '')

// 产出的 items/ships/ctype.json 是 KC3Kai/kc3-translations（MIT）的衍生数据，
// MIT 要求"版权声明与许可声明须保留在软件的所有副本或实质性部分中"——这份
// 校验必须在读取任何 KC3 数据**之前**做（P1：THIRD_PARTY_NOTICES 缺失或
// 与数据来源的协议脱节，比任何一项翻译校验都更早地让整次同步失去意义）：
// 克隆里没有 LICENSE，就没有可以合法引用这批数据、也没有可以如实转录的
// 协议文本，此时同步任何数据都是在无声地丢弃 MIT 的署名/协议留存条款，
// 必须直接拒绝，不能等到 validate() 那一步才发现。
const KC3_LICENSE_PATH = join(KC3, 'LICENSE')
if (!existsSync(KC3_LICENSE_PATH)) {
  console.error(`未找到 ${KC3_LICENSE_PATH}`)
  console.error('KC3Kai/kc3-translations 依 MIT 协议分发，协议要求版权与许可声明随数据一起保留；')
  console.error('clone 里缺这份 LICENSE 文件就没有可转录的协议原文，拒绝继续同步（不产出无出处的数据）。')
  process.exit(1)
}
const kc3LicenseText = loadText(KC3_LICENSE_PATH).trimEnd()

// LICENSE 存在不等于内容对：一个被截断成空文件、误放了别的许可证全文、或
// 随手写的占位符，都能通过上面的 existsSync 检查，但下面 buildThirdPartyNotice()
// 会把这份文本原样转录成"MIT 许可声明"——转录的前提是这份文本真的是 MIT
// 声明，否则就是在合法地声明一件不存在的事。这里只做宽松的特征匹配（标题行
// + "Permission is hereby granted, free of charge" 那句 MIT 标志性授权语句），
// 不逐字比对 SPDX 官方模板：不同项目/年份的 MIT 声明在版权行、换行、空白上
// 有正常的书写差异，逐字比对会连真实合法的 MIT 声明也一并拒绝；这里要拦的是
// "完全不是 MIT 文本"，不是"和某个模板差一个字符"。
if (!/\bMIT License\b/i.test(kc3LicenseText) || !/Permission is hereby granted, free of charge/i.test(kc3LicenseText)) {
  console.error(`${KC3_LICENSE_PATH} 存在，但内容不像 MIT 许可证全文`)
  console.error('校验不到 MIT 的标志性文本（标题行 / "Permission is hereby granted, free of charge" 那句授权语句）——')
  console.error('可能是空文件、被截断，或误放了别的许可证；拒绝继续同步（不产出一份声明内容对不上实际许可证的转录）。')
  process.exit(1)
}

// 产出数据的出处记录（THIRD_PARTY_NOTICES / _meta.json）精确到 KC3 clone
// 的某个 commit——如果这次实际读到的内容混了尚未提交的本地改动，"来自
// commit X"就是一句假话：commit X 那次提交里根本没有这些改动。必须在读取
// 任何一份 KC3 数据（items/ships/ctype.json 等，下面从 `start2 = load(...)`
// 开始）**之前**核实工作区干净，理由与上面 LICENSE 检查完全一样——事后
// （比如靠 validate() 报错）发现不了这个问题：数据内容本身可能是"合法"的
// 译名，只是出处记录会撒谎，指向一个不包含这些内容的 commit。
let commit = null
try {
  commit = execFileSync('git', ['-C', KC3, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
} catch {
  // 不是 git 仓库（或 git 不可用）时留 null，不因此失败——provenance 缺失
  // 不是数据缺失，_meta.json/THIRD_PARTY_NOTICES 会如实标注"未知"，不是在
  // 撒谎；没有 commit 也就没有"脏"这个概念可言，下面的脏检查因此无从做起。
}
if (commit !== null) {
  const dirtyStatus = execFileSync('git', ['-C', KC3, 'status', '--porcelain'], { encoding: 'utf8' })
  if (dirtyStatus.trim() !== '') {
    console.error(`${KC3} 工作区不干净（有未提交的改动），拒绝以它作为同步数据源：`)
    console.error(dirtyStatus.trimEnd())
    console.error('')
    console.error(`这些改动一旦被读进本次同步，产出数据里就可能混入未提交的内容，但出处记录只会`)
    console.error(`写 commit ${commit}——那次提交并不包含这些改动，记录会失实。`)
    console.error('解决办法二选一：在 KC3 clone 里 git commit / git stash 这些改动，或者换一份干净的 clone/checkout 后重试。')
    process.exit(1)
  }
}
console.log(`数据源：KC3Kai/kc3-translations（MIT）commit ${commit ?? '未知'}`)

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
const ctypeJa = load(join(KC3, 'data', 'en', 'ctype.json'))

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
    const kc3 = join(KC3, 'data', KC3_DIR[locale])
    const kc3Items = load(join(kc3, 'items.json'))
    const kc3Ships = load(join(kc3, 'ships.json'))
    const kc3Affix = load(join(kc3, 'ship_affix.json'))
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

// commit/干净工作区的核验在文件顶部（读取任何 KC3 数据之前）已经做过，
// 这里不重复——`commit` 是那段代码留下的同一个变量，下面直接用。

const errors = validate(produced, { refEquipIds, playerShipIds, refCtypeIds, ctypeZhHans })

if (errors.length) {
  console.error('\n校验失败，未写入任何文件：')
  errors.forEach((e) => console.error('  ' + e))
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })
for (const locale of ['ja', 'zh-Hans', 'zh-Hant', 'en']) {
  const dir = join(OUT, locale)
  mkdirSync(dir, { recursive: true })
  const { items, ships, ctype } = produced[locale]
  writeFileSync(join(dir, 'items.json'), JSON.stringify(items), 'utf8')
  writeFileSync(join(dir, 'ships.json'), JSON.stringify(ships), 'utf8')
  if (locale !== 'zh-Hans') writeFileSync(join(dir, 'ctype.json'), JSON.stringify(ctype), 'utf8')
}

// 产出的 items/ships/ctype.json 本身都是裸的 id → 译名映射，不带任何出处信息。
// _meta.json 不受 tests/oracle.spec.ts 的哈希钉死（不在那三份文件之列），把数据源、
// 许可证与本次同步用的 KC3 commit 落到这里，比只打印在终端上更可靠 —— 控制台输出
// 不会随仓库一起被 clone 下来。刻意不记生成时间戳：这份文件应当是
// (KC3 commit, start2.json, DevelopmentPool.json) 的纯函数，同一输入重跑
// 应该产出逐字节相同的 _meta.json，方便靠 git diff 判断"这次同步到底有没有变化"。
const KC3_SOURCE_URL = 'https://github.com/KC3Kai/kc3-translations'

writeFileSync(
  join(OUT, '_meta.json'),
  JSON.stringify(
    {
      source: KC3_SOURCE_URL,
      license: 'MIT',
      commit,
      commitResolved: commit !== null,
      counts: Object.fromEntries(
        Object.entries(produced).map(([locale, { items, ships, ctype }]) => [
          locale,
          { items: Object.keys(items).length, ships: Object.keys(ships).length, ctype: Object.keys(ctype).length },
        ]),
      ),
    },
    null,
    2,
  ),
  'utf8',
)

// MIT 的留存条款不能只满足在仓库层面——一份从 dist/ 单独拿出去的构建产物
// 也得带着它，见本文件顶部读 LICENSE 那段注释。两份内容完全相同（都是
// buildThirdPartyNotice() 的输出，同一个 commit/licenseText）：
// - 仓库根：随源码走读的人最先看到的地方，紧挨着本仓库自己的 GPLv3 LICENSE。
// - public/data/i18n/：随生产构建一起进 dist/data/i18n/（vite 原样拷贝
//   public/ 下的文件，不需要额外配置），挨着它描述的那批 JSON 数据本身——
//   只有这一份能保证"数据"和"数据的许可声明"在任何裁剪/分发场景下都不分家。
const notice = buildThirdPartyNotice({ source: KC3_SOURCE_URL, commit, licenseText: kc3LicenseText })
writeFileSync(join(ROOT, 'THIRD_PARTY_NOTICES'), notice, 'utf8')
writeFileSync(join(OUT, 'THIRD_PARTY_NOTICES'), notice, 'utf8')

console.log('校验通过，THIRD_PARTY_NOTICES 已更新。')
