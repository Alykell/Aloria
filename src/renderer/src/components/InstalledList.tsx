import type { ContentType, InstalledContent } from '../../../shared/types'

const SECTIONS: { type: ContentType; label: string; icon: string }[] = [
  { type: 'mod', label: 'Mods', icon: '🧩' },
  { type: 'resourcepack', label: 'Resource packs', icon: '🎨' },
  { type: 'shader', label: 'Shaders', icon: '✨' }
]

interface Props {
  profileId: string
  items: InstalledContent[]
  onChanged: () => void
  onError: (message: string) => void
}

export default function InstalledList({ profileId, items, onChanged, onError }: Props) {
  const act = async (action: Promise<{ ok: boolean; error?: string }>) => {
    const res = await action
    if (!res.ok && res.error) onError(res.error)
    onChanged()
  }

  return (
    <div className="installed">
      {SECTIONS.map((section) => {
        const list = items.filter((i) => i.type === section.type)
        return (
          <div key={section.type} className="installed__section">
            <div className="installed__head">
              <h3>
                {section.icon} {section.label} <span className="muted">({list.length})</span>
              </h3>
              <button className="secondary" onClick={() => window.aloria.library.openFolder(profileId, section.type)}>
                Ouvrir le dossier
              </button>
            </div>
            {list.length === 0 ? (
              <p className="muted">Rien d'installé pour l'instant.</p>
            ) : (
              list.map((item) => (
                <div key={item.fileName} className={'installed__row' + (item.enabled ? '' : ' disabled')}>
                  {item.iconUrl ? <img src={item.iconUrl} alt="" /> : <div className="result__noicon small">{section.icon}</div>}
                  <div className="installed__info">
                    <strong>{item.title}</strong>
                    <small className="muted">
                      {item.versionNumber ?? (item.projectId ? '' : 'Ajouté à la main')}
                      {item.auto && <span className="chip">dépendance</span>}
                    </small>
                  </div>
                  <label className="switch" title={item.enabled ? 'Désactiver' : 'Activer'}>
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(e) => act(window.aloria.library.toggle(profileId, item.type, item.fileName, e.target.checked))}
                    />
                    <span />
                  </label>
                  <button
                    className="icon-btn"
                    aria-label="Supprimer"
                    title="Supprimer"
                    onClick={() => act(window.aloria.library.remove(profileId, item.type, item.fileName))}
                  >
                    🗑
                  </button>
                </div>
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}
