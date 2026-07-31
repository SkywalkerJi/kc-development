/**
 * 校验 KC3Kai/kc3-translations 的 LICENSE 文件真的是 MIT 许可证全文，抽成
 * 纯函数供 sync-i18n.mjs 与测试共用——拆分理由同 syncI18nValidate.mjs /
 * thirdPartyNotice.mjs：sync-i18n.mjs 顶层直接做 argv 解析、文件读写、
 * process.exit，不适合被当模块 import。
 *
 * 本轮（round4 Fix 3）之前的版本只匹配标题行 + 一句授权语句（"Permission is
 * hereby granted, free of charge"）——两个都是极短的锚点，验证的是"文件里
 * 出现过这两句话"，不是"这份文本真的是完整、未被篡改的 KC3 MIT 声明"：
 * - 把版权行换成 `Unrelated Project`，两个锚点原样保留，旧校验照样通过，
 *   但 THIRD_PARTY_NOTICES 会转录一份不属于 KC3 的版权声明。
 * - 把文件截断到只剩这两个锚点（丢掉保留条款、免责条款、结尾的 SOFTWARE
 *   一段），旧校验一样通过，但转录出去的不是完整的 MIT 全文——MIT 要求
 *   "版权声明与许可声明须保留在软件的所有副本或实质性部分中"，一份被
 *   截断的许可声明不满足这个要求。
 *
 * 这一版换成两层校验：
 * 1. 内容哈希：把当前评审通过的 KC3 LICENSE 全文（trimEnd 之后）的 SHA-256
 *    钉死在 EXPECTED_SHA256。逐字节相同 → 直接通过，这是最强的证据——不是
 *    "看起来像"，是"确实是这一次评审看过的那份文本"。
 * 2. 哈希不匹配时，不直接拒绝：再检查版权归属行（Copyright 行指名
 *    KC3改）与几处 MIT 实质性条款（标题、授权语句、保留条款、免责条款）
 *    是否都还在。如果这些锚点全部还在，只是哈希对不上，最可能的解释是
 *    "KC3 自己合法地更新了 LICENSE 文件"（换了年份、微调了措辞），不是
 *    "这根本不是 KC3 的 MIT 声明"——这种情况下失败信息要告诉维护者具体
 *    该怎么办（对比 diff，确认后更新 EXPECTED_SHA256 这个常量），不能只甩
 *    一句"哈希对不上"就完事，那对下一个遇到这个报错的人是个陷阱。
 *    如果连锚点都对不上（版权行不是 KC3改、或缺实质性条款），说明这根本
 *    不像是 KC3 的 MIT 声明（或是被截断/替换了），按"不是 MIT 声明"报错。
 *
 * 哈希算在 `trimEnd()` 之后的文本上，不是原始字节——调用方（sync-i18n.mjs）
 * 读文件时本来就会 `loadText().trimEnd()` 再往下传，这里保持同一份归一化，
 * 不再单独处理一次；否则"文件末尾多一个换行符"这种与许可证内容毫无关系的
 * 差异，会制造出下面 ⚠️ 提到的"哈希对不上却不知道为什么"的陷阱。
 */
import { createHash } from 'node:crypto'

/**
 * 2026-07 从 KC3Kai/kc3-translations（commit 55a0d67653dec49a0a2a8fa5e90922ff8a7f1ef2）
 * 的 LICENSE 文件算出，即本仓库 THIRD_PARTY_NOTICES 里实际转录的那份文本。
 * KC3 如果合法更新了 LICENSE（换年份、微调措辞），这里会跟着报出"哈希不
 * 匹配"——按下面 checkKc3License() 返回的 reason 指引：先确认新文本仍然是
 * 真实、完整的 MIT 声明（版权行仍指名 KC3改、四类实质性条款都在），再把
 * 这个常量更新成新文本的哈希，不要绕过检查。
 */
const EXPECTED_SHA256 = 'b18fd5a430903c1745cd435c4a038e82628510944a6344069742a02e949dda47'

const ANCHORS = [
  { name: '标题行（"The MIT License" / "MIT License"）', re: /\bMIT License\b/i },
  { name: '版权归属行（Copyright (c) <年份> KC3改）', re: /Copyright \(c\) \d{4}(-\d{4})?\s+KC3改/ },
  { name: '授权语句（"Permission is hereby granted, free of charge"）', re: /Permission is hereby granted,\s*free of charge/i },
  {
    name: '保留条款（版权声明与许可声明须保留在软件的所有副本/实质性部分中）',
    re: /The above copyright notice and this permission notice shall be included in all\s*copies or substantial portions of the Software/i,
  },
  {
    name: '免责条款（"THE SOFTWARE IS PROVIDED "AS IS"" 及后续 NO EVENT SHALL 一段）',
    re: /THE SOFTWARE IS PROVIDED "AS IS"/i,
  },
]

/**
 * @param {string} licenseText 已去除 BOM、已 trimEnd() 的 LICENSE 文件内容
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkKc3License(licenseText) {
  const actualHash = createHash('sha256').update(licenseText, 'utf8').digest('hex')
  if (actualHash === EXPECTED_SHA256) return { ok: true }

  const missing = ANCHORS.filter((a) => !a.re.test(licenseText))

  if (missing.length === 0) {
    // 四个锚点全部还在（标题、版权归属、授权语句、保留条款、免责条款——
    // 版权归属行specifically 还指名 KC3改，不是被替换成了别的项目），
    // 只是整份文本的哈希对不上钉死的值：最可能是 KC3 自己合法更新了
    // LICENSE（换年份、微调措辞），不是"这根本不是 KC3 的 MIT 声明"。
    return {
      ok: false,
      reason:
        `LICENSE 内容的 SHA-256（${actualHash}）与上次评审时钉死的值` +
        `（${EXPECTED_SHA256}，见 scripts/kc3License.mjs 的 EXPECTED_SHA256 注释）不一致，` +
        '但版权归属行仍指名 KC3改、MIT 的标题/授权/保留/免责四类实质性条款都还在——' +
        '看起来像是 KC3 合法更新了 LICENSE（换了年份或微调了措辞），不像是被替换成了别的许可证。\n' +
        '请人工对比这份 LICENSE 与上一次评审通过的版本的 diff，确认改动确实只是版本更新' +
        '（不是被替换成别的项目/许可证）之后，把 scripts/kc3License.mjs 里的 EXPECTED_SHA256 ' +
        `更新成 ${actualHash}，再重新运行 sync-i18n。`,
    }
  }

  return {
    ok: false,
    reason:
      `LICENSE 内容的 SHA-256（${actualHash}）与钉死的值不一致，且缺少下列 MIT 许可证的` +
      '实质性特征，不像是一份完整、未被篡改的 KC3 MIT 声明（可能是空文件、被截断、' +
      '误放了别的许可证，或版权行被替换成了别的项目）：\n' +
      missing.map((a) => `  - ${a.name}`).join('\n'),
  }
}
