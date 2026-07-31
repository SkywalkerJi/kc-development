#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { buildShipTranslator, deriveCtypeName } from './kc3Names.mjs'
import { validate } from './syncI18nValidate.mjs'

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
      ctype = Object.fromEntries(
        ctypeJa
          .map((jaName, i) => [i, jaName ? (deriveCtypeName(jaName, kc3Ships, kc3Affix.ctype ?? {}) ?? jaName) : ''])
          .filter(([, n]) => n),
      )
    }
  }

  produced[locale] = { items, ships, ctype, derivedCtype }
  const note = locale === 'ja' ? '（items/ships 故意为空，名称取自 start2.json）' : ''
  console.log(`[${locale}] 装备 ${Object.keys(items).length} / 舰船 ${Object.keys(ships).length} / 舰级 ${Object.keys(ctype).length} ${note}`)
}

let commit = null
try {
  commit = execFileSync('git', ['-C', KC3, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
} catch { /* 不是 git 仓库时留 null，不因此失败 —— provenance 缺失不是数据缺失 */ }
console.log(`\n数据源：KC3Kai/kc3-translations（MIT）commit ${commit ?? '未知'}`)

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
writeFileSync(
  join(OUT, '_meta.json'),
  JSON.stringify(
    {
      source: 'https://github.com/KC3Kai/kc3-translations',
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

console.log('校验通过。')
