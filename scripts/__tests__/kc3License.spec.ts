import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkKc3License } from '../kc3License.mjs'

// 真实的 KC3Kai/kc3-translations LICENSE 全文（本仓库 THIRD_PARTY_NOTICES
// 转录的正是这一份），去 BOM + trimEnd，与 sync-i18n.mjs 调用 checkKc3License
// 之前做的归一化完全一致。EXPECTED_SHA256（scripts/kc3License.mjs）就是
// 这份文本的哈希，所以下面第一条用例断言它必须通过——这份测试本身也钉住了
// "vendor clone 里的 LICENSE 与代码里钉死的哈希始终一致"这件事，vendor
// clone 换了新版本而没有跟着更新 EXPECTED_SHA256，这里就会先红。
const KC3_LICENSE_PATH = join(__dirname, '..', '..', '..', 'vendor', 'kc3-translations', 'LICENSE')
const realLicenseText = readFileSync(KC3_LICENSE_PATH, 'utf8').replace(/^﻿/, '').trimEnd()

describe('checkKc3License', () => {
  it('真实的 KC3 LICENSE 全文（vendor clone 里实际那份）通过校验', () => {
    expect(checkKc3License(realLicenseText)).toEqual({ ok: true })
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
  // "哈希不匹配"，那是留给下一个人的陷阱（本轮修复的任务原文明确点出这一点）。
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
