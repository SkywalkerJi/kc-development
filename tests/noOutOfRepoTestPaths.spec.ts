import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

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
