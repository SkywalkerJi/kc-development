import type { MsgKey } from '../types'

export const zhHant: Record<MsgKey, string> = {
  'title.development': '裝備開發',
  'error.initFailed': '裝備開發資料載入失敗，請重新整理頁面。',

  'label.secretaryType': '秘書艦類型：',
  'label.secretary': '秘書艦',
  'label.fuel': '油',
  'label.ammo': '彈',
  'label.steel': '鋼',
  'label.bauxite': '鋁',
  'label.icon': '圖示',
  'label.equipment': '裝備',
  'label.hitRate': '出貨率',
  'label.failRate': '失敗率',
  'label.minResourceReq': '最低資源需求',
  'label.totalResource': '總資源',
  'label.poolType': '池類型',

  'group.target': '目標裝備',
  'group.other': '其它裝備',
  'group.insufficient': '資源不足導致失敗',
  'group.replaced': '全部被替換',

  'panel.equipFilter': '自選裝備組合',
  'panel.recipes': '可用公式',
  'alt.equipIcon': '裝備圖示',

  'search.placeholder': '輸入艦名或假名讀音',
  'search.poolOf': '歸屬開發池：',
  'search.mismatch': '（與目前所選池不一致）',
  'search.notFound': '未找到該艦或它不屬於任何開發池',

  'poolType.bauxite': '鋁',
  'poolType.ammo': '彈',
  'poolType.fuelSteel': '油鋼',

  'desc.exclude': '不包含',
  'desc.minFuel': '最低油',
  'desc.minAmmo': '最低彈',
  'desc.minSteel': '最低鋼',
  'desc.minBauxite': '最低鋁',
  'desc.invalid': '過濾條件有點問題',

  'loading.data': '正在載入資料...',
  'loading.gameData': '正在載入遊戲資料...',
  'loading.poolData': '正在載入開發池資料...',
  'loading.done': '資料載入完成',
  'loading.partial': '資料載入部分完成，存在錯誤',
  'loading.failed': '資料載入失敗',
  'loading.failedRetry': '資料載入失敗，請重新整理頁面',
  'loading.steps': '載入步驟:',
  'loading.stepShip': '載入艦船資料',
  'loading.stepAbyssal': '載入深海艦船資料',
  'loading.stepPool': '載入開發池資料',
  'loading.stepDone': '已完成',
  'loading.stepPending': '處理中...',

  'error.title': '錯誤詳情:',
  'error.unknown': '未知錯誤',

  'locale.label': '語言',
  'locale.switchFailed': '語言切換失敗，已保持目前語言',
}
