import PlayButton from './PlayButton'
import { describeProfile } from '../hooks/useVersions'
import type { AccountsState } from '../hooks/useAccounts'
import type { ProfilesState } from '../hooks/useProfiles'
import type { useGame } from '../hooks/useGame'
import Select from './Select'
import SkinViewer from './SkinViewer'
import { t } from '../i18n'

interface Props {
  accounts: AccountsState
  profiles: ProfilesState
  game: ReturnType<typeof useGame>
  onSkin: () => void
}

export default function HomePage({ accounts, profiles, game, onSkin }: Props) {
  const canPlay = !!accounts.active
  const selected = profiles.selected

  return (
    <section className="hero">
      <div className="hero__row">
        {accounts.active && (
          <div className="hero__skin">
            <SkinViewer uuid={accounts.active.uuid} width={150} height={205} />
            <button className="skin-change" onClick={onSkin}>
              {t('home.changeSkin')}
            </button>
          </div>
        )}
        <div className="hero__main">
          <h1>{accounts.active ? t('home.hello', { name: accounts.active.name }) : t('home.welcome')}</h1>
          <p>{t('home.tagline')}</p>

          {canPlay ? (
            <>
              <PlayButton status={game.status} disabled={!selected} onPlay={() => selected && game.play(selected.id)} />
              {game.status.state === 'idle' && selected && (
                <Select
                  className="version-select"
                  value={selected.id}
                  onChange={(v) => profiles.select(v)}
                  options={profiles.profiles.map((p) => ({
                    value: p.id,
                    label: `${p.icon} ${p.name} · ${describeProfile(p)}`
                  }))}
                />
              )}
            </>
          ) : (
            <>
              <button className="play" onClick={accounts.add} disabled={accounts.busy}>
                {accounts.busy ? t('common.connecting') : t('common.login')}
              </button>
              <small>{t('home.loginHint')}</small>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
