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

  // round3 这里曾有一条"commit 为 null 时诚实标注 unknown"的用例。commit
  // 参数类型是 `string`（不是 `string | null`）：sync-i18n.mjs 调用
  // buildThirdPartyNotice() 时，commit 已经保证是 `git rev-parse HEAD`
  // 解析出的真实字符串（解析不到就已经在更早的地方 exit(1)），这个函数
  // 不需要再兼容 null 分支。

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
// 真的把 THIRD_PARTY_NOTICES 写到了两个约定的位置，且两处内容逐字节相同、
// 都带着 MIT 的版权行与来源 URL。不再断言两处与 public/data/i18n/_meta.json
// 记录的 commit 一致——那条断言验证的是"生成时 commit 记录得对不对"，跟
// checkKc3License 一起被移出了 sync-i18n.mjs（commit 现在是记录性质、未
// 核验的值，见 sync-i18n.mjs 与 thirdPartyNotice.mjs 里 commit 相关的注释）。
describe('THIRD_PARTY_NOTICES（仓库产出物回归校验）', () => {
  const rootNotice = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES'), 'utf8')
  const i18nNotice = readFileSync(join(ROOT, 'public', 'data', 'i18n', 'THIRD_PARTY_NOTICES'), 'utf8')

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
