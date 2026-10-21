import { useState } from 'react'
import type { ModCheck } from '../../../shared/types'
import { t } from '../i18n'

interface Props {
  check: ModCheck
  profileName: string
  /** Réparer (ou désactiver les mods concernés) puis lancer ; « ignore » : lancer tel quel */
  onChoose: (action: 'fix' | 'disable' | 'ignore') => Promise<void>
  onClose: () => void
}

/** Mods qui en demandent d'autres, absents du profil : ce qu'Aloria propose avant de lancer le jeu */
export default function ModCheckDialog({ check, profileName, onChoose, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const choose = async (action: 'fix' | 'disable' | 'ignore') => {
    setBusy(true)
    await onChoose(action)
    setBusy(false)
  }

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="dialog modcheck" onClick={(e) => e.stopPropagation()}>
        <h3>{t('mods.title', { profile: profileName })}</h3>
        <p className="muted">{t('mods.hint')}</p>
        <div className="modcheck__list">
          {check.missing.map((m) => (
            <div key={m.id} className="modcheck__item">
              {m.fix.kind === 'install' && m.fix.iconUrl ? (
                <img src={m.fix.iconUrl} alt="" />
              ) : (
                <div className="result__noicon small">🧩</div>
              )}
              <div>
                <strong>{m.fix.kind === 'none' ? m.id : m.fix.title}</strong>
                <small className="muted">{t('mods.requiredBy', { mods: m.requiredBy.map((r) => r.title).join(', ') })}</small>
                <small className={m.fix.kind === 'none' ? 'modpack__warning' : 'modpack__done'}>
                  {m.fix.kind === 'install' ? t('mods.install') : m.fix.kind === 'enable' ? t('mods.enable') : t('mods.none')}
                </small>
              </div>
            </div>
          ))}
        </div>
        <div className="dialog__actions">
          <button className="secondary" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="secondary" disabled={busy} onClick={() => choose('ignore')}>
            {t('mods.ignore')}
          </button>
          <button className="secondary" disabled={busy} onClick={() => choose('disable')}>
            {t('mods.disable')}
          </button>
          <button className="primary" disabled={busy} onClick={() => choose('fix')}>
            {busy ? t('mods.fixing') : t('mods.fix')}
          </button>
        </div>
      </div>
    </div>
  )
}
