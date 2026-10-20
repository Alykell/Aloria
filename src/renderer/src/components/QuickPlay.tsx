import { useEffect, useState } from 'react'
import type { JoinTarget, LocalWorld, Profile, SavedServer } from '../../../shared/types'
import { supportsQuickPlay } from '../../../shared/loaders'
import { getLang, t } from '../i18n'
import type { MessageKey } from '../../../shared/i18n'

type Kind = 'solo' | 'multi'

/** Les profils « dernière version » ouvrent toujours un monde directement */
const quickPlayable = (p: Profile) => p.versionId.startsWith('latest') || supportsQuickPlay(p.versionId)

/** Boutons Solo / Multijoueur sous le choix du profil : ouvrent la liste des mondes ou des serveurs du profil */
export default function QuickPlay({ profile, disabled, onPlay }: { profile: Profile; disabled: boolean; onPlay: (target: JoinTarget) => void }) {
  const [open, setOpen] = useState<Kind | null>(null)
  const soloOk = quickPlayable(profile)

  return (
    <>
      <div className="quick-play">
        <button className="quick-play__btn" disabled={disabled || !soloOk} title={soloOk ? undefined : t('quick.soloOld')} onClick={() => setOpen('solo')}>
          {t('quick.solo')}
        </button>
        <button className="quick-play__btn" disabled={disabled} onClick={() => setOpen('multi')}>
          {t('quick.multi')}
        </button>
      </div>
      {open === 'solo' && (
        <WorldsDialog
          profile={profile}
          onClose={() => setOpen(null)}
          onPick={(w) => {
            setOpen(null)
            onPlay({ world: w.id })
          }}
        />
      )}
      {open === 'multi' && (
        <ServersDialog
          profile={profile}
          onClose={() => setOpen(null)}
          onPick={(target) => {
            setOpen(null)
            onPlay(target)
          }}
        />
      )}
    </>
  )
}

function WorldsDialog({ profile, onClose, onPick }: { profile: Profile; onClose: () => void; onPick: (w: LocalWorld) => void }) {
  const [worlds, setWorlds] = useState<LocalWorld[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.aloria.quick.worlds(profile.id).then((res) => (res.ok ? setWorlds(res.value) : setError(res.error)))
  }, [profile.id])

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog quick-list" onClick={(e) => e.stopPropagation()}>
        <h3>{t('quick.worldsTitle', { profile: profile.name })}</h3>
        {error && <p className="danger-text">{error}</p>}
        {!worlds && !error && <p className="muted">{t('common.loading')}</p>}
        {worlds?.length === 0 && <p className="muted">{t('quick.noWorlds')}</p>}
        <div className="quick-list__items">
          {worlds?.map((w) => (
            <button key={w.id} className="quick-item" onClick={() => onPick(w)}>
              {w.icon ? <img src={w.icon} alt="" /> : <span className="quick-item__icon">🌍</span>}
              <span className="quick-item__text">
                <strong>{w.name}</strong>
                <small className="muted">
                  {t(`quick.mode.${w.mode}` as MessageKey)}
                  {w.lastPlayed > 0 && ` · ${t('quick.lastPlayed', { date: new Date(w.lastPlayed).toLocaleDateString(getLang()) })}`}
                </small>
              </span>
              <span className="quick-item__go">▶</span>
            </button>
          ))}
        </div>
        <div className="dialog__actions">
          <button className="secondary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ServersDialog({ profile, onClose, onPick }: { profile: Profile; onClose: () => void; onPick: (target: JoinTarget) => void }) {
  const [servers, setServers] = useState<SavedServer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Serveur en cours de modification ; « new » : ajout
  const [editing, setEditing] = useState<SavedServer | 'new' | null>(null)

  const load = () => window.aloria.quick.servers(profile.id).then((res) => (res.ok ? setServers(res.value) : setError(res.error)))
  useEffect(() => {
    load()
  }, [profile.id])

  const join = (s: SavedServer) => {
    const m = /^(.*):(\d+)$/.exec(s.address.trim())
    onPick(m ? { host: m[1], port: Number(m[2]) } : { host: s.address.trim(), port: 25565 })
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog quick-list" onClick={(e) => e.stopPropagation()}>
        <h3>{t('quick.serversTitle', { profile: profile.name })}</h3>
        {profile.shareServers !== false && <small className="muted">{t('quick.shared')}</small>}
        {error && <p className="danger-text">{error}</p>}
        {!servers && !error && <p className="muted">{t('common.loading')}</p>}
        {servers?.length === 0 && <p className="muted">{t('quick.noServers')}</p>}
        <div className="quick-list__items">
          {servers?.map((s) => (
            <div key={`${s.index}-${s.address}`} className="quick-item" role="button" onClick={() => join(s)}>
              {s.icon ? <img src={s.icon} alt="" /> : <span className="quick-item__icon">🖥️</span>}
              <span className="quick-item__text">
                <strong>{s.name}</strong>
                <small className="muted">
                  {s.address}
                  {s.autoLogin && <span className="quick-item__badge">{t('quick.autoLoginBadge')}</span>}
                </small>
              </span>
              <button
                className="quick-item__gear"
                title={t('quick.settings')}
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(s)
                }}
              >
                ⚙️
              </button>
              <span className="quick-item__go">▶</span>
            </div>
          ))}
        </div>
        <div className="dialog__actions">
          <button className="secondary" onClick={() => setEditing('new')}>
            {t('quick.addServer')}
          </button>
          <button className="secondary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
      {editing && (
        <ServerSettings
          profile={profile}
          server={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

/** Nom, adresse et connexion automatique d'un serveur ; `server` null : nouveau serveur */
function ServerSettings({ profile, server, onClose, onSaved }: { profile: Profile; server: SavedServer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(server?.name ?? '')
  const [address, setAddress] = useState(server?.address ?? '')
  const [autoLogin, setAutoLogin] = useState(server?.autoLogin ?? false)
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    setError(null)
    const res = await action()
    setBusy(false)
    if (res.ok) onSaved()
    else setError(res.error ?? null)
  }

  const save = () =>
    run(() => window.aloria.quick.saveServer(profile.id, server?.index ?? null, server?.address ?? null, { name, address, autoLogin, password }))

  const remove = () => {
    if (!server || !confirm(t('quick.deleteConfirm', { name: server.name }))) return
    run(() => window.aloria.quick.deleteServer(profile.id, server.index, server.address))
  }

  return (
    <div className="overlay" onClick={(e) => (e.stopPropagation(), onClose())}>
      <div className="dialog editor" onClick={(e) => e.stopPropagation()}>
        <h3>{server ? t('quick.editTitle') : t('quick.newTitle')}</h3>
        <label className="field">
          <span>{t('quick.name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Minecraft Server" />
        </label>
        <label className="field">
          <span>{t('quick.address')}</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="play.exemple.fr" />
        </label>

        <label className="toggle-line">
          <input type="checkbox" checked={autoLogin} onChange={(e) => setAutoLogin(e.target.checked)} />
          <span>{t('quick.autoLogin')}</span>
        </label>
        <small className="muted">{t('quick.autoLoginHint')}</small>
        {autoLogin && (
          <>
            <label className="field">
              <span>{t('quick.password')}</span>
              <div className="password-input">
                <input
                  type={shown ? 'text' : 'password'}
                  value={password}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={server?.autoLogin ? t('quick.passwordSaved') : ''}
                />
                <button type="button" className="secondary small" onClick={() => setShown(!shown)}>
                  {shown ? t('quick.hide') : t('quick.show')}
                </button>
              </div>
            </label>
            <small className="muted">{t('quick.passwordSafe')}</small>
            <small className="muted">{t('quick.autoLoginNeedsHud')}</small>
          </>
        )}

        {error && <p className="danger-text">{error}</p>}
        <div className="dialog__actions">
          {server && (
            <div className="dialog__danger">
              <button className="secondary danger" disabled={busy} onClick={remove}>
                {t('common.delete')}
              </button>
            </div>
          )}
          <button className="secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="primary" disabled={busy} onClick={save}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
