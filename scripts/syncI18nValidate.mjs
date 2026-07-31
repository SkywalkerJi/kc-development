/**
 * sync-i18n.mjs 的四项硬性校验，抽成纯函数以便脱离真实的 --kc3 clone 单独测试。
 * 拆分理由同 syncDataValidate.mjs：sync-i18n.mjs 顶层直接做 argv 解析、文件读写、
 * process.exit，不适合被当模块 import；这个文件只导出纯函数，没有任何顶层副作用，
 * 调用方（sync-i18n.mjs）在算完全部四语言的产出之后调用它一次，校验不过就不写任何文件。
 */

/**
 * @typedef {{items: Record<string,string>, ships: Record<string,string>, ctype: Record<string,string>, derivedCtype?: Record<string,string>}} LocaleOutput
 * items/ships/ctype：即将写进 i18n/<locale>/*.json 的内容（zh-Hans 的 ctype 恒为空对象，
 * 因为 zh-Hans 不产 ctype.json）。derivedCtype 只有 zh-Hans 用得到：拿 scn 的舰船/前后缀表
 * 把 ctypeJa 走一遍 deriveCtypeName，结果只喂给下面的自校验，从不写入任何文件。
 */

/**
 * @param {{ja: LocaleOutput, 'zh-Hans': LocaleOutput, 'zh-Hant': LocaleOutput, en: LocaleOutput}} produced
 * @param {{refEquipIds: number[], playerShipIds: number[], refCtypeIds: number[], ctypeZhHans: Record<string,string>}} refs
 *   refEquipIds/refCtypeIds：DevelopmentPool.json 实际引用到的装备/舰级 ID —— 硬性校验只
 *   针对它们，start2 里开发池根本不会出现的装备翻不出来不该阻断同步；
 *   playerShipIds：start2 里 id < 1500 的全部玩家舰；
 *   ctypeZhHans：既有的 public/data/ctype.json（被哈希钉死，这里只读不写）
 * @returns {string[]} 错误列表，长度为 0 表示四项校验全部通过
 */
export function validate(produced, refs) {
  const { refEquipIds, playerShipIds, refCtypeIds, ctypeZhHans } = refs
  const errors = []

  // 校验 1 + 2：开发池引用的装备、全部玩家舰，在实际做了舰名/装备翻译的三种语言里
  // 必须都有译名。ja 的 items/ships 故意留空（真值源是 start2.json 本身），不参与这两项。
  for (const locale of ['zh-Hans', 'zh-Hant', 'en']) {
    const { items, ships } = produced[locale]
    const missItems = refEquipIds.filter((id) => !items[id])
    if (missItems.length) {
      errors.push(`[${locale}] 开发池引用的装备缺译名 ${missItems.length} 件：${missItems.slice(0, 10).join(', ')}`)
    }
    const missShips = playerShipIds.filter((id) => !ships[id])
    if (missShips.length) {
      errors.push(`[${locale}] 玩家舰缺译名 ${missShips.length} 艘：${missShips.slice(0, 10).join(', ')}`)
    }
  }

  // 校验 3（自校验）：zh-Hans 用 scn 数据派生出的舰级名，必须与既有 ctype.json
  // 在两者都有的键上逐字相同。这只验证「派生算法在 zh-Hans 上算得对不对」，
  // 不验证覆盖率——覆盖率是校验 4 里 zh-Hans 那一条分支单独负责的事，两者不能互相替代。
  const derivedCtype = produced['zh-Hans'].derivedCtype ?? {}
  const mismatch = Object.entries(derivedCtype).filter(([k, v]) => v != null && ctypeZhHans[k] && ctypeZhHans[k] !== v)
  if (mismatch.length) {
    errors.push(`[自校验] 派生的简中舰级名与 ctype.json 不一致 ${mismatch.length} 条：` +
      mismatch.slice(0, 5).map(([k, v]) => `${k} 派生=${v} 现有=${ctypeZhHans[k]}`).join('; '))
  }

  // 校验 4：开发池引用到的舰级必须能查到。
  // - ja/zh-Hant/en：查各自产出的 ctype 表——这张表就是要写进 i18n/<locale>/ctype.json 的内容。
  // - zh-Hans：不产出 ctype.json，运行时读的是既有 public/data/ctype.json，所以这里要查那份
  //   文件本身，不能查上面仅用于自校验、从未落盘的 derivedCtype——查 derivedCtype 只能验证
  //   「派生算法算得对」，验证不了「开发池引用的舰级真的能在运行时读到的数据里查到」，
  //   两者是不同的问题，混为一谈就会让这条校验对 zh-Hans 变成空转。
  for (const locale of ['ja', 'zh-Hant', 'en']) {
    const { ctype } = produced[locale]
    const missCtype = refCtypeIds.filter((id) => !ctype[id])
    if (missCtype.length) {
      errors.push(`[${locale}] 开发池引用的舰级缺译名：${missCtype.join(', ')}`)
    }
  }
  const missZhHansCtype = refCtypeIds.filter((id) => !ctypeZhHans[id])
  if (missZhHansCtype.length) {
    errors.push(`[zh-Hans] 开发池引用的舰级不在 ctype.json 里：${missZhHansCtype.join(', ')}`)
  }

  return errors
}
