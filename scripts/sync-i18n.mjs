#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { buildShipTranslator, deriveCtypeName } from './kc3Names.mjs'
import { validate } from './syncI18nValidate.mjs'
import { buildThirdPartyNotice } from './thirdPartyNotice.mjs'
import { checkKc3License } from './kc3License.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'public', 'data')
const OUT = join(DATA, 'i18n')
const KC3_SOURCE_URL = 'https://github.com/KC3Kai/kc3-translations'

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
 *  出处无关，不受下面 kc3Load()/kc3LoadText() 的任何约束。 */
const load = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''))

// ---------------------------------------------------------------------------
// 出处校验（round4 Fix 4）：commit 绑定到哪个仓库、这个仓库是不是真的
// KC3Kai/kc3-translations、下面实际读到的内容是不是恰好等于这个 commit
// 里的内容——三件事必须在读取任何一份 KC3 数据之前全部确认，理由与紧接着
// 的 LICENSE 校验一样：产出的 _meta.json / THIRD_PARTY_NOTICES 会把这里
// 核实的结论当作事实写下来，事后（比如靠 validate() 报错）发现不了"事实"
// 本身就是错的这件事。
// ---------------------------------------------------------------------------

let kc3Real
try {
  kc3Real = realpathSync(resolve(KC3_ARG))
} catch {
  console.error(`${KC3_ARG} 不存在或不可读`)
  process.exit(1)
}

// `git -C <dir> rev-parse --show-toplevel`：<dir> 不是 git 仓库的根目录、
// 但位于某个外层仓库内部时，git 会一路向上找到那个外层仓库，返回外层
// 仓库的根目录——不会因为"这不是 KC3 自己的仓库"而报错。上一版直接拿
// `git -C KC3 rev-parse HEAD` 的结果当"KC3 clone 的 commit"：如果 KC3
// 目录本身不是独立的 git 仓库、只是恰好被某个更大的仓库（比如整个
// vendor/、或用户的 dotfiles 仓库）包含了进去，这里记的其实是那个外层
// 仓库当前 checkout 到的 commit，与 KC3 数据完全无关——出处记录会绑定到
// 错误的仓库，且不会有任何报错提示（`git -C` 与 `rev-parse HEAD` 都能
// 正常跑通，看不出问题）。这里显式核实 `--show-toplevel` 解出来的仓库
// 根目录就是调用方给的这个目录本身，不是它的某个外层仓库。
let toplevel
try {
  toplevel = execFileSync('git', ['-C', kc3Real, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
} catch {
  console.error(`${KC3_ARG}（解析为 ${kc3Real}）不是 git 仓库，或 git 不可用`)
  console.error('出处记录（_meta.json / THIRD_PARTY_NOTICES）必须能指名一个确切、且绑定到正确仓库的')
  console.error('commit——无法解析出 commit 时不再放行，换一份真正的 git clone 后重试。')
  process.exit(1)
}
if (realpathSync(toplevel) !== kc3Real) {
  console.error(`${KC3_ARG}（解析为 ${kc3Real}）不是一个 git 仓库的根目录：`)
  console.error(`它位于另一个（外层）仓库内部，那个仓库的根目录是 ${toplevel}。`)
  console.error('继续下去会把外层仓库当前 checkout 到的 commit 误记成这份 KC3 数据的出处——')
  console.error('那个 commit 描述的是外层仓库的状态，与这份 KC3 数据本身无关。')
  console.error('把 --kc3 直接指向 KC3Kai/kc3-translations 自己的 clone 根目录（它自己是一个独立的')
  console.error('git 仓库，不要嵌在别的仓库里面），或者把这份 KC3 clone 挪到不属于任何外层仓库的位置。')
  process.exit(1)
}

const commit = execFileSync('git', ['-C', kc3Real, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

// 出处记录不仅要指名一个 commit，还要指名"这是哪个仓库"——commit hash
// 本身不携带这个信息，只核实它能被 rev-parse 解析出来，不核实这个仓库
// 到底是不是 KC3Kai/kc3-translations 本身（可能是它的 fork、改了名字的
// 仓库，或本地临时改过 remote 指向别处），THIRD_PARTY_NOTICES 会声称数据
// 来自 KC3Kai/kc3-translations，但实际读到的可能是别的仓库的内容。
// SSH（git@github.com:OWNER/REPO(.git)?）与 HTTPS
// （https://github.com/OWNER/REPO(.git)?）都是合法、常见的 clone 方式，
// 统一规范化成 host/owner/repo 再比较，不能只认其中一种写法。
function normalizeGitRemote(url) {
  if (!url) return null
  const m = /^(?:https?:\/\/|git@)([^/:]+)[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(url.trim())
  if (!m) return null
  return `${m[1].toLowerCase()}/${m[2].toLowerCase().replace(/\.git$/i, '')}`
}
let originUrl = null
try {
  originUrl = execFileSync('git', ['-C', kc3Real, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim()
} catch {
  // 没配 origin 远程（或叫别的名字）——下面统一按"核实不到"报错，不单独区分。
}
if (normalizeGitRemote(originUrl) !== normalizeGitRemote(KC3_SOURCE_URL)) {
  console.error(`${kc3Real} 的 origin 远程地址（${originUrl ?? '未配置'}）核实不到指向 ${KC3_SOURCE_URL}`)
  console.error('THIRD_PARTY_NOTICES / _meta.json 会声称这批数据来自 KC3Kai/kc3-translations——')
  console.error('这份 clone 的 origin 对不上，可能是它的 fork、改了名字的仓库，或本地临时改过 remote，')
  console.error('拒绝在核实不到来源仓库的情况下继续同步。确认这确实是 KC3Kai/kc3-translations 官方')
  console.error('仓库的 clone 后，用 git remote set-url origin 改回来，或换一份指向官方仓库的 clone。')
  process.exit(1)
}

// 下面所有 KC3 数据都改成从 `commit` 指向的 git blob 读（kc3Load()/
// kc3LoadText()），不再读工作区文件——"工作区是否干净"因此不再影响"读到
// 的内容"是否等于"记录的 commit"：两者天然绑定在同一个 commit 上，不存在
// 这次修复之前那种"先单独查一次 status，再分两步读工作区文件，两次读取
// 之间落地的改动两头都管不到"的竞态窗口（status 通过之后、真正读文件
// 之前，工作区仍可能被改动；blob 读取没有这个"之后再读一次"的步骤）。
// 这里仍然保留这条检查，但理由变了：不再是"防止出处记录说谎"（blob 读取
// 已经从根上保证了这一点），而是提醒用户——这份 clone 里任何还没提交的
// 改动都会被这次同步无声地忽略（只读 HEAD 指向的内容，不读工作区），
// 不是"已经生效但记录漏标"；如果用户是想验证本地改动的效果，需要先提交
// 它们，而不是指望同步会读到工作区里的未提交内容。
const dirtyStatus = execFileSync('git', ['-C', kc3Real, 'status', '--porcelain'], { encoding: 'utf8' })
if (dirtyStatus.trim() !== '') {
  console.error(`${kc3Real} 工作区不干净（有未提交的改动）：`)
  console.error(dirtyStatus.trimEnd())
  console.error('')
  console.error('这次同步只读 HEAD 指向的内容（不读工作区文件），上面这些未提交的改动不会生效——')
  console.error(`产出数据仍然只反映 commit ${commit} 的内容。如果这些改动就是你想同步的内容，`)
  console.error('先在 KC3 clone 里 git commit / git stash 之外的方式提交它们，再重试。')
  process.exit(1)
}

/** 从 `commit` 指向的 git blob 读取 KC3 clone 里的文件内容，而不是读工作区——
 *  这样"实际读到的内容"与"记录进 _meta.json/THIRD_PARTY_NOTICES 的 commit"
 *  永远是同一个来源，不需要另外证明两者一致（见上面的出处校验说明）。
 *  relPath 是相对 kc3Real 仓库根的路径（正斜杠，git 的写法），不是文件系统
 *  意义上拼接的绝对路径。 */
function kc3ReadBlob(relPath) {
  try {
    return execFileSync('git', ['-C', kc3Real, 'show', `${commit}:${relPath}`], { encoding: 'utf8' })
  } catch (e) {
    console.error(`无法从 ${kc3Real} 的 commit ${commit} 读取 ${relPath}：`)
    console.error(String(e.message ?? e))
    process.exit(1)
  }
}
/** KC3 的 json 有的带 BOM，统一剥掉 */
const kc3Load = (relPath) => JSON.parse(kc3ReadBlob(relPath).replace(/^﻿/, ''))
/** 剥 BOM 但不当 JSON 解析——LICENSE 是纯文本 */
const kc3LoadText = (relPath) => kc3ReadBlob(relPath).replace(/^﻿/, '')

// 产出的 items/ships/ctype.json 是 KC3Kai/kc3-translations（MIT）的衍生数据，
// MIT 要求"版权声明与许可声明须保留在软件的所有副本或实质性部分中"——这份
// 校验必须在读取任何 KC3 翻译数据（items/ships/ctype.json 等）**之前**做
// （P1：THIRD_PARTY_NOTICES 缺失或与数据来源的协议脱节，比任何一项翻译
// 校验都更早地让整次同步失去意义），所以紧跟在上面的仓库/commit/remote
// 核验之后——克隆里没有 LICENSE，就没有可以合法引用这批数据、也没有可以
// 如实转录的协议文本，此时同步任何数据都是在无声地丢弃 MIT 的署名/协议
// 留存条款，必须直接拒绝，不能等到 validate() 那一步才发现。
const kc3LicenseText = kc3LoadText('LICENSE').trimEnd()

// LICENSE 存在不等于内容对：一个被截断成空文件、误放了别的许可证全文、
// 版权行被换成别的项目名、或随手写的占位符，都能让"文件存在"这一步通过
// 检查，但下面 buildThirdPartyNotice() 会把这份文本原样转录成"MIT 许可
// 声明"——转录的前提是这份文本真的是、完整的是 KC3 的 MIT 声明，否则就是
// 在合法地声明一件不存在的事。
//
// 之前这里只做过标题行 + 一句授权语句的宽松特征匹配——两个都是极短锚点，
// 验证的是"文件里出现过这两句话"，不是"这份文本真的是 KC3 的完整 MIT
// 声明"：把版权行换成 `Unrelated Project`、或把文件截断到只剩这两句话，
// 都能让旧校验原样通过，但转录出去的内容要么不属于 KC3、要么不完整
// （MIT 要求版权声明与许可声明须保留在软件的所有副本或实质性部分中，被
// 截断的声明不满足这个要求）。checkKc3License()（scripts/kc3License.mjs）
// 把上次评审通过的 KC3 LICENSE 全文的哈希钉死作为主校验，哈希不匹配时再
// 退回检查版权归属行与 MIT 的几处实质性条款是否都还在——具体理由，以及
// "哈希不匹配、但看起来仍是 KC3 合法更新过的 MIT 声明"这类情况该如何
// 报错，见该文件顶部注释。
const licenseCheck = checkKc3License(kc3LicenseText)
if (!licenseCheck.ok) {
  console.error(`${kc3Real} 的 commit ${commit} 里存在 LICENSE，但校验未通过：`)
  console.error(licenseCheck.reason)
  console.error('拒绝继续同步（不产出一份声明内容对不上实际许可证的转录）。')
  process.exit(1)
}

console.log(`数据源：KC3Kai/kc3-translations（MIT）commit ${commit}`)

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

// 仓库身份/commit/remote/干净工作区的核验，以及全部 KC3 数据的读取方式
// （从 commit 指向的 git blob 读，不读工作区），都已经在文件顶部（写任何
// 文件之前）做完——`commit` 是那段代码留下的同一个变量，下面直接用。

const errors = validate(produced, { refEquipIds, playerShipIds, refCtypeIds, ctypeZhHans })

if (errors.length) {
  console.error('\n校验失败，未写入任何文件：')
  errors.forEach((e) => console.error('  ' + e))
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 落盘（round4 Fix 7）。
//
// 之前这里是边算边写：mkdirSync/writeFileSync 按"四语言的 items/ships/
// ctype.json → _meta.json → 两份 THIRD_PARTY_NOTICES"的顺序逐个调用，
// 任何一次 writeFileSync 失败（比如最后写 THIRD_PARTY_NOTICES 时目标目录
// 只读/权限不够）都会让"已经写完的文件"停在磁盘上，进程以非零码退出——
// 磁盘上留下一棵新旧版本混杂、却看起来完整（每个文件都存在，没有明显的
// "缺文件"迹象）的半成品树：四语言的 items/ships/ctype.json 已经是这次
// 同步的新内容，两份 THIRD_PARTY_NOTICES 却还是上一次同步遗留的旧内容，
// 新数据实际对应的 commit 与旧 notice 上署的 commit 对不上，但没有任何
// 报错以外的迹象能看出这一点。
//
// 改成 atomicWriteAll() 的三阶段（函数定义见下，理由与残余风险的说明都
// 写在那里，这里不重复）：先把全部目标内容各自写进同目录下的一个临时
// 文件（这一步本身就是"这个位置能不能写"的探测——写不进去就是写不进去，
// 不需要另外一步"先探测再写"），全部写成功之后才统一 rename 到真正的
// 目标路径。这样"探测/验证阶段失败"（这次真实复现过的场景：目标目录
// 只读）会在触碰任何一个真正目标之前就整体中止，磁盘上没有任何变化。
// ---------------------------------------------------------------------------

/**
 * 把多个「目标路径 → 内容」原子地落盘。
 *
 * 三阶段：
 * 1. 在每个目标文件的同一个目录下写一个内容随机命名（`randomUUID()`）的
 *    临时文件——写的是这次同步算好的最终内容，不是占位符；文件名带随机
 *    后缀是为了避免两次并发的 sync-i18n 调用互相覆盖对方的临时文件（同一
 *    目标路径的两次运行不会撞到同一个临时文件名）。
 * 2. 只要有一个临时文件写失败（目标目录只读、权限不够、磁盘满……），
 *    立刻清理掉这次调用已经写出的全部临时文件并整体中止——在这一步
 *    完成之前，没有任何一个真正的目标路径被改动过，磁盘上的既有内容
 *    原样保留。
 * 3. 全部临时文件都写成功之后，才把每个临时文件 rename 到它的真正目标
 *    路径。同一目录内的 rename 在 POSIX 文件系统上是原子的（不会出现
 *    "目标文件内容写了一半"这种单文件级半成品；rename 替换已存在的目标
 *    文件靠的是目录本身的写权限，不看被替换的目标文件自己的权限位——
 *    这也是为什么第 2 步用"能不能在同目录下新建一个临时文件"来验证可写
 *    性，而不是看目标文件本身的权限）。
 *
 * ⚠️ 没有覆盖到的残余窗口：第 3 步对"多个文件"整体而言不是操作系统级别
 * 保证的原子操作——全部临时文件都验证/写入成功之后、全部 rename 真正
 * 执行完之前，如果进程在这几个 rename 中间被 kill -9、或者机器在这个
 * 窗口内掉电，仍然可能只换完一部分文件。这个窗口极窄（剩下的只是若干次
 * 单目录内的 rename 系统调用，不再有磁盘 I/O 等待），且不是这次真实
 * 复现过的失败模式（真实复现的是"目标目录只读"，第 2 步已经处理），
 * 但如实记在这里，不把"验证 + 分别 rename"包装成对所有故障模式都成立
 * 的"完全原子"。
 *
 * @param {{ path: string, content: string }[]} files
 */
function atomicWriteAll(files) {
  const staged = []
  try {
    for (const { path, content } of files) {
      const tmpPath = `${path}.sync-i18n.tmp-${randomUUID()}`
      writeFileSync(tmpPath, content, 'utf8')
      staged.push({ tmpPath, path })
    }
  } catch (e) {
    for (const { tmpPath } of staged) {
      try { rmSync(tmpPath, { force: true }) } catch { /* 尽力清理，不影响下面的报错退出 */ }
    }
    console.error('写入临时文件失败，未改动任何目标文件：')
    console.error(String(e.message ?? e))
    process.exit(1)
  }

  const done = []
  try {
    for (const { tmpPath, path } of staged) {
      renameSync(tmpPath, path)
      done.push(path)
    }
  } catch (e) {
    console.error(
      `rename 到目标路径失败——已经成功替换 ${done.length}/${staged.length} 个文件` +
      '（这是上面 atomicWriteAll 顶部注释里说明过的残余窗口，不是本工具能覆盖的跨文件整体原子性）：',
    )
    console.error(String(e.message ?? e))
    console.error('已成功替换：')
    done.forEach((p) => console.error(`  - ${p}`))
    console.error('未能替换（对应的临时文件可能仍留在同目录下，文件名以 .sync-i18n.tmp- 开头，可手动清理）：')
    staged.filter((s) => !done.includes(s.path)).forEach((s) => console.error(`  - ${s.path}`))
    process.exit(1)
  }
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
// commitResolved 字段（曾经用来区分"commit 是 null 还是真值"）随 round4
// Fix 4 一起删掉了：commit 现在是同步能否继续的硬性前提，走到这里时必然
// 已经是一个真实的 commit hash，这个字段会恒为 true，留着就是一个不再
// 传达任何信息、只会让读的人多问一句"这还有存在的必要吗"的死字段。
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
// 也得带着它，见本文件顶部读 LICENSE 那段注释。两份内容完全相同（都是
// buildThirdPartyNotice() 的输出，同一个 commit/licenseText）：
// - 仓库根：随源码走读的人最先看到的地方，紧挨着本仓库自己的 GPLv3 LICENSE。
// - public/data/i18n/：随生产构建一起进 dist/data/i18n/（vite 原样拷贝
//   public/ 下的文件，不需要额外配置），挨着它描述的那批 JSON 数据本身——
//   只有这一份能保证"数据"和"数据的许可声明"在任何裁剪/分发场景下都不分家。
const notice = buildThirdPartyNotice({ source: KC3_SOURCE_URL, commit, licenseText: kc3LicenseText })
filesToWrite.push({ path: join(ROOT, 'THIRD_PARTY_NOTICES'), content: notice })
filesToWrite.push({ path: join(OUT, 'THIRD_PARTY_NOTICES'), content: notice })

atomicWriteAll(filesToWrite)

console.log('校验通过，THIRD_PARTY_NOTICES 已更新。')
