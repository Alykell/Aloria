import { useEffect, useState } from 'react'
import SkinViewer from './SkinViewer'
import { COSMETIC_ICONS, COSMETIC_TEXTURES } from '../cosmetics'
import type { AccountsState } from '../hooks/useAccounts'
import type { Cosmetic, CosmeticSlot, CosmeticsState, Result } from '../../../shared/types'
import { getLang, t } from '../i18n'

interface Props {
  accounts: AccountsState
  onError: (message: string) => void
}

const hours = (minutes: number) => t('cosmetics.hours', { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') })

/** Comment l'obtenir : dates de l'événement, ou temps de jeu (avec la progression) */
function unlockText(c: Cosmetic, playMinutes: number): string {
  if (c.unlock.type === 'playtime') return t('cosmetics.playtime', { done: hours(Math.min(playMinutes, c.unlock.minutes)), total: hours(c.unlock.minutes) })
  const now = Date.now()
  const date = (iso: string) => new Date(iso).toLocaleDateString(getLang(), { day: 'numeric', month: 'long' })
  // Fin exclusive (minuit) : on affiche le dernier jour
  const lastDay = new Date(Date.parse(c.unlock.to) - 1).toISOString()
  if (now < Date.parse(c.unlock.from)) return t('cosmetics.eventSoon', { date: date(c.unlock.from) })
  if (now >= Date.parse(c.unlock.to)) return t('cosmetics.eventOver')
  return t('cosmetics.eventUntil', { date: date(lastDay) })
}

/**
 * Cosmétiques d'Aloria : capes et chapeaux vus par les joueurs d'Aloria en jeu (profils avec Aloria HUD).
 * Cliquer une carte l'essaie sur le skin, même verrouillée ; « Récupérer » quand elle est débloquée, puis « Équiper ».
 */
export default function CosmeticsPage({ accounts, onError }: Props) {
  const uuid = accounts.active?.uuid
  const [state, setState] = useState<CosmeticsState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Essai sur le skin : cosmétique cliqué, par emplacement (sinon celui équipé)
  const [trying, setTrying] = useState<Partial<Record<CosmeticSlot, string | null>>>({})

  useEffect(() => {
    setState(null)
    setLoadError(null)
    setTrying({})
    if (!uuid) return
    window.aloria.cosmetics.state().then((r) => (r.ok ? setState(r.value) : setLoadError(r.error)))
  }, [uuid])

  const run = async (id: string, action: () => Promise<Result<CosmeticsState>>) => {
    setBusy(id)
    const r = await action()
    setBusy(null)
    if (r.ok) {
      setState(r.value)
      setTrying({})
    } else onError(r.error)
  }

  if (!uuid) {
    return (
      <section className="page wide">
        <h2>{t('nav.cosmetics')}</h2>
        <p className="page__lead">{t('err.loginForCosmetics')}</p>
      </section>
    )
  }

  const shown = (slot: CosmeticSlot) => (slot in trying ? trying[slot] : state?.equipped[slot]) ?? null
  const capeId = shown('cape')
  const lang = getLang() === 'fr' ? 'fr' : 'en'

  return (
    <section className="page wide cosmetics">
      <h2>{t('nav.cosmetics')}</h2>
      <p className="page__lead">{t('cosmetics.lead')}</p>

      <div className="cosmetics__layout">
        <div className="cosmetics__preview">
          {/* Sans cape d'Aloria choisie : celle du compte Mojang */}
          <SkinViewer uuid={uuid} width={220} height={300} cape={capeId ? COSMETIC_TEXTURES[capeId] : undefined} hat={shown('hat')} />
          {Object.keys(trying).length > 0 && (
            <button className="secondary" onClick={() => setTrying({})}>
              {t('cosmetics.stopTrying')}
            </button>
          )}
          {state && <small className="muted">{t('cosmetics.played', { time: hours(state.playMinutes) })}</small>}
        </div>

        <div className="cosmetics__list">
          {!state && !loadError && <p className="muted">{t('cosmetics.loading')}</p>}
          {loadError && <p className="muted">{t('cosmetics.offline')}</p>}
          {state && <p className="muted cosmetics__hint">{t('cosmetics.tryHint')}</p>}
          {state?.cosmetics.map((c) => {
            const equipped = state.equipped[c.slot] === c.id
            const isTrying = trying[c.slot] === c.id
            const progress = c.unlock.type === 'playtime' && !c.owned ? Math.min(1, state.playMinutes / c.unlock.minutes) : null
            return (
              <div
                key={c.id}
                className={'cosmetic-card' + (isTrying ? ' trying' : '') + (equipped ? ' equipped' : '')}
                onClick={() => setTrying((prev) => ({ ...prev, [c.slot]: isTrying ? (state.equipped[c.slot] ?? null) : c.id }))}
              >
                <span className="cosmetic-card__icon">{COSMETIC_ICONS[c.id] ?? '✨'}</span>
                <div className="cosmetic-card__text">
                  <strong>{c.name[lang]}</strong>
                  <small className="muted">
                    {t(c.slot === 'cape' ? 'cosmetics.slotCape' : 'cosmetics.slotHat')} · {c.owned ? t('cosmetics.owned') : unlockText(c, state.playMinutes)}
                  </small>
                  {progress !== null && (
                    <div className="progress__bar cosmetic-card__progress">
                      <div className="progress__fill" style={{ width: `${progress * 100}%` }} />
                    </div>
                  )}
                </div>
                <div className="cosmetic-card__actions" onClick={(e) => e.stopPropagation()}>
                  {!c.owned && (
                    <button
                      className="primary"
                      disabled={!c.claimable || busy !== null}
                      title={c.claimable ? undefined : t('cosmetics.lockedHint')}
                      onClick={() => run(c.id, () => window.aloria.cosmetics.claim(c.id))}
                    >
                      {c.claimable ? t('cosmetics.claim') : `🔒 ${t('cosmetics.locked')}`}
                    </button>
                  )}
                  {c.owned && (
                    <button
                      className={equipped ? 'secondary' : 'primary'}
                      disabled={busy !== null}
                      onClick={() => run(c.id, () => window.aloria.cosmetics.equip(c.slot, equipped ? null : c.id))}
                    >
                      {equipped ? t('cosmetics.unequip') : t('cosmetics.equip')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {state && <p className="muted cosmetics__note">{t('cosmetics.note')}</p>}
        </div>
      </div>
    </section>
  )
}
