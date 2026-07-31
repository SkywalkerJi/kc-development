import type { Locale } from '../types'

/**
 * 舰种代码的译名。**只有三列**：ja 不在这里，它从
 * `api_mst_stype[].api_name` 取（见 i18n/index.ts 的 stypeName）——
 * 数据里本来就有日文舰种名，手抄 20 个词只会引入错字。
 *
 * 英文保留缩写本身：英文圈本来就用 DD/CL 这套缩写指代舰种。
 */
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
