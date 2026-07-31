import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildThirdPartyNotice } from '../thirdPartyNotice.mjs'

const ROOT = join(__dirname, '..', '..')

describe('buildThirdPartyNotice（纯函数）', () => {
  it('内容包含项目名、来源 URL、commit、MIT 版权行，且原样转录 licenseText', () => {
    const notice = buildThirdPartyNotice({
      source: 'https://github.com/KC3Kai/kc3-translations',
      commit: 'deadbeef00112233',
      licenseText: 'The MIT License (MIT)\n\nCopyright (c) 2015-2021 KC3改\n\n...',
    })
    expect(notice).toContain('KC3Kai/kc3-translations')
    expect(notice).toContain('https://github.com/KC3Kai/kc3-translations')
    expect(notice).toContain('deadbeef00112233')
    expect(notice).toContain('MIT')
    expect(notice).toContain('Copyright (c) 2015-2021 KC3改')
    // licenseText 原样出现，不是转述或裁剪
    expect(notice).toContain('The MIT License (MIT)\n\nCopyright (c) 2015-2021 KC3改\n\n...')
  })

  // round3 这里曾有一条"commit 为 null 时诚实标注 unknown"的用例——round4
  // Fix 4 把"能否解析出确切、且绑定到正确仓库的 commit"提升成了
  // sync-i18n.mjs 里同步能否继续的硬性前提，调用方不会再传 null 进来（见
  // buildThirdPartyNotice 的 JSDoc），commit 参数类型也从 `string | null`
  // 收紧成了 `string`。继续留着这条用例、或留着 commit: null 这个类型分支，
  // 会是"类型/测试描述了一种代码已经不会再进入的状态"——本轮要清理的
  // 正是这一类问题，删掉而不是继续通过它。

  it('是输入的纯函数：相同输入两次调用逐字节相同（不含时间戳等易变内容）', () => {
    const args = {
      source: 'https://github.com/KC3Kai/kc3-translations',
      commit: 'abc123',
      licenseText: 'MIT license text',
    }
    expect(buildThirdPartyNotice(args)).toBe(buildThirdPartyNotice(args))
  })
})

// 下面这组不是纯函数测试，是对仓库当前实际产出的回归校验：断言 sync-i18n.mjs
// 真的把 THIRD_PARTY_NOTICES 写到了两个约定的位置，且两处都指名与
// public/data/i18n/_meta.json 相同的 commit —— 一份记录数据出处的通知文件，
// 如果能悄悄漂移到与它描述的数据不是同一个 commit，就比压根没有这份通知更
// 糟糕（读的人会相信一个错误的出处）。这条测试就是防止这种漂移的回归网。
describe('THIRD_PARTY_NOTICES（仓库产出物回归校验）', () => {
  const meta = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'i18n', '_meta.json'), 'utf8')) as {
    commit: string
  }
  const rootNotice = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES'), 'utf8')
  const i18nNotice = readFileSync(join(ROOT, 'public', 'data', 'i18n', 'THIRD_PARTY_NOTICES'), 'utf8')

  it('仓库根目录存在 THIRD_PARTY_NOTICES，且记录了与 _meta.json 相同的 commit', () => {
    // commit 恒为真值：round4 Fix 4 之后 sync-i18n.mjs 把"能否解析出确切、
    // 且绑定到正确仓库的 commit"做成了同步能否继续的硬性前提，无法解析时
    // 在写任何文件之前就已经 exit(1)，_meta.json 不会带着一个 null/缺失的
    // commit 被写出来。
    expect(meta.commit).toBeTruthy()
    expect(rootNotice).toContain(meta.commit)
  })

  it('public/data/i18n/ 下也有一份 THIRD_PARTY_NOTICES（随构建产物一起分发），记录同一个 commit', () => {
    expect(i18nNotice).toContain(meta.commit)
  })

  it('两处 THIRD_PARTY_NOTICES 内容逐字节相同——不是两份各自维护、容易漂移的文本', () => {
    expect(i18nNotice).toBe(rootNotice)
  })

  it('两处都包含 MIT 全文的版权行与来源 URL', () => {
    for (const notice of [rootNotice, i18nNotice]) {
      expect(notice).toMatch(/Copyright \(c\) \d{4}(-\d{4})? KC3改/)
      expect(notice).toContain('https://github.com/KC3Kai/kc3-translations')
      expect(notice).toContain('MIT')
    }
  })
})
