import { useRef, useState } from 'react'
import ProfileEditor from './ProfileEditor'
import ModpackDialog from './ModpackDialog'
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
  const [importing, setImporting] = useState(false)
  const [modpack, setModpack] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  // Profil exporté (Aloria, Prism, MultiMC) : il devient un nouveau profil ; modpack .mrpack : aperçu avant installation
  const importProfile = async (file: File | null) => {
    if (importing) return
    setImporting(true)
    const res = await window.aloria.profiles.importZip(file)
    setImporting(false)
    if (!res.ok) onError(res.error)
    else if (res.value && 'id' in res.value) {
      await profiles.refresh()
      profiles.select(res.value.id)
    } else if (res.value) setModpack(res.value.modpack)
  }
  const modpackInstalled = async (created: Profile) => {
    await profiles.refresh()
    profiles.select(created.id)
  }

  const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')
  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      dragDepth.current++
      setDragging(true)
    },
    onDragOver: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) importProfile(file)
    }
  }
  const s = settings.settings
  if (!s) return null
  const maxRamMb = Math.max(1024, Math.floor((settings.systemRamMb - 2048) / 512) * 512)

  return (
    <section className="page wide library" {...dropHandlers}>
      {modpack && <ModpackDialog target={{ file: modpack }} onClose={() => setModpack(null)} onInstalled={modpackInstalled} />}
      {dragging && (
        <div className="library__drop">
          <strong>📥 {t('profiles.drop')}</strong>
          <span>{t('profiles.dropHint')}</span>
        </div>
      )}
      <div className="library__header">
        <h2>{t('profiles.title')}</h2>
        <button className="secondary" disabled={importing} title={t('profiles.importHint')} onClick={() => importProfile(null)}>
          📥 {importing ? t('profiles.importing') : t('profiles.import')}
        </button>
      </div>
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
