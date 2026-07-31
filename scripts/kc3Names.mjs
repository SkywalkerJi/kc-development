/**
 * KC3 译名数据的两个合成算法，抽成纯函数供 sync-i18n.mjs 与测试共用。
 *
 * KC3 的 ships.json 只收录**基础舰名**（约 630 条），改造形态与季节立绘靠
 * ship_affix.json 里的前后缀表拼出来 —— 直接查 ships.json 只能覆盖四成。
 * 实测这套合成对 start2 里 800 艘玩家舰在 scn/tcn/en 三种语言下都是 100%。
 */

/**
 * @param {Record<string,string>} ships KC3 的 ships.json：日文基础名 → 译名
 * @param {{suffixes?:Record<string,string>, prefixes?:Record<string,string>, byId?:Record<string,string>}} affix
 * @returns {(shipId: number, jaName: string) => string | null}
 */
export function buildShipTranslator(ships, affix) {
  const suffixes = affix.suffixes ?? {}
  const prefixes = affix.prefixes ?? {}
  const byId = affix.byId ?? {}
  // 长者优先：不排序的话「改二」会被「改」先匹配掉，剩下个查不到的「金剛二」
  const sufKeys = Object.keys(suffixes).sort((a, b) => b.length - a.length)
  const preKeys = Object.keys(prefixes).sort((a, b) => b.length - a.length)

  return (shipId, jaName) => {
    // byId 必须最先查：像宗谷这样同名不同形态（灯台補給船／南極観測船／特務艦）
    // 的舰，日文名完全相同，只有 ID 能区分
    const override = byId[String(shipId)]
    if (override) return override
    if (ships[jaName]) return ships[jaName]

    let rest = jaName
    let prefixOut = ''
    for (const k of preKeys) {
      if (rest.startsWith(k)) { prefixOut = prefixes[k]; rest = rest.slice(k.length); break }
    }

    const suffixOut = []
    // 循环剥离：改二甲 → 剥「甲」→「翔鶴改二」→ 剥「改二」→「翔鶴」
    for (;;) {
      if (ships[rest]) break
      const hit = sufKeys.find((k) => rest.endsWith(k) && rest.length > k.length)
      if (!hit) break
      suffixOut.unshift(suffixes[hit])
      rest = rest.slice(0, -hit.length)
    }

    const base = ships[rest]
    if (base === undefined) return null
    return (prefixOut + base + suffixOut.join('')).trim()
  }
}

/**
 * 由舰名译名派生舰级译名：剥掉尾部的「型」/「級」，查首舰译名，接回该语言的后缀。
 *
 * 覆盖不到的是「巡潜乙型」「UボートIXC型」这类不以首舰命名的通用型号，返回 null。
 * @param {string} jaCtypeName 日文舰级名，如 '金剛型'
 * @param {Record<string,string>} ships
 * @param {Record<string,string>} ctypeAffix ship_affix.json 的 ctype 映射
 */
export function deriveCtypeName(jaCtypeName, ships, ctypeAffix) {
  for (const tail of ['型', '級']) {
    if (!jaCtypeName.endsWith(tail)) continue
    const base = jaCtypeName.slice(0, -tail.length)
    const translated = ships[base]
    if (translated === undefined) return null
    return translated + (ctypeAffix[tail] ?? tail)
  }
  return null
}
