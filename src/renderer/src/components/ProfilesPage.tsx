import { useState } from 'react'
import ProfileEditor from './ProfileEditor'
import { describeProfile } from '../hooks/useVersions'
import type { ProfilesState } from '../hooks/useProfiles'
import type { SettingsState } from '../hooks/useSettings'
import type { Profile } from '../../../shared/types'
import { t } from '../i18n'

function lastPlayed(ts: number | null): string {
  if (!ts) return t('profiles.neverPlayed')
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  if (days === 0) return t('profiles.playedToday')
  if (days === 1) return t('profiles.playedYesterday')
  return t('profiles.playedDaysAgo', { n: days })
}

interface Props {
  profiles: ProfilesState
  settings: SettingsState
  onPlay: (id: string) => void
  onError: (message: string) => void
}

export default function ProfilesPage({ profiles, settings, onPlay, onError }: Props) {
  // undefined = fermé, null = création, Profile = modification
  const [editing, setEditing] = useState<Profile | null | undefined>(undefined)
  const s = settings.settings
  if (!s) return null
  const maxRamMb = Math.max(1024, Math.floor((settings.systemRamMb - 2048) / 512) * 512)

  return (
    <section className="page wide">
      <h2>{t('profiles.title')}</h2>
      <p className="muted">{t('profiles.intro')}</p>

      <div className="profile-grid">
        {profiles.profiles.map((p) => (
          <div
            key={p.id}
            className={'profile-card' + (profiles.selected?.id === p.id ? ' selected' : '')}
            onClick={() => profiles.select(p.id)}
          >
            <span className="profile-card__icon">{p.icon}</span>
            <strong>{p.name}</strong>
            <span className="profile-card__version">{describeProfile(p)}</span>
            <small>{lastPlayed(p.lastPlayed)}</small>
            <div className="profile-card__actions">
              <button
                className="primary"
                onClick={(e) => {
                  e.stopPropagation()
                  profiles.select(p.id)
                  onPlay(p.id)
                }}
              >
                {t('common.play')}
              </button>
              <button
                className="secondary"
                aria-label={t('profiles.edit')}
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(p)
                }}
              >
                ✎
              </button>
            </div>
          </div>
        ))}
        <button className="profile-card new" onClick={() => setEditing(null)}>
          <span className="profile-card__icon">＋</span>
          <strong>{t('profiles.new')}</strong>
        </button>
      </div>

      {editing !== undefined && (
        <ProfileEditor
          profile={editing}
          showSnapshots={s.showSnapshots}
          defaultRamMb={s.ramMb}
          maxRamMb={maxRamMb}
          onClose={() => setEditing(undefined)}
          onSave={async (input) => {
            if (editing) await profiles.update(editing.id, input)
            else await profiles.create(input)
            setEditing(undefined)
          }}
          onDelete={async (deleteFiles) => {
            if (!editing) return
            const res = await profiles.remove(editing.id, deleteFiles)
            if (!res.ok) onError(res.error)
            setEditing(undefined)
          }}
        />
      )}
    </section>
  )
}
