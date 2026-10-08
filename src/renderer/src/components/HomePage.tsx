import PlayButton from './PlayButton'
import { describeProfile } from '../hooks/useVersions'
import type { AccountsState } from '../hooks/useAccounts'
import type { ProfilesState } from '../hooks/useProfiles'
import type { useGame } from '../hooks/useGame'
import Select from './Select'

interface Props {
  accounts: AccountsState
  profiles: ProfilesState
  game: ReturnType<typeof useGame>
}

export default function HomePage({ accounts, profiles, game }: Props) {
  const canPlay = !!accounts.active
  const selected = profiles.selected

  return (
    <section className="hero">
      <h1>{accounts.active ? `Salut ${accounts.active.name} !` : 'Bienvenue sur Aloria'}</h1>
      <p>Ton launcher Minecraft, entre ciel et océan.</p>

      {canPlay ? (
        <>
          <PlayButton status={game.status} disabled={!selected} onPlay={() => selected && game.play(selected.id)} />
          {game.status.state === 'idle' && selected && (
            <Select
              className="version-select"
              value={selected.id}
              onChange={(v) => profiles.select(v)}
              options={profiles.profiles.map((p) => ({ value: p.id, label: `${p.icon} ${p.name} · ${describeProfile(p)}` }))}
            />
          )}
        </>
      ) : (
        <>
          <button className="play" onClick={accounts.add} disabled={accounts.busy}>
            {accounts.busy ? 'Connexion…' : 'Se connecter'}
          </button>
          <small>Connecte-toi avec ton compte Microsoft</small>
        </>
      )}
    </section>
  )
}
