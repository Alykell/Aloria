import { useEffect, useState } from 'react'
import PlayButton from './PlayButton'
import type { AccountsState } from '../hooks/useAccounts'
import type { SettingsState } from '../hooks/useSettings'
import type { useGame } from '../hooks/useGame'
import type { VersionEntry } from '../../../shared/types'

interface Props {
  accounts: AccountsState
  settings: SettingsState
  game: ReturnType<typeof useGame>
}

export default function HomePage({ accounts, settings: { settings, update }, game }: Props) {
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const showSnapshots = settings?.showSnapshots ?? false

  useEffect(() => {
    window.aloria.game.versions(showSnapshots).then((res) => {
      if (res.ok) setVersions(res.value)
    })
  }, [showSnapshots])

  // En développement, on peut tester le lancement en mode démo sans compte
  const canPlay = !!accounts.active || import.meta.env.DEV
  const latest = versions.find((v) => v.type === 'release')

  return (
    <section className="hero">
      <h1>{accounts.active ? `Salut ${accounts.active.name} !` : 'Bienvenue sur Aloria'}</h1>
      <p>Ton launcher Minecraft, entre ciel et océan.</p>

      {canPlay ? (
        <>
          <PlayButton status={game.status} disabled={!settings} onPlay={game.play} />
          {game.status.state === 'idle' && settings && (
            <select
              className="version-select"
              value={settings.versionId}
              onChange={(e) => update({ versionId: e.target.value })}
            >
              <option value="latest-release">Dernière version{latest ? ` (${latest.id})` : ''}</option>
              {showSnapshots && <option value="latest-snapshot">Dernier snapshot</option>}
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                  {v.type === 'snapshot' ? ' (snapshot)' : ''}
                </option>
              ))}
            </select>
          )}
          {!accounts.active && <small>Mode démo (test en développement) : connecte-toi pour jouer normalement</small>}
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
