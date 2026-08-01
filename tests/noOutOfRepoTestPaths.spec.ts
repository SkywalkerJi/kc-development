import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
// 复用仓库自己那份剥 JSON 注释的实现，不在这里手写第二份
//（tsconfig 允许 // 注释，JSON.parse 不允许）。
import { stripJsonComments } from '../scripts/stripJsonComments.mjs'

/**
 * 补的是这次事故本身暴露的缺口：scripts/__tests__/kc3License.spec.ts 曾经用
 * __dirname 向上跳三级、再拼上 vendor/kc3-translations/LICENSE 去读一个
 * 仓库外的路径——vendor/ 只存在于当初开发那条分支的机器上（这台
 * 机器的 kc-development 的上一级目录）。这在那台机器上跑 `pnpm test` 是
 * 绿的，在任何其它 checkout（包括 CI）里都会 ENOENT。本地 `pnpm test`
 * 通过与否完全区分不出"代码是对的"和"这台机器恰好多出一个文件"——这正是
 * 这个问题能一路绿到 main 的原因，也是它值得单独设一道检查的原因：不靠
 * 人在 review 时肉眼扫描每一处 `join(__dirname, …)`，而是每次 `pnpm test`
 * 自动跑。
 *
 * 做法：静态扫描所有测试文件源码，找出全部 `join(__dirname, ……)` 调用
 * （只处理字符串字面量参数——目前仓库里出现的用法全部是字面量；参数里混了
 * 变量的调用会被跳过，不在这层覆盖范围内，见下面第二个 it 里的说明），
 * 按字面量拼出实际会解析到的绝对路径，断言它不会跑出仓库根目录。这是纯
 * 字符串层面的静态检查，不依赖任何机器专属的文件是否存在，CI 和任何一台
 * 开发机上应该给出完全相同的结果——这也是它能防住"在这台机器上是绿的"
 * 这类假绿的原因。
 *
 * 已知的覆盖盲区（不是这里要解决的问题，只是诚实地说明范围）：不处理
 * `resolve(__dirname, …)`、`path.join` 以外的拼路径方式，也不处理参数里
 * 带变量/模板字符串的调用。目前仓库里所有测试文件都只用
 * `join(__dirname, '字面量', …)` 这一种写法（见下面「扫描本身没有失效」
 * 那条断言），如果以后出现别的拼路径写法，这道检查需要跟着扩展。
 */
const ROOT = resolve(join(__dirname, '..'))
const SCAN_DIRS = [join(ROOT, 'scripts'), join(ROOT, 'src'), join(ROOT, 'tests')]

function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...listTsFiles(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

const JOIN_DIRNAME_RE = /join\(\s*__dirname\s*((?:,\s*(?:'[^']*'|"[^"]*")\s*)*)\)/g
const STRING_LITERAL_RE = /(['"])((?:(?!\1).)*)\1/g

interface CallSite {
  file: string
  segments: string[]
  resolved: string
}

function findCallSites(): CallSite[] {
  const sites: CallSite[] = []
  for (const file of SCAN_DIRS.flatMap(listTsFiles)) {
    const content = readFileSync(file, 'utf8')
    JOIN_DIRNAME_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = JOIN_DIRNAME_RE.exec(content))) {
      const segments = [...match[1].matchAll(STRING_LITERAL_RE)].map((m) => m[2])
      sites.push({ file, segments, resolved: resolve(dirname(file), ...segments) })
    }
  }
  return sites
}

describe('测试文件里 join(__dirname, …) 解析到的路径必须留在仓库内', () => {
  const sites = findCallSites()

  it('扫描本身没有失效（找到的 join(__dirname, …) 调用点数量在合理范围内）', () => {
    // 这条断言守护的是扫描逻辑本身，不是仓库内容：如果这个数字掉到 0（或
    // 掉得很低），最可能的解释不是"仓库里已经没有跑出仓库外的路径了"，而是
    // 上面的正则/目录过滤没匹配上——那时候下面那条"路径必须留在仓库内"的
    // 断言会因为无事可查而白白通过，是这次事故本身的假绿模式在检查代码里
    // 重演一遍。
    expect(sites.length).toBeGreaterThanOrEqual(5)
  })

  it('每一个调用点解析到的路径都不跑出仓库根目录', () => {
    const offenders = sites
      .filter((s) => s.resolved !== ROOT && !s.resolved.startsWith(ROOT + '/'))
      .map((s) => `  - ${s.file.slice(ROOT.length + 1)}: join(__dirname, ${s.segments.map((seg) => `'${seg}'`).join(', ')}) → ${s.resolved}`)

    expect(offenders, `以下调用解析到了仓库根目录（${ROOT}）之外：\n${offenders.join('\n')}`).toEqual([])
  })
})

/**
 * 同一条防线的第二个洞（round5 发现 10）：上面那道检查按其顶部注释自陈的
 * 范围，只静态扫描**测试文件源码里的 `join(__dirname, …)`**，覆盖不到
 * `tsconfig*.json`。而 `tsconfig.app.json` 的 include 里躺着一条
 * `"../UI/lib"` —— 仓库外路径，全仓库没有任何 import 解析到它。
 *
 * 它当前无害纯属运气（那个目录不存在）。一旦某台机器上恰好有它：
 * `vue-tsc --build` 会把仓库外的文件一并纳入类型检查，本机 `pnpm type-check`
 * 报红而 CI 绿；反方向更隐蔽——若那份仓库外代码带的是 `.d.ts` 全局声明，
 * 本机会**通过**而 CI 报错。与 `1858e46` 修掉的是同一类缺陷。
 *
 * 覆盖 `include` / `files` / `references[].path` / `compilerOptions.paths`
 * 与 `compilerOptions.baseUrl`。**`references` 尤其不能漏**：仓库根的
 * `tsconfig.json` 是 solution-style（`"files": []`），references 是它唯一
 * 有实质内容的字段，而 `vue-tsc --build` 会去构建被引用的工程 —— 漏掉它
 * 等于这道防线在唯一真正生效的字段上是空的。
 *
 * 已声明的盲区（如实说明范围，不假装覆盖全部）：
 * - **不解析 `extends` 链**。本仓库三份 extends 里两份指向 node_modules
 *   （`@vue/tsconfig/tsconfig.dom.json`、`@tsconfig/node22/tsconfig.json`，
 *   两者都只有 compilerOptions，不引入相对路径），第三份
 *   `tsconfig.vitest.json` extends 的是**相对路径** `./tsconfig.app.json`
 *   —— 它本身就在扫描范围内，所以当前无漏；但若有人把 extends 指向仓库外
 *   一个真实存在的 tsconfig，这里抓不到。
 * - `paths` 只截通配符之前那一段来定位"根落在哪"，不处理通配符**之后**
 *   才跳出仓库的形态（如 `src/*​/../../../foo`）。
 * - 不递归子目录找 tsconfig（当前仓库根目录之外没有任何一份）。
 * - `exclude` / `outDir` 跑出仓库不影响类型检查的输入集合，不查。
 */
interface TsconfigShape {
  include?: string[]
  files?: string[]
  references?: { path: string }[]
  compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> }
}

/**
 * 读一份 tsconfig。它是 JSONC：既允许注释，**也允许尾逗号**。
 * 只剥注释是不够的 —— 一个编辑器自动补出的尾逗号会让 JSON.parse 抛
 * SyntaxError，整条用例以一句与路径检查毫无关系的报错崩掉（而 tsc 完全
 * 接受那份配置）。解析失败时也要把文件名带上，四份 tsconfig 谁出问题
 * 不该靠猜。
 */
function readTsconfig(file: string): TsconfigShape {
  const text = stripJsonComments(readFileSync(file, 'utf8')).replace(/,(\s*[}\]])/g, '$1')
  try {
    return JSON.parse(text) as TsconfigShape
  } catch (e) {
    throw new Error(`解析 ${file.slice(ROOT.length + 1)} 失败：${(e as Error).message}`)
  }
}

describe('tsconfig 的路径配置必须留在仓库内', () => {
  // JSON with comments：仓库自己的 scripts/stripJsonComments.mjs 就是干这个的，
  // 但它是 .mjs 且这里只需要极小的一部分能力，直接用它避免第二份实现。
  const configs = readdirSync(ROOT)
    .filter((f) => /^tsconfig(\..+)?\.json$/.test(f))
    .map((f) => join(ROOT, f))

  it('扫描本身没有失效（找到了 tsconfig 文件）', () => {
    // 同上一个 describe 的立场：数量掉到 0 时，下面那条断言会因无事可查而
    // 白白通过，那才是真正危险的状态。
    expect(configs.length).toBeGreaterThanOrEqual(3)
  })

  it('include / files / references / paths / baseUrl 都不跑出仓库根目录', () => {
    const offenders: string[] = []
    for (const file of configs) {
      const json = readTsconfig(file)
      const co = json.compilerOptions ?? {}
      // paths 的条目是相对 baseUrl 解析的，不是相对 tsconfig 文件所在目录
      // ——两者在设了 baseUrl 时可以差出任意层级。其余字段则是相对文件目录。
      const dir = dirname(file)
      const pathsBase = resolve(dir, co.baseUrl ?? '.')

      const entries: { value: string; from: string; base: string }[] = [
        ...(json.include ?? []).map((v) => ({ value: v, from: 'include', base: dir })),
        ...(json.files ?? []).map((v) => ({ value: v, from: 'files', base: dir })),
        ...(json.references ?? []).map((r) => ({ value: r.path, from: 'references', base: dir })),
        ...(co.baseUrl ? [{ value: co.baseUrl, from: 'baseUrl', base: dir }] : []),
        ...Object.values(co.paths ?? {}).flat().map((v) => ({ value: v, from: 'paths', base: pathsBase })),
      ]

      for (const { value, from, base } of entries) {
        // 通配符只影响匹配范围，不影响"这条路径的根落在哪"，截掉再解析
        const resolved = resolve(base, value.split('*')[0])
        if (resolved !== ROOT && !resolved.startsWith(ROOT + '/')) {
          offenders.push(`  - ${file.slice(ROOT.length + 1)} 的 ${from}: ${JSON.stringify(value)} → ${resolved}`)
        }
      }
    }
    expect(offenders, `以下 tsconfig 路径解析到了仓库根目录（${ROOT}）之外：\n${offenders.join('\n')}`).toEqual([])
  })
})
