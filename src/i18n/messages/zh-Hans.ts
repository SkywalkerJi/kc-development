/**
 * 简体中文 UI 文案 —— **同时是 key 集合的真值源**（见 types.ts 的 MsgKey）。
 *
 * ⚠️ 这些值与改造前散落在模板里的硬编码**逐字相同**，不是巧合也不能随手优化：
 * DevelopmentView.spec.ts 用 textContent?.startsWith('油') / includes('全部被替换')
 * 这类文本匹配定位 DOM，默认语言又是 zh-Hans，改一个字就会让那些测试变红。
 * 真要改措辞，先确认没有测试依赖它，并在提交信息里写明。
 */
export const zhHans = {
  /**
   * 站名。同时是 <title>（i18n 的 doSwitch 写 document.title）与页头 h1。
   *
   * 与 title.development 刻意不同：前者是「这个站是什么」，要带上足够的
   * 关键词让搜索结果与分享卡片能读懂；后者是页内那块功能区的小标题，短
   * 才对。两者都叫「装备开发」的时候，标签页标题里没有任何信息能说明这
   * 是舰队 Collection 的工具。
   *
   * ⚠️ 改这个值要同步五处，少一处 `pnpm verify-render` 就报红：
   * 四个 messages/*.ts + scripts/verify-render.mjs 的 EXPECTED.<locale>.title
   * + index.html 的静态 <title>（首帧闪烁，见那里的注释）。
   */
  'title.app': '舰队 Collection 装备开发计算器',
  /** 页头 h1 下面那行副标题，也是页面对自己的一句话说明。 */
  'title.tagline': '投入资源看出货率，选中装备反推配方',
  /**
   * <meta name="description">。切换语言时由 doSwitch 改写（见
   * src/i18n/index.ts）——这一条只对会执行 JS 的搜索引擎和读页面源码的人
   * 有意义；不执行 JS 的社交抓取器读到的永远是 index.html 里那份静态
   * zh-Hans 文案，理由见 index.html 里那段说明。
   */
  'meta.description': '舰队 Collection 装备开发计算器：选定秘书舰、填入油弹钢铝，逐件列出装备的出货率与最低资源要求；也可以反过来选中想要的装备，反推出所有可用配方。',
  'title.development': '装备开发',
  'error.initFailed': '装备开发数据加载失败，请刷新页面重试。',

  'label.secretaryType': '秘书舰类型：',
  'label.secretary': '秘书舰',
  'label.fuel': '油',
  'label.ammo': '弹',
  'label.steel': '钢',
  'label.bauxite': '铝',
  'label.icon': '图标',
  'label.equipment': '装备',
  'label.hitRate': '出货率',
  'label.failRate': '失败率',
  'label.minResourceReq': '最低资源要求',
  'label.totalResource': '总资源',
  'label.poolType': '池类型',

  'group.target': '目标装备',
  'group.other': '其它装备',
  'group.insufficient': '资源不足导致失败',
  'group.replaced': '全部被替换',

  'panel.equipFilter': '自选装备组合',
  'panel.recipes': '可用公式',
  'alt.equipIcon': '装备图标',

  'search.placeholder': '输入舰名或假名读音',
  'search.poolOf': '归属开发池：',
  'search.mismatch': '（与当前所选池不一致）',
  'search.notFound': '未找到该舰或它不属于任何开发池',

  'poolType.bauxite': '铝',
  'poolType.ammo': '弹',
  'poolType.fuelSteel': '油钢',

  'desc.exclude': '不包含',
  'desc.minFuel': '最低油',
  'desc.minAmmo': '最低弹',
  'desc.minSteel': '最低钢',
  'desc.minBauxite': '最低铝',
  'desc.invalid': '过滤条件有点问题',

  'loading.data': '正在加载数据...',
  'loading.gameData': '正在加载游戏数据...',
  'loading.poolData': '正在加载开发池数据...',
  'loading.done': '数据加载完成',
  'loading.partial': '数据加载部分完成，存在错误',
  'loading.failed': '数据加载失败',
  'loading.failedRetry': '数据加载失败，请刷新页面重试',
  'loading.steps': '加载步骤:',
  'loading.stepShip': '加载舰船数据',
  'loading.stepAbyssal': '加载深海舰船数据',
  'loading.stepPool': '加载开发池数据',
  'loading.stepDone': '已完成',
  'loading.stepPending': '处理中...',

  'error.title': '错误详情:',
  'error.unknown': '未知错误',
  'error.poolLoadError': '开发池数据加载错误',
  'error.poolLoadFailed': '开发池数据加载失败',

  'locale.label': '语言',
  'locale.switchFailed': '语言切换失败，已保持当前语言',
  'locale.retry': '重试',

  // 页头两个外链的无障碍名称。链接本身只有一个图标，没有可见文字，
  // 读屏软件念不出「GitHub」三个字——这两条就是它念出来的东西，同时
  // 也是鼠标悬停时的 title 提示。
  'link.github': '在 GitHub 上查看源码',
  'link.x': '在 X 上关注作者',

  // 页脚三行。footer.credit 整行是指向 kc3-translations 仓库的链接文字，
  // 不拆成「前缀 + 专名 + 后缀」：那样每种语言的标点与语序都要单独拼，
  // 而收益只是让链接短一点。
  'footer.credit': '译名数据来自 KC3Kai/kc3-translations（MIT 许可）',
  'footer.license': '本项目以 GPL-3.0 分发',
  'footer.disclaimer': '非官方粉丝作品，与 DMM GAMES / 角川游戏无关',
} as const
