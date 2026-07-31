import type { Locale } from '../types'

/**
 * 开发池名的四语言映射。键是**中文原名**，也是身份键（existPool 的元素、
 * DevelopResult.池名、以及 View 里几处 join 条件都用它），所以 zh-Hans 一列
 * 恒等于键本身 —— poolNames.spec.ts 会守住这条。
 *
 * 这 46 条 wiki 上没有现成译名，是人工翻译的。原则：系列词统一
 * （砲戦系/水雷系/空母系/潜水系），限定条件里的舰名与舰级**采用与界面其他
 * 位置相同的译名**（同取自 KC3），避免「池名写『厌战』、舰名列显示『厭戰』」
 * 这种同一艘船两个名字的分裂。日文一列用游戏内原名（外国舰在舰C里本就是
 * 拉丁名，不臆造片假名）。
 */
export const POOL_NAMES: Record<string, Record<Locale, string>> = {
  '炮战系-意': { 'zh-Hans': '炮战系-意', 'zh-Hant': '砲戰系-義', ja: '砲戦系-伊', en: 'Gunnery - Italian' },
  '炮战系-厌战英勇': { 'zh-Hans': '炮战系-厌战英勇', 'zh-Hant': '砲戰系-厭戰、英勇', ja: '砲戦系-Warspite・Valiant', en: 'Gunnery - Warspite & Valiant' },
  '炮战系-纳尔逊罗德尼': { 'zh-Hans': '炮战系-纳尔逊罗德尼', 'zh-Hant': '砲戰系-納爾遜、羅德尼', ja: '砲戦系-Nelson・Rodney', en: 'Gunnery - Nelson & Rodney' },
  '炮战系-比叡改二': { 'zh-Hans': '炮战系-比叡改二', 'zh-Hant': '砲戰系-比叡改二', ja: '砲戦系-比叡改二', en: 'Gunnery - Hiei Kai Ni' },
  '炮战系-金刚级': { 'zh-Hans': '炮战系-金刚级', 'zh-Hant': '砲戰系-金剛型', ja: '砲戦系-金剛型', en: 'Gunnery - Kongou Class' },
  '炮战系-内华达': { 'zh-Hans': '炮战系-内华达', 'zh-Hant': '砲戰系-內華達', ja: '砲戦系-Nevada', en: 'Gunnery - Nevada' },
  '炮战系-黎塞留级': { 'zh-Hans': '炮战系-黎塞留级', 'zh-Hant': '砲戰系-黎希留級', ja: '砲戦系-Richelieu級', en: 'Gunnery - Richelieu Class' },
  '炮战系-大和级(大和改二重除外)': { 'zh-Hans': '炮战系-大和级(大和改二重除外)', 'zh-Hant': '砲戰系-大和型(不含大和改二重)', ja: '砲戦系-大和型(大和改二重を除く)', en: 'Gunnery - Yamato Class (excl. Yamato Kai Ni Juu)' },
  '炮战系-北安普敦': { 'zh-Hans': '炮战系-北安普敦', 'zh-Hant': '砲戰系-北安普頓', ja: '砲戦系-Northampton', en: 'Gunnery - Northampton' },
  '炮战系-其它': { 'zh-Hans': '炮战系-其它', 'zh-Hant': '砲戰系-其它', ja: '砲戦系-その他', en: 'Gunnery - Others' },
  '水雷系-阿贺野级': { 'zh-Hans': '水雷系-阿贺野级', 'zh-Hant': '水雷系-阿賀野型', ja: '水雷系-阿賀野型', en: 'Torpedo - Agano Class' },
  '水雷系-川内改二': { 'zh-Hans': '水雷系-川内改二', 'zh-Hant': '水雷系-川内改二', ja: '水雷系-川内改二', en: 'Torpedo - Sendai Kai Ni' },
  '水雷系-神通改二': { 'zh-Hans': '水雷系-神通改二', 'zh-Hant': '水雷系-神通改二', ja: '水雷系-神通改二', en: 'Torpedo - Jintsuu Kai Ni' },
  '水雷系-海伦娜': { 'zh-Hans': '水雷系-海伦娜', 'zh-Hant': '水雷系-海倫娜', ja: '水雷系-Helena', en: 'Torpedo - Helena' },
  '水雷系-大淀': { 'zh-Hans': '水雷系-大淀', 'zh-Hant': '水雷系-大淀', ja: '水雷系-大淀', en: 'Torpedo - Ooyodo' },
  '水雷系-意驱': { 'zh-Hans': '水雷系-意驱', 'zh-Hant': '水雷系-義驅', ja: '水雷系-伊駆', en: 'Torpedo - Italian DD' },
  '水雷系-德驱': { 'zh-Hans': '水雷系-德驱', 'zh-Hant': '水雷系-德驅', ja: '水雷系-独駆', en: 'Torpedo - German DD' },
  '水雷系-秋月级': { 'zh-Hans': '水雷系-秋月级', 'zh-Hant': '水雷系-秋月型', ja: '水雷系-秋月型', en: 'Torpedo - Akizuki Class' },
  '水雷系-神风级': { 'zh-Hans': '水雷系-神风级', 'zh-Hant': '水雷系-神風型', ja: '水雷系-神風型', en: 'Torpedo - Kamikaze Class' },
  '水雷系-睦月级': { 'zh-Hans': '水雷系-睦月级', 'zh-Hant': '水雷系-睦月型', ja: '水雷系-睦月型', en: 'Torpedo - Mutsuki Class' },
  '水雷系-吹白雪改二': { 'zh-Hans': '水雷系-吹白雪改二', 'zh-Hant': '水雷系-吹雪、白雪改二', ja: '水雷系-吹雪・白雪改二', en: 'Torpedo - Fubuki & Shirayuki Kai Ni' },
  '水雷系-吹雪级': { 'zh-Hans': '水雷系-吹雪级', 'zh-Hant': '水雷系-吹雪型', ja: '水雷系-吹雪型', en: 'Torpedo - Fubuki Class' },
  '水雷系-天津风': { 'zh-Hans': '水雷系-天津风', 'zh-Hant': '水雷系-天津風', ja: '水雷系-天津風', en: 'Torpedo - Amatsukaze' },
  '水雷系-其它驱逐舰': { 'zh-Hans': '水雷系-其它驱逐舰', 'zh-Hant': '水雷系-其它驅逐艦', ja: '水雷系-その他の駆逐艦', en: 'Torpedo - Other DDs' },
  '水雷系-海防舰': { 'zh-Hans': '水雷系-海防舰', 'zh-Hant': '水雷系-海防艦', ja: '水雷系-海防艦', en: 'Torpedo - Escort Ships' },
  '水雷系-灯泡宗谷、南极宗谷': { 'zh-Hans': '水雷系-灯泡宗谷、南极宗谷', 'zh-Hant': '水雷系-宗谷(燈塔補給船)、(南極觀測船)', ja: '水雷系-宗谷(灯台補給船)・(南極観測船)', en: 'Torpedo - Souya (Lighthouse / Antarctic)' },
  '水雷系-山汐丸': { 'zh-Hans': '水雷系-山汐丸', 'zh-Hant': '水雷系-山汐丸', ja: '水雷系-山汐丸', en: 'Torpedo - Yamashio Maru' },
  '水雷系-32驱改二': { 'zh-Hans': '水雷系-32驱改二', 'zh-Hant': '水雷系-第32驅逐隊改二', ja: '水雷系-第32駆逐隊改二', en: 'Torpedo - DesDiv32 Kai Ni' },
  '水雷系-其它': { 'zh-Hans': '水雷系-其它', 'zh-Hant': '水雷系-其它', ja: '水雷系-その他', en: 'Torpedo - Others' },
  '空母系-陆攻': { 'zh-Hans': '空母系-陆攻', 'zh-Hant': '空母系-陸攻', ja: '空母系-陸攻', en: 'Carrier - Land-based Bombers' },
  '空母系-日向改': { 'zh-Hans': '空母系-日向改', 'zh-Hant': '空母系-日向改', ja: '空母系-日向改', en: 'Carrier - Hyuuga Kai' },
  '空母系-伊势改': { 'zh-Hans': '空母系-伊势改', 'zh-Hant': '空母系-伊勢改', ja: '空母系-伊勢改', en: 'Carrier - Ise Kai' },
  '空母系-方舟': { 'zh-Hans': '空母系-方舟', 'zh-Hant': '空母系-皇家方舟', ja: '空母系-Ark Royal', en: 'Carrier - Ark Royal' },
  '空母系-萨拉、大黄蜂': { 'zh-Hans': '空母系-萨拉、大黄蜂', 'zh-Hant': '空母系-薩拉托加、大黃蜂', ja: '空母系-Saratoga・Hornet', en: 'Carrier - Saratoga & Hornet' },
  '空母系-列克星敦': { 'zh-Hans': '空母系-列克星敦', 'zh-Hant': '空母系-列星頓', ja: '空母系-Lexington', en: 'Carrier - Lexington' },
  '空母系-二航战': { 'zh-Hans': '空母系-二航战', 'zh-Hant': '空母系-二航戰', ja: '空母系-二航戦', en: 'Carrier - CarDiv2' },
  '空母系-大凤': { 'zh-Hans': '空母系-大凤', 'zh-Hant': '空母系-大鳳', ja: '空母系-大鳳', en: 'Carrier - Taihou' },
  '空母系-大凤改': { 'zh-Hans': '空母系-大凤改', 'zh-Hant': '空母系-大鳳改', ja: '空母系-大鳳改', en: 'Carrier - Taihou Kai' },
  '空母系-五航改二(甲)': { 'zh-Hans': '空母系-五航改二(甲)', 'zh-Hant': '空母系-五航戰改二(甲)', ja: '空母系-五航戦改二(甲)', en: 'Carrier - CarDiv5 Kai Ni (A)' },
  '空母系-塔斯特': { 'zh-Hans': '空母系-塔斯特', 'zh-Hant': '空母系-特斯特長官', ja: '空母系-Commandant Teste', en: 'Carrier - Comdt. Teste' },
  '空母系-陆军、特务宗谷': { 'zh-Hans': '空母系-陆军、特务宗谷', 'zh-Hant': '空母系-陸軍船、宗谷(特務艦)', ja: '空母系-陸軍船・宗谷(特務艦)', en: 'Carrier - Army Ships & Souya (Aux.)' },
  '空母系-齐柏林': { 'zh-Hans': '空母系-齐柏林', 'zh-Hant': '空母系-齊柏林伯爵', ja: '空母系-Graf Zeppelin', en: 'Carrier - Graf Zeppelin' },
  '空母系-其它': { 'zh-Hans': '空母系-其它', 'zh-Hant': '空母系-其它', ja: '空母系-その他', en: 'Carrier - Others' },
  '潜水系-Scamp、Salmon': { 'zh-Hans': '潜水系-Scamp、Salmon', 'zh-Hant': '潛水系-巫喙鱸、鮭魚', ja: '潜水系-Scamp・Salmon', en: 'Submarine - Scamp & Salmon' },
  '潜水系-潜水母舰': { 'zh-Hans': '潜水系-潜水母舰', 'zh-Hant': '潛水系-潛水母艦', ja: '潜水系-潜水母艦', en: 'Submarine - Sub Tenders' },
  '潜水系-其它': { 'zh-Hans': '潜水系-其它', 'zh-Hant': '潛水系-其它', ja: '潜水系-その他', en: 'Submarine - Others' },
}
