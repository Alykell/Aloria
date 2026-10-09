import type { ContentType, InstalledContent } from '../../../shared/types'
import type { MessageKey } from '../../../shared/i18n'
import { t } from '../i18n'

const SECTIONS: { type: ContentType; label: MessageKey; icon: string }[] = [
  { type: 'mod', label: 'library.tabMods', icon: '🧩' },
  { type: 'resourcepack', label: 'library.tabResourcepacks', icon: '🎨' },
  { type: 'shader', label: 'library.tabShaders', icon: '✨' }
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
                {section.icon} {t(section.label)} <span className="muted">({list.length})</span>
              </h3>
              <button className="secondary" onClick={() => window.aloria.library.openFolder(profileId, section.type)}>
                {t('common.openFolder')}
              </button>
            </div>
            {list.length === 0 ? (
              <p className="muted">{t('library.nothing')}</p>
            ) : (
              list.map((item) => (
                <div key={item.fileName} className={'installed__row' + (item.enabled ? '' : ' disabled')}>
                  {item.iconUrl ? <img src={item.iconUrl} alt="" /> : <div className="result__noicon small">{section.icon}</div>}
                  <div className="installed__info">
                    <strong>{item.title}</strong>
                    <small className="muted">
                      {item.versionNumber ?? (item.projectId ? '' : t('library.manual'))}
                      {item.auto && <span className="chip">{t('library.dependency')}</span>}
                    </small>
                  </div>
                  <label className="switch" title={item.enabled ? t('library.disable') : t('library.enable')}>
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(e) => act(window.aloria.library.toggle(profileId, item.type, item.fileName, e.target.checked))}
                    />
                    <span />
                  </label>
                  <button
                    className="icon-btn"
                    aria-label={t('common.delete')}
                    title={t('common.delete')}
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
