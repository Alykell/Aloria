import type { GameExit } from '../../../shared/types'
import { t } from '../i18n'

export default function CrashDialog({ exit, profileId, onClose }: { exit: GameExit; profileId: string | null; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{t('crash.title')}</h3>
        <p>{t('crash.code', { code: exit.code ?? t('crash.unknown') })}</p>
        {exit.crashLog && <pre>{exit.crashLog}</pre>}
        <div className="dialog__actions">
          {profileId && (
            <button className="secondary" onClick={() => window.aloria.profiles.openFolder(profileId)}>
              {t('crash.openFolder')}
            </button>
          )}
          <button className="primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
