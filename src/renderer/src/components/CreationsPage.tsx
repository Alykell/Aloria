import { useCallback, useEffect, useState } from 'react'
import PackEditor from './PackEditor'
import type { ProfilesState } from '../hooks/useProfiles'
import type { PackInfo } from '../../../shared/types'
import { t } from '../i18n'

interface Props {
  profiles: ProfilesState
  onError: (message: string) => void
}

/** « Créations » : les packs de ressources faits dans Aloria (viseur, hotbar, totem), et leur éditeur */
export default function CreationsPage({ profiles, onError }: Props) {
  const [packs, setPacks] = useState<PackInfo[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const refresh = useCallback(async () => {
    const res = await window.aloria.packs.list()
    if (res.ok) setPacks(res.value)
    else onError(res.error)
  }, [onError])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = async () => {
    const res = await window.aloria.packs.create(name)
    if (!res.ok) return onError(res.error)
    setCreating(false)
    setName('')
    await refresh()
    setEditing(res.value.id)
  }

  const remove = async (pack: PackInfo) => {
    if (!confirm(t('creations.confirmDelete', { name: pack.name }))) return
    const res = await window.aloria.packs.remove(pack.id)
    if (!res.ok) onError(res.error)
    refresh()
  }

  const pack = packs?.find((p) => p.id === editing)
  if (pack) {
    return (
      <PackEditor
        pack={pack}
        profiles={profiles}
        onBack={() => {
          setEditing(null)
          refresh()
        }}
        onChanged={(next) => setPacks((list) => list?.map((p) => (p.id === next.id ? next : p)) ?? null)}
        onError={onError}
      />
    )
  }

  return (
    <section className="page wide creations">
      <h2>{t('nav.creations')}</h2>
      <p className="page__lead">{t('creations.lead')}</p>

      <div className="pack-grid">
        <button className="pack-card pack-card--new" onClick={() => setCreating(true)}>
          <span className="pack-card__plus">+</span>
          <strong>{t('creations.create')}</strong>
        </button>
        {packs?.map((p) => (
          <div key={p.id} className="pack-card" onClick={() => setEditing(p.id)}>
            <div className="pack-card__preview">
              {p.images.crosshair ? <img src={p.images.crosshair} alt="" className="pixel" /> : <span>🎨</span>}
            </div>
            <strong>{p.name}</strong>
            <small className="muted">
              {t(Object.keys(p.images).length > 1 ? 'creations.changedMany' : 'creations.changedOne', { n: Object.keys(p.images).length })}
            </small>
            <button
              className="pack-card__delete"
              title={t('common.delete')}
              onClick={(e) => {
                e.stopPropagation()
                remove(p)
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {creating && (
        <div className="overlay" onClick={() => setCreating(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{t('creations.newPack')}</h3>
            <label className="field">
              <span>{t('editor.name')}</span>
              <input
                autoFocus
                placeholder={t('creations.namePlaceholder')}
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
            </label>
            <div className="dialog__actions">
              <button onClick={() => setCreating(false)}>{t('common.cancel')}</button>
              <button className="primary" onClick={create}>
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
