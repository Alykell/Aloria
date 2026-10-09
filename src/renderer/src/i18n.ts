import { localeOf, translate, type Lang, type MessageKey, type Params } from '../../shared/i18n'
import type { SettingsPreset } from '../../shared/types'

// Langue courante de l'interface : App la règle avant chaque rendu et remonte l'arbre quand elle change,
// ce qui permet aussi de traduire hors des composants (describeProfile…)
let current: Lang = 'fr'

export const setLang = (lang: Lang): void => {
  current = lang
  document.documentElement.lang = lang
}
export const getLang = (): Lang => current

export const t = (key: MessageKey, params?: Params): string => translate(current, key, params)

/** Nombres compacts (« 1,2 k ») dans la langue courante */
export const compactNumber = (n: number): string =>
  new Intl.NumberFormat(localeOf(current), { notation: 'compact', maximumFractionDigits: 1 }).format(n)

/** « Mes réglages » est créé en français : son nom suit la langue tant qu'il n'a pas été renommé */
export const presetName = (p: Pick<SettingsPreset, 'id' | 'name'>): string =>
  p.id === 'main' && p.name === 'Mes réglages' ? t('presets.main') : p.name

/** Gigaoctets avec une décimale (« 4,5 Go » / « 4.5 GB ») */
export const gb = (mb: number, digits = 1): string =>
  t('common.gb', { n: new Intl.NumberFormat(localeOf(current), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(mb / 1024) })
