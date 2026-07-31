/**
 * 页面上出现的全部站外链接。
 *
 * 集中在这里而不是内联在各自的模板里：仓库地址在页头（AppHeader）和页脚
 * （AppFooter 的许可链接）都要用，两处各抄一遍迟早对不上——2026-07-31 仓库
 * 从 kc-development 改名成 kc-development-tools 那次，散落各处的副本正是主要
 * 的返工来源（同类教训见 vite.config.ts 里 base 那段注释列出的三处副本）。
 *
 * 不从 package.json 的 repository 字段派生：那要在构建期把 JSON 引进来，而
 * 这几个值一年也不会变一次，多一条构建期依赖不划算。
 *
 * ⚠️ 这些常量与 index.html 里 JSON-LD 的 author.sameAs / codeRepository、
 * 以及 README 的徽章链接是同一批地址的不同副本。那两处是静态文本，读不到
 * 这个模块（一个是 HTML，一个是 Markdown），只能靠改的时候一起改。
 */

/** 本项目的 GitHub 仓库。 */
export const REPO_URL = 'https://github.com/SkywalkerJi/kc-development-tools'

/** 仓库里的许可证全文。用 blob 链接而不是 gnu.org：读者关心的是"这份代码按
 *  什么许可发布"，仓库里那一份才是随代码一起分发的那一份。 */
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`

/** 作者的 X。 */
export const X_URL = 'https://x.com/Skywalker_Ji'

/** 各语言译名数据的上游（MIT）。页脚的署名按 MIT 的要求指向它。 */
export const KC3_TRANSLATIONS_URL = 'https://github.com/KC3Kai/kc3-translations'
