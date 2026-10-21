import PlayButton, { RunningGames } from './PlayButton'
import { describeProfile } from '../hooks/useVersions'
import type { AccountsState } from '../hooks/useAccounts'
import type { ProfilesState } from '../hooks/useProfiles'
import type { useGame } from '../hooks/useGame'
import Select from './Select'
import QuickPlay from './QuickPlay'
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
              <PlayButton
                status={game.status}
                profileId={selected?.id ?? null}
                disabled={!selected || game.checking}
                onPlay={() => selected && game.play(selected.id)}
                onCancel={game.cancel}
                onStop={game.stop}
              />
              {/* On peut changer de profil pendant une partie, pour en lancer une autre en même temps */}
              {selected && game.status.launch?.profileId !== selected.id && (
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
              {/* Ouvrir directement un monde ou un serveur du profil choisi */}
              {selected && game.status.launch?.profileId !== selected.id && (
                <QuickPlay
                  profile={selected}
                  disabled={!!game.status.launch || game.status.running.some((r) => r.profileId === selected.id)}
                  onPlay={(target) => game.play(selected.id, target)}
                />
              )}
              <RunningGames status={game.status} exceptId={selected?.id ?? null} onStop={game.stop} />
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
