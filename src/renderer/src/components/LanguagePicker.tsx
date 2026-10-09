import { useState } from 'react'
import { LANG_NAMES, LANGS, langFromLocale, translate, type Lang } from '../../../shared/i18n'

/** Premier lancement : choix de la langue, celle du système présélectionnée */
export default function LanguagePicker({ onChoose }: { onChoose: (lang: Lang) => void }) {
  const [lang, setLang] = useState<Lang>(langFromLocale(navigator.language))

  return (
    <div className="overlay">
      <div className="dialog language-picker">
        <h3>{translate(lang, 'language.title')}</h3>
        <div className="segmented">
          {LANGS.map((l) => (
            <button key={l} className={lang === l ? 'active' : ''} onClick={() => setLang(l)}>
              {LANG_NAMES[l]}
            </button>
          ))}
        </div>
        <p className="muted">{translate(lang, 'language.hint')}</p>
        <div className="dialog__actions">
          <button className="primary" onClick={() => onChoose(lang)}>
            {translate(lang, 'language.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
