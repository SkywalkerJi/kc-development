#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripJsonComments } from './stripJsonComments.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEST = join(ROOT, 'public', 'data')
const FILES = ['DevelopmentPool.json', 'ctype.json', 'start2.json']

const fromArg = process.argv.indexOf('--from')
const SRC = fromArg !== -1 ? process.argv[fromArg + 1] : '/data/incoming/Kanxy/Files'

function load(path) {
  const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
  return JSON.parse(stripJsonComments(raw))
}

function validate(pools, start2, ctype) {
  const errors = []
  const equipIds = new Set(start2.api_mst_slotitem.map((e) => e.api_id))
  const VALID_POOL_IDS = new Set([-2, -1, 1, 2, 3])

  pools.forEach((p, idx) => {
    if (typeof p.开发池名称 !== 'string' || !p.开发池名称)
      errors.push(`第 ${idx} 项缺少 开发池名称`)
    if (!VALID_POOL_IDS.has(p.开发池ID))
      errors.push(`${p.开发池名称}: 开发池ID ${p.开发池ID} 不在 {-2,-1,1,2,3} 内`)
    if (!p.出货率 || typeof p.出货率 !== 'object')
      errors.push(`${p.开发池名称}: 缺少 出货率`)
    else
      for (const k of Object.keys(p.出货率))
        if (!equipIds.has(Number(k)))
          errors.push(`${p.开发池名称}: 装备 ${k} 不存在于 start2`)
  })

  if (Object.keys(ctype).length === 0) errors.push('ctype.json 为空')
  return errors
}

function summarize(name, before, after, keyOf) {
  const b = new Set(before.map(keyOf))
  const a = new Set(after.map(keyOf))
  const added = [...a].filter((k) => !b.has(k))
  const removed = [...b].filter((k) => !a.has(k))
  console.log(`\n[${name}] ${before.length} → ${after.length}`)
  if (added.length) console.log(`  + 新增 ${added.length}: ${added.join(', ')}`)
  if (removed.length) console.log(`  - 删除 ${removed.length}: ${removed.join(', ')}`)
  if (!added.length && !removed.length) console.log('  内容项无增删（字段值可能仍有变化）')
}

for (const f of FILES) {
  const src = join(SRC, f)
  if (!existsSync(src)) {
    console.error(`源文件不存在: ${src}`)
    process.exit(1)
  }
}

const pools = load(join(SRC, 'DevelopmentPool.json'))
const ctype = load(join(SRC, 'ctype.json'))
const start2 = load(join(SRC, 'start2.json'))

const errors = validate(pools, start2, ctype)
if (errors.length) {
  console.error('校验失败，未写入任何文件：')
  errors.slice(0, 20).forEach((e) => console.error('  ' + e))
  if (errors.length > 20) console.error(`  ...另有 ${errors.length - 20} 条`)
  process.exit(1)
}

const oldPools = load(join(DEST, 'DevelopmentPool.json'))
const oldCtype = load(join(DEST, 'ctype.json'))

summarize('DevelopmentPool', oldPools, pools, (p) => `${p.开发池名称}#${p.开发池ID}`)
summarize(
  'ctype',
  Object.entries(oldCtype).map(([k, v]) => ({ k, v })),
  Object.entries(ctype).map(([k, v]) => ({ k, v })),
  (x) => `${x.k}:${x.v}`,
)

const oldEquips = new Set(oldPools.flatMap((p) => Object.keys(p.出货率 ?? {})))
const newEquips = new Set(pools.flatMap((p) => Object.keys(p.出货率 ?? {})))
const addedEquips = [...newEquips].filter((e) => !oldEquips.has(e))
const equipName = new Map(start2.api_mst_slotitem.map((e) => [String(e.api_id), e.api_name]))
console.log(`\n[装备] ${oldEquips.size} → ${newEquips.size}`)
if (addedEquips.length)
  console.log(`  + ${addedEquips.map((e) => `${e} ${equipName.get(e) ?? '?'}`).join(', ')}`)

writeFileSync(join(DEST, 'DevelopmentPool.json'), JSON.stringify(pools), 'utf8')
writeFileSync(join(DEST, 'ctype.json'), JSON.stringify(ctype), 'utf8')
writeFileSync(join(DEST, 'start2.json'), JSON.stringify(start2), 'utf8')
console.log('\n写入完成。')
