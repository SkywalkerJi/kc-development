/**
 * 生成 THIRD_PARTY_NOTICES 文件内容的纯函数，抽出来的理由同
 * syncI18nValidate.mjs：sync-i18n.mjs 顶层直接做 argv 解析、文件读写、
 * process.exit，不适合被当模块 import；这里只导出一个不碰文件系统的纯函数，
 * 方便脱离真实的 --kc3 clone 单独测试。
 *
 * 刻意不含生成时间戳——理由与 _meta.json 相同（见 sync-i18n.mjs 写
 * _meta.json 那段注释）：这份文件应当是 (KC3 commit, LICENSE 原文) 的
 * 纯函数，同一输入重跑应该产出逐字节相同的内容，方便靠 git diff 判断
 * "这次同步有没有变化"，而不是每次跑都因为时间戳而产生噪音 diff。
 */

/**
 * @param {{ source: string, commit: string | null, licenseText: string }} args
 *   source：KC3Kai/kc3-translations 的仓库 URL。
 *   commit：本次同步用的 KC3 clone 的 HEAD commit；解析不到时为 null
 *     （不是 git 仓库等情况，与 sync-i18n.mjs 里 `commit` 变量同一来源，
 *     不在这里重新计算）。
 *   licenseText：KC3 clone 的 LICENSE 文件原文（已去除 BOM 与尾随空白），
 *     原样转录，不做任何改写——MIT 要求许可声明本身被保留，改写就不是
 *     "保留"了。
 * @returns {string} THIRD_PARTY_NOTICES 文件内容，末尾带一个换行符。
 */
export function buildThirdPartyNotice({ source, commit, licenseText }) {
  const commitLine = commit ? `Commit:  ${commit}` : 'Commit:  unknown（KC3 clone 不是 git 仓库，或解析 HEAD 失败）'
  return [
    'Third-Party Notices',
    '====================',
    '',
    '本仓库自身以 GPLv3 授权（见仓库根目录 LICENSE）。装备/舰船/舰级译名数据',
    '（public/data/i18n/ 下的 items.json / ships.json / ctype.json）衍生自下列',
    '第三方项目，按其原始许可证单独授权，不受本仓库 GPLv3 许可证覆盖：',
    '',
    'Project: KC3Kai/kc3-translations',
    `Source:  ${source}`,
    commitLine,
    'License: MIT',
    '',
    '本次同步（pnpm sync-i18n）生成 public/data/i18n/ 下译名数据时使用的正是',
    '上面这个 commit；与 public/data/i18n/_meta.json 里记录的 commit 字段一致。',
    '',
    '--------------------------------------------------------------------------',
    licenseText,
    '--------------------------------------------------------------------------',
    '',
    '本文件由 scripts/sync-i18n.mjs 在每次 `pnpm sync-i18n` 时重新生成，请勿',
    '手改——手改的内容会在下一次同步时被覆盖。需要改生成规则时改',
    'scripts/thirdPartyNotice.mjs。',
    '',
  ].join('\n')
}
