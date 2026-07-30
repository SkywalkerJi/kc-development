#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { buildShipTranslator, deriveCtypeName } from './kc3Names.mjs'

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

const errors = []
mkdirSync(OUT, { recursive: true })

for (const locale of ['ja', 'zh-Hans', 'zh-Hant', 'en']) {
  const dir = join(OUT, locale)
  mkdirSync(dir, { recursive: true })

  let items = {}
  let ships = {}
  let ctype = {}

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

    if (locale !== 'zh-Hans') {
      // zh-Hans 不产 ctype 文件：public/data/ctype.json 已经是那份数据，
      // 再产一份就是第二个真值源（而且复制的是被哈希钉死的文件）
      ctype = Object.fromEntries(
        ctypeJa
          .map((jaName, i) => [i, jaName ? (deriveCtypeName(jaName, kc3Ships, kc3Affix.ctype ?? {}) ?? jaName) : ''])
          .filter(([, n]) => n),
      )
    }

    // 硬性校验：开发池引用到的装备与全部玩家舰必须全部有译名
    const missItems = refEquipIds.filter((id) => !items[id])
    if (missItems.length) errors.push(`[${locale}] 开发池引用的装备缺译名 ${missItems.length} 件：${missItems.slice(0, 10).join(', ')}`)
    const missShips = playerShipIds.filter((id) => !ships[id])
    if (missShips.length) errors.push(`[${locale}] 玩家舰缺译名 ${missShips.length} 艘：${missShips.slice(0, 10).join(', ')}`)

    if (locale === 'zh-Hans') {
      // 自校验：派生出的简中舰级名必须与既有 ctype.json 在共有键上逐字相同。
      // 这既验证派生算法，也证明「zh-Hans 读 ctypeMap」与「其余语言读产出文件」
      // 两条取数路径是等价的。
      const derived = Object.fromEntries(
        ctypeJa.map((n, i) => [i, n ? deriveCtypeName(n, kc3Ships, kc3Affix.ctype ?? {}) : null]).filter(([, n]) => n),
      )
      const mismatch = Object.entries(derived).filter(([k, v]) => ctypeZhHans[k] && ctypeZhHans[k] !== v)
      if (mismatch.length) {
        errors.push(`[自校验] 派生的简中舰级名与 ctype.json 不一致 ${mismatch.length} 条：` +
          mismatch.slice(0, 5).map(([k, v]) => `${k} 派生=${v} 现有=${ctypeZhHans[k]}`).join('; '))
      }
    }
  }

  // 开发池引用到的舰级必须能查到（ja 从 ctypeJa 取，其余从派生结果取；
  // zh-Hans 走 ctypeMap，由上面的自校验覆盖）
  if (locale !== 'zh-Hans') {
    const missCtype = refCtypeIds.filter((id) => !ctype[id])
    if (missCtype.length) errors.push(`[${locale}] 开发池引用的舰级缺译名：${missCtype.join(', ')}`)
  }

  writeFileSync(join(dir, 'items.json'), JSON.stringify(items), 'utf8')
  writeFileSync(join(dir, 'ships.json'), JSON.stringify(ships), 'utf8')
  if (locale !== 'zh-Hans') writeFileSync(join(dir, 'ctype.json'), JSON.stringify(ctype), 'utf8')

  const note = locale === 'ja' ? '（items/ships 故意为空，名称取自 start2.json）' : ''
  console.log(`[${locale}] 装备 ${Object.keys(items).length} / 舰船 ${Object.keys(ships).length} / 舰级 ${Object.keys(ctype).length} ${note}`)
}

let commit = '未知'
try {
  commit = execFileSync('git', ['-C', KC3, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
} catch { /* 不是 git 仓库时留「未知」，不因此失败 */ }
console.log(`\n数据源：KC3Kai/kc3-translations（MIT）commit ${commit}`)

if (errors.length) {
  console.error('\n校验失败：')
  errors.forEach((e) => console.error('  ' + e))
  console.error('\n⚠️ 文件已写出，但存在上述缺口，请修复后重跑。')
  process.exit(1)
}
console.log('校验通过。')
