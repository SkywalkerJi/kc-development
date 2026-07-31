import type { MsgKey } from '../types'

export const ja: Record<MsgKey, string> = {
  'title.development': '装備開発',
  'error.initFailed': '装備開発データの読み込みに失敗しました。ページを再読み込みしてください。',

  'label.secretaryType': '秘書艦タイプ：',
  'label.secretary': '秘書艦',
  'label.fuel': '燃料',
  'label.ammo': '弾薬',
  'label.steel': '鋼材',
  'label.bauxite': 'ボーキ',
  'label.icon': 'アイコン',
  'label.equipment': '装備',
  'label.hitRate': '開発率',
  'label.failRate': '失敗率',
  'label.minResourceReq': '最低資源',
  'label.totalResource': '総資源',
  'label.poolType': 'プール種別',

  'group.target': '目標装備',
  'group.other': 'その他の装備',
  'group.insufficient': '資源不足で失敗',
  'group.replaced': 'すべて置換済み',

  'panel.equipFilter': '装備の組み合わせ選択',
  'panel.recipes': '利用可能なレシピ',
  'alt.equipIcon': '装備アイコン',

  'search.placeholder': '艦名または読み仮名を入力',
  'search.poolOf': '所属プール：',
  'search.mismatch': '（選択中のプールと不一致）',
  'search.notFound': '該当する艦が見つからないか、どのプールにも属していません',

  'poolType.bauxite': 'ボーキ',
  'poolType.ammo': '弾薬',
  'poolType.fuelSteel': '燃料鋼材',

  'desc.exclude': '除く',
  'desc.minFuel': '最低燃料',
  'desc.minAmmo': '最低弾薬',
  'desc.minSteel': '最低鋼材',
  'desc.minBauxite': '最低ボーキ',
  'desc.invalid': 'フィルタ条件に問題があります',

  'loading.data': 'データを読み込み中...',
  'loading.gameData': 'ゲームデータを読み込み中...',
  'loading.poolData': '開発プールデータを読み込み中...',
  'loading.done': 'データの読み込みが完了しました',
  'loading.partial': 'データの読み込みは完了しましたが、エラーがあります',
  'loading.failed': 'データの読み込みに失敗しました',
  'loading.failedRetry': 'データの読み込みに失敗しました。ページを再読み込みしてください',
  'loading.steps': '読み込み手順:',
  'loading.stepShip': '艦船データの読み込み',
  'loading.stepAbyssal': '深海棲艦データの読み込み',
  'loading.stepPool': '開発プールデータの読み込み',
  'loading.stepDone': '完了',
  'loading.stepPending': '処理中...',

  'error.title': 'エラー詳細:',
  'error.unknown': '不明なエラー',
  'error.poolLoadError': '開発プールデータの読み込みエラー',
  'error.poolLoadFailed': '開発プールデータの読み込みに失敗しました',

  'locale.label': '言語',
  'locale.switchFailed': '言語の切り替えに失敗しました。現在の言語を維持します',
}
