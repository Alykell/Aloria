import { app } from 'electron'
import { getSettings } from './settings'
import { langFromLocale, translate, type Lang, type MessageKey, type Params } from '../shared/i18n'

/** Langue du launcher ; avant le premier choix, celle du système */
export const currentLang = (): Lang => getSettings().language ?? langFromLocale(app.getLocale())

/** Texte traduit pour les messages du processus principal (erreurs, statut, Discord…) */
export const tm = (key: MessageKey, params?: Params): string => translate(currentLang(), key, params)
