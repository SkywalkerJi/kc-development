import type { MsgKey } from '../types'

export const en: Record<MsgKey, string> = {
  'title.app': 'Equipment Development',
  'title.development': 'Equipment Development',
  'error.initFailed': 'Failed to load development data. Please reload the page.',

  'label.secretaryType': 'Secretary Ship Type:',
  'label.secretary': 'Secretary',
  'label.fuel': 'Fuel',
  'label.ammo': 'Ammo',
  'label.steel': 'Steel',
  'label.bauxite': 'Bauxite',
  'label.icon': 'Icon',
  'label.equipment': 'Equipment',
  'label.hitRate': 'Rate',
  'label.failRate': 'Fail Rate',
  'label.minResourceReq': 'Min. Resources',
  'label.totalResource': 'Total',
  'label.poolType': 'Pool Type',

  'group.target': 'Target Equipment',
  'group.other': 'Other Equipment',
  'group.insufficient': 'Failed - Insufficient Resources',
  'group.replaced': 'Fully Replaced',

  'panel.equipFilter': 'Select Equipment',
  'panel.recipes': 'Available Recipes',
  'alt.equipIcon': 'Equipment icon',

  'search.placeholder': 'Enter ship name or kana reading',
  'search.poolOf': 'Development pool: ',
  'search.mismatch': ' (differs from selected pool)',
  'search.notFound': 'Ship not found, or it belongs to no development pool',

  'poolType.bauxite': 'Bauxite',
  'poolType.ammo': 'Ammo',
  'poolType.fuelSteel': 'Fuel/Steel',

  'desc.exclude': 'excluding',
  'desc.minFuel': 'min. fuel',
  'desc.minAmmo': 'min. ammo',
  'desc.minSteel': 'min. steel',
  'desc.minBauxite': 'min. bauxite',
  'desc.invalid': 'Filter condition is malformed',

  'loading.data': 'Loading data...',
  'loading.gameData': 'Loading game data...',
  'loading.poolData': 'Loading development pool data...',
  'loading.done': 'Data loaded',
  'loading.partial': 'Data loaded with errors',
  'loading.failed': 'Failed to load data',
  'loading.failedRetry': 'Failed to load data. Please reload the page',
  'loading.steps': 'Loading steps:',
  'loading.stepShip': 'Loading ship data',
  'loading.stepAbyssal': 'Loading abyssal data',
  'loading.stepPool': 'Loading development pool data',
  'loading.stepDone': 'Done',
  'loading.stepPending': 'In progress...',

  'error.title': 'Error details:',
  'error.unknown': 'Unknown error',
  'error.poolLoadError': 'Development pool data load error',
  'error.poolLoadFailed': 'Failed to load development pool data',

  'locale.label': 'Language',
  'locale.switchFailed': 'Failed to switch language; keeping the current one',
  'locale.retry': 'Retry',
}
