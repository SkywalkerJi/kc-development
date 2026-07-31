import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkKc3License } from '../kc3License.mjs'

// checkKc3License() 的两层校验（哈希优先，锚点兜底）本来是给 sync-i18n.mjs 用的：
// 只有在有人真的把 KC3Kai/kc3-translations clone 到本地、要重新生成
// THIRD_PARTY_NOTICES 时才会跑到那段代码，那时候本地确实有一份 vendor clone
// 可读，checkKc3License() 校验的是"clone 里的 LICENSE 值不值得被转录"。
//
// 这份测试文件校验的是另一件事：checkKc3License() 这个纯函数本身的行为对不
// 对——这不需要 vendor clone。之前的版本用 __dirname 向上跳三级、再拼上
// vendor/kc3-translations/LICENSE 去读，这条路径整个跳出了仓库根目录：
// vendor/ 只存在于当初开发这个分支的机器
// 上（这台机器的 kc-development 的上一级目录），没人会把第三方项目的完整
// 克隆提交进仓库。这在"恰好装了这份 clone"的机器上是绿的，在任何全新
// checkout（包括 CI）里都会以 ENOENT 崩溃——是一次"看起来测试了真实数据，
// 实际上只测试了这台机器"的假绿，且不会因为在本地多跑几次 `pnpm test`
// 而暴露。
//
// 修好的做法：改成读仓库真正提交、真正随构建产物分发的 THIRD_PARTY_NOTICES
// （仓库根 + public/data/i18n/，sync-i18n.mjs 保证两份内容逐字节相同），从中
// 抠出许可证正文。这是任何 checkout（含 CI）里都存在的文件，而且是"实际会
// 发布出去的东西"，比 vendor clone 更贴近这份测试真正想守护的目标：
// "已提交、已发布的许可声明是不是一份完整、未被篡改的 KC3 MIT 声明"。
//
// 之所以不干脆跳过"哈希必须匹配"这条断言、只留锚点检查：checkKc3License()
// 命中哈希就直接短路返回 ok:true，锚点分支根本不会跑——如果这里只做"锚点
// 都在就算过"，既测不到哈希短路这条最强的路径，也没有真正验证"已提交的
// 文本恰好等于上次评审通过、被钉死在 EXPECTED_SHA256 里的那份"。保留哈希
// 断言是刻意选择：一旦 KC3 合法更新了 LICENSE（换年份/微调措辞）导致这里
// 变红，checkKc3License() 返回的 reason 里已经写清楚了下一步——对比 diff、
// 确认改动只是版本更新、把 EXPECTED_SHA256 改成新哈希——失败信息本身就是
// 给维护者的操作指南，不是一句甩锅的"哈希不匹配"就完事，所以这不是一个
// "钉死了却不知道出了什么事该怎么办"的陷阱。
const ROOT = join(__dirname, '..', '..')
const ROOT_NOTICE_PATH = join(ROOT, 'THIRD_PARTY_NOTICES')
const PUBLIC_NOTICE_PATH = join(ROOT, 'public', 'data', 'i18n', 'THIRD_PARTY_NOTICES')

const SEPARATOR_RE = /^-{10,}$/

/**
 * 从 buildThirdPartyNotice()（scripts/thirdPartyNotice.mjs）生成的
 * THIRD_PARTY_NOTICES 里抠出被两条分隔线夹住的 LICENSE 正文。
 */
function extractLicenseBody(noticeText: string): string {
  const lines = noticeText.split('\n')
  const separatorLines: number[] = []
  lines.forEach((line, i) => {
    if (SEPARATOR_RE.test(line)) separatorLines.push(i)
  })
  if (separatorLines.length !== 2) {
    throw new Error(
      `THIRD_PARTY_NOTICES 里应该恰好有两条分隔线夹住 LICENSE 正文，实际找到 ${separatorLines.length} 条——格式是不是变了？`,
    )
  }
  const [start, end] = separatorLines
  return lines.slice(start + 1, end).join('\n').trimEnd()
}

const rootNoticeText = readFileSync(ROOT_NOTICE_PATH, 'utf8').replace(/^﻿/, '')
const publicNoticeText = readFileSync(PUBLIC_NOTICE_PATH, 'utf8').replace(/^﻿/, '')
const realLicenseText = extractLicenseBody(rootNoticeText)

describe('已提交的 THIRD_PARTY_NOTICES（构建产物本身，不是 vendor clone）', () => {
  it('仓库根与 public/data/i18n/ 两份 THIRD_PARTY_NOTICES 逐字节相同', () => {
    // sync-i18n.mjs 把同一个 buildThirdPartyNotice() 的输出写去两个位置
    // （见该文件顶部注释）：仓库根一份给读源码的人看，public/data/i18n/
    // 一份随生产构建进 dist/，保证"数据"和"数据的许可声明"不分家。这里
    // 直接比整份文件，比只比对抠出来的 LICENSE 正文更强也更简单——顺带
    // 也覆盖了两份文件里 commit/source 那几行是否一致。
    expect(publicNoticeText).toEqual(rootNoticeText)
  })

  it('LICENSE 正文包含 KC3 的版权归属行', () => {
    expect(realLicenseText).toMatch(/Copyright \(c\) \d{4}(-\d{4})?\s+KC3改/)
  })

  it('LICENSE 正文包含 MIT 许可证的实质性条款（标题/授权语句/保留条款/免责条款）', () => {
    expect(realLicenseText).toMatch(/\bMIT License\b/i)
    expect(realLicenseText).toMatch(/Permission is hereby granted,\s*free of charge/i)
    expect(realLicenseText).toMatch(/included in all\s*copies or substantial portions of the Software/i)
    expect(realLicenseText).toMatch(/THE SOFTWARE IS PROVIDED "AS IS"/i)
  })
})

describe('checkKc3License', () => {
  it('已提交的 THIRD_PARTY_NOTICES 里的 LICENSE 正文通过校验', () => {
    const result = checkKc3License(realLicenseText)
    // 失败时把 reason 打进断言消息——哈希对不上钉死值时 reason 里写的正是
    // "对比 diff、确认是合法更新、把 EXPECTED_SHA256 改成多少"，这条指引
    // 不该被 toEqual() 的对象 diff 输出截断或埋没。
    expect(result.ok, result.ok ? undefined : result.reason).toBe(true)
  })

  it('逐字节相同（重新构造字符串）也通过——不是引用比较', () => {
    expect(checkKc3License(`${realLicenseText}`)).toEqual({ ok: true })
  })

  // 复现 Fix 3 报告的场景：把版权行换成一个不相关的项目名，标题行与授权
  // 语句这两个旧版校验唯一看的锚点原样保留——旧版本会在这里放行，新版本
  // 必须拒绝，因为版权归属（谁的许可证）本身对不上了。
  it('版权行被替换成不相关的项目名时拒绝，且报出的原因指名"版权归属行"', () => {
    const tampered = realLicenseText.replace('Copyright (c) 2015-2021 KC3改', 'Unrelated Project')
    const result = checkKc3License(tampered)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toMatch(/版权归属行/)
      // 不能被误判成"KC3 合法更新了许可证"这条分支——版权行都没了，不是
      // "文本还是那份 MIT 声明，只是哈希对不上"。
      expect(result.reason).not.toMatch(/合法更新/)
    }
  })

  // 复现 Fix 3 报告的另一个场景：文件被截断到只剩标题行 + 一句授权语句，
  // 丢掉了保留条款与免责条款——旧版本的两个锚点都还在，会放行；新版本必须
  // 因为"不完整"而拒绝。
  it('文件被截断到只剩标题行与一句授权语句时拒绝，且报出具体缺了哪几条条款', () => {
    const truncated = 'The MIT License (MIT)\n\nPermission is hereby granted, free of charge, to any person...'
    const result = checkKc3License(truncated)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toMatch(/版权归属行/)
      expect(result.reason).toMatch(/保留条款/)
      expect(result.reason).toMatch(/免责条款/)
    }
  })

  it('空字符串（对应旧版 existsSync 通过但内容为空的场景）拒绝', () => {
    const result = checkKc3License('')
    expect(result.ok).toBe(false)
  })

  it('完全不相关的许可证全文（如 Apache-2.0 的标志性文本）拒绝', () => {
    const apache = 'Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/\n\nTERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION'
    const result = checkKc3License(apache)
    expect(result.ok).toBe(false)
  })

  // 「哈希不匹配，但看起来仍是 KC3 的完整 MIT 声明」这条分支：模拟 KC3
  // 合法把版权年份从 2015-2021 改成了 2015-2026——版权归属行仍指名 KC3改、
  // 四类实质性条款都在，只是整体哈希对不上钉死的值。这种情况不能被当成
  // "不是 MIT 声明"一样生硬地拒绝且不给出路：失败原因必须清楚地告诉维护者
  // 这可能是合法更新，以及具体该怎么核实、改哪个常量——不能只甩一句
  // "哈希不匹配"，那是留给下一个人的陷阱。
  it('哈希对不上，但版权归属与实质性条款都还在时，原因说明"可能是合法更新"并指出下一步', () => {
    const legitUpdate = realLicenseText.replace('2015-2021', '2015-2026')
    const result = checkKc3License(legitUpdate)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toMatch(/合法更新/)
      expect(result.reason).toMatch(/EXPECTED_SHA256/)
      // 不能报出"缺少版权归属行"这类"看起来像是被篡改"的措辞——年份不同
      // 但仍然指名 KC3改，版权归属行本身是匹配的。
      expect(result.reason).not.toMatch(/缺少下列 MIT 许可证的/)
    }
  })
})
