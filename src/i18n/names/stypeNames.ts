import type { Locale } from '../types'

/**
 * 舰种代码的译名。**只有三列**：ja 不在这里，它从
 * `api_mst_stype[].api_name` 取（见 i18n/index.ts 的 stypeName）——
 * 数据里本来就有日文舰种名，手抄 20 个词只会引入错字。ja 唯一的例外是
 * 下面的 JA_STYPE_OVERRIDES，理由见那条注释。
 *
 * 英文保留缩写本身：英文圈本来就用 DD/CL 这套缩写指代舰种。
 */

/**
 * ja 的单条例外：FBB（高速戦艦）。
 *
 * 游戏自己的 api_mst_stype 表把 api_id 8（FBB）和 9（BB）都记成「戦艦」——
 * start2.json 实测如此，两条记录的 api_name 逐字相同。stypeName 的 ja 分支
 * 若像其余 19 个代码一样直接从这张表取，「炮战系-其它」（舰种
 * `["BB","FBB","CA","AR"]`）就会渲染出「戦艦,戦艦,重巡洋艦,工作艦」这种
 * 字面重复——其余三个语言都靠手写表区分二者（战舰/高速战舰、戰艦/高速戰艦、
 * BB/FBB），只有依赖数据派生的 ja 会因为游戏数据本身的粒度丢失这个区分。
 *
 * 所以这里为 ja 单开一条覆盖，只覆盖 FBB 这一个代码，其余 19 个仍然走
 * api_mst_stype 派生（见 i18n/index.ts 的 stypeName）——不要因为加了这一条
 * 就把整张 ja 表手抄一遍，那会重新引入"数据里有、抄错字"的风险，这条覆盖
 * 存在的唯一理由是数据本身不区分 8/9，其余 19 个没有这个问题。
 * 删除前请先确认 api_mst_stype 真的开始区分 8/9（上游游戏数据变了）。
 */
export const JA_STYPE_OVERRIDES: Partial<Record<string, string>> = {
  FBB: '高速戦艦',
}

export const STYPE_NAMES: Record<string, Record<Exclude<Locale, 'ja'>, string>> = {
  DE: { 'zh-Hans': '海防舰', 'zh-Hant': '海防艦', en: 'DE' },
  DD: { 'zh-Hans': '驱逐舰', 'zh-Hant': '驅逐艦', en: 'DD' },
  CL: { 'zh-Hans': '轻巡洋舰', 'zh-Hant': '輕巡洋艦', en: 'CL' },
  CLT: { 'zh-Hans': '重雷装巡洋舰', 'zh-Hant': '重雷裝巡洋艦', en: 'CLT' },
  CA: { 'zh-Hans': '重巡洋舰', 'zh-Hant': '重巡洋艦', en: 'CA' },
  CAV: { 'zh-Hans': '航空巡洋舰', 'zh-Hant': '航空巡洋艦', en: 'CAV' },
  CVL: { 'zh-Hans': '轻空母', 'zh-Hant': '輕空母', en: 'CVL' },
  FBB: { 'zh-Hans': '高速战舰', 'zh-Hant': '高速戰艦', en: 'FBB' },
  BB: { 'zh-Hans': '战舰', 'zh-Hant': '戰艦', en: 'BB' },
  BBV: { 'zh-Hans': '航空战舰', 'zh-Hant': '航空戰艦', en: 'BBV' },
  CV: { 'zh-Hans': '正规空母', 'zh-Hant': '正規空母', en: 'CV' },
  SS: { 'zh-Hans': '潜水舰', 'zh-Hant': '潛水艦', en: 'SS' },
  SSV: { 'zh-Hans': '潜水空母', 'zh-Hant': '潛水空母', en: 'SSV' },
  AV: { 'zh-Hans': '水上机母舰', 'zh-Hant': '水上機母艦', en: 'AV' },
  LHA: { 'zh-Hans': '扬陆舰', 'zh-Hant': '揚陸艦', en: 'LHA' },
  CVB: { 'zh-Hans': '装甲空母', 'zh-Hant': '裝甲空母', en: 'CVB' },
  AR: { 'zh-Hans': '工作舰', 'zh-Hant': '工作艦', en: 'AR' },
  AS: { 'zh-Hans': '潜水母舰', 'zh-Hant': '潛水母艦', en: 'AS' },
  CT: { 'zh-Hans': '练习巡洋舰', 'zh-Hant': '練習巡洋艦', en: 'CT' },
  AO: { 'zh-Hans': '补给舰', 'zh-Hant': '補給艦', en: 'AO' },
}
