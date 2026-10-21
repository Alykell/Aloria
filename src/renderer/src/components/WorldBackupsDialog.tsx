import { useEffect, useState } from 'react'
import type { WorldBackupKind, WorldBackups } from '../../../shared/types'
import type { MessageKey } from '../../../shared/i18n'
import { t } from '../i18n'

const KINDS: Record<WorldBackupKind, MessageKey> = {
  auto: 'worlds.kind.auto',
  manual: 'worlds.kind.manual',
  version: 'worlds.kind.version',
  restore: 'worlds.kind.restore'
}

/** Mondes solo d'un profil et leurs sauvegardes : sauvegarder, restaurer, supprimer ; sauvegarde automatique après une partie */
export default function WorldBackupsDialog({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const [worlds, setWorlds] = useState<WorldBackups[] | null>(null)
  const [auto, setAuto] = useState(true)
  // Action en cours (« backup:<monde> », « restore:<monde>/<fichier> »), restauration à confirmer, message
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const refresh = async () => {
    const res = await window.aloria.worlds.backups(profileId)
    if (res.ok) setWorlds(res.value)
    else setMessage({ ok: false, text: res.error })
  }
  useEffect(() => {
    refresh()
    window.aloria.settings.get().then(({ settings }) => setAuto(settings.worldBackups !== false))
  }, [profileId])

  const run = async (key: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string) => {
    setBusy(key)
    setMessage(null)
    const res = await action()
    setBusy(null)
    setConfirm(null)
    setMessage(res.ok ? (success ? { ok: true, text: success } : null) : { ok: false, text: res.error })
    await refresh()
  }

  const toggleAuto = async (on: boolean) => {
    setAuto(on)
    await window.aloria.settings.update({ worldBackups: on })
  }

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="dialog editor" onClick={(e) => e.stopPropagation()}>
        <h3>💾 {t('worlds.title')}</h3>
        <label className="toggle-line">
          <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} />
          <span>
            {t('worlds.auto')} <small className="muted">{t('worlds.autoHint')}</small>
          </span>
        </label>
        {message && <p className={message.ok ? 'modpack__done' : 'modpack__warning'}>{message.ok ? '✓' : '⚠️'} {message.text}</p>}
        {!worlds && <p className="muted center">{t('common.loading')}</p>}
        {worlds?.length === 0 && <p className="muted center">{t('worlds.empty')}</p>}
        {worlds?.map((w) => (
          <div key={w.world} className="export-box">
            <div className="worlds__head">
              <strong>
                {w.name}
                {!w.exists && <span className="chip">{t('worlds.deleted')}</span>}
              </strong>
              <div className="export-box__actions">
                <button className="secondary" title={t('common.openFolder')} onClick={() => window.aloria.worlds.openBackups(profileId, w.world)}>
                  📂
                </button>
                {w.exists && (
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => run(`backup:${w.world}`, () => window.aloria.worlds.backup(profileId, w.world))}
                  >
                    {busy === `backup:${w.world}` ? t('worlds.backingUp') : t('worlds.backupNow')}
                  </button>
                )}
              </div>
            </div>
            {w.backups.length === 0 && <small className="muted">{t('worlds.none')}</small>}
            {w.backups.map((b) => {
              const key = `${w.world}/${b.file}`
              return (
                <div key={b.file} className="worlds__backup">
                  <span>
                    {new Date(b.date).toLocaleString()} <small className="muted">· {t(KINDS[b.kind])} · {t('worlds.size', { n: b.sizeMb > 0 ? b.sizeMb.toLocaleString() : `< ${(0.1).toLocaleString()}` })}</small>
                  </span>
                  <div className="export-box__actions">
                    <button
                      className={confirm === key ? 'primary' : 'secondary'}
                      disabled={!!busy}
                      onClick={() =>
                        // Un monde qui existe encore est remplacé : second clic pour confirmer
                        w.exists && confirm !== key
                          ? setConfirm(key)
                          : run(`restore:${key}`, () => window.aloria.worlds.restore(profileId, w.world, b.file), t('worlds.restored', { name: w.name }))
                      }
                    >
                      {busy === `restore:${key}` ? t('worlds.restoring') : confirm === key ? t('worlds.confirmRestore') : t('worlds.restore')}
                    </button>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      aria-label={t('common.delete')}
                      onClick={() => run(`delete:${key}`, () => window.aloria.worlds.deleteBackup(profileId, w.world, b.file))}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div className="dialog__actions">
          <button className="primary" disabled={!!busy} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
