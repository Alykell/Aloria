import { fr } from './fr'
import { en } from './en'

export type Lang = 'fr' | 'en'
export type MessageKey = keyof typeof fr
export type Params = Record<string, string | number>

export const LANGS: Lang[] = ['en', 'fr']
export const LANG_NAMES: Record<Lang, string> = { en: 'English', fr: 'Français' }

const messages: Record<Lang, Record<MessageKey, string>> = { fr, en }

/** Langue proposée au premier lancement : le français pour un système en français, l'anglais sinon */
export const langFromLocale = (locale: string): Lang => (locale.toLowerCase().startsWith('fr') ? 'fr' : 'en')

/** Langue du jeu (options.txt) qui va avec celle du launcher */
export const gameLangOf = (lang: Lang): string => (lang === 'fr' ? 'fr_fr' : 'en_us')

/** Texte traduit ; `{nom}` est remplacé par params.nom */
export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const text = messages[lang][key] ?? fr[key]
  return params ? text.replace(/\{(\w+)\}/g, (all, name: string) => (name in params ? String(params[name]) : all)) : text
}

/** Locale des nombres et des dates */
export const localeOf = (lang: Lang): string => (lang === 'fr' ? 'fr-FR' : 'en-US')
