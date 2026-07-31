/**
 * 简体中文 UI 文案 —— **同时是 key 集合的真值源**（见 types.ts 的 MsgKey）。
 *
 * ⚠️ 这些值与改造前散落在模板里的硬编码**逐字相同**，不是巧合也不能随手优化：
 * DevelopmentView.spec.ts 用 textContent?.startsWith('油') / includes('全部被替换')
 * 这类文本匹配定位 DOM，默认语言又是 zh-Hans，改一个字就会让那些测试变红。
 * 真要改措辞，先确认没有测试依赖它，并在提交信息里写明。
 */
export const zhHans = {
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
  'error.poolLoadFailed': '开发池数据加载错误',
  'error.poolLoadException': '开发池数据加载失败',

  'locale.label': '语言',
  'locale.switchFailed': '语言切换失败，已保持当前语言',
} as const
