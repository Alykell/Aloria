import { useEffect, useState } from 'react'
import { useVersions } from '../hooks/useVersions'
import { forgeSupported, neoforgeSupported } from '../../../shared/loaders'
import { e4mcSupported } from '../../../shared/aloriaHud'
import type { LoaderVersion, PlayitUsage, ServerInfo, ServerInput, ServerTunnel, ServerType } from '../../../shared/types'
import Select from './Select'
import { gb, t } from '../i18n'

const ICONS = ['🏰', '🌊', '🏝️', '⚔️', '🐉', '🌲', '⛏️', '🧱', '🔥', '💎', '🌙', '🐚']

export const SERVER_TYPE_LABELS: Record<ServerType, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  paper: 'Paper',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

/** e4mc est un mod (1.17 et plus) : seulement pour les serveurs qui chargent des mods (en 26.x, Fabric : voir e4mcSupported) */
export const supportsE4mc = (type: ServerType, gameVersion: string) => e4mcSupported(type, gameVersion)

interface Props {
  /** Serveur à modifier, ou null pour en créer un */
  server: ServerInfo | null
  defaultPort: number
  maxRamMb: number
  onSave: (input: ServerInput) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

export default function ServerEditor({ server, defaultPort, maxRamMb, onSave, onDelete, onClose }: Props) {
  const { versions, latestRelease } = useVersions(false)
  const [form, setForm] = useState<ServerInput>(
    server ?? {
      name: '',
      icon: '🏰',
      type: 'fabric',
      gameVersion: '',
      loaderVersion: null,
      ramMb: Math.min(4096, maxRamMb),
      port: defaultPort,
      tunnel: 'playit'
    }
  )
  const [eula, setEula] = useState(!!server)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loaders, setLoaders] = useState<LoaderVersion[] | null>(null)
  const [playit, setPlayit] = useState<PlayitUsage | null>(null)
  useEffect(() => {
    window.aloria.servers.playitUsage().then((res) => res.ok && setPlayit(res.value))
  }, [])
  const set = (patch: Partial<ServerInput>) => setForm((f) => ({ ...f, ...patch }))

  // Nouveau serveur : dernière version du jeu par défaut
  useEffect(() => {
    if (!form.gameVersion && latestRelease) set({ gameVersion: latestRelease })
  }, [latestRelease])

  const version = form.gameVersion
  const types: ServerType[] = ['fabric', 'vanilla', 'paper', 'neoforge', 'forge']
  const typeAvailable = (type: ServerType, v = version) =>
    !v || (type === 'neoforge' ? neoforgeSupported(v) : type === 'forge' ? forgeSupported(v) : true)

  // Fabric, Forge, NeoForge : la version du chargeur doit exister pour cette version du jeu
  useEffect(() => {
    if (!version || form.type === 'vanilla' || form.type === 'paper') {
      setLoaders(null)
      return
    }
    setLoaders(null)
    const list =
      form.type === 'forge'
        ? window.aloria.game.forgeLoaders(version)
        : form.type === 'neoforge'
          ? window.aloria.game.neoforgeLoaders(version)
          : window.aloria.game.fabricLoaders(version)
    let current = true
    list.then((res) => current && setLoaders(res.ok ? res.value : []))
    return () => {
      current = false
    }
  }, [form.type, version])

  // playit.gg par défaut (recommandé : marche partout, adresse fixe et adresse en .aloriamc.fr) ; e4mc reste au choix
  // tant que le type et la version le permettent
  const tunnelFor = (tunnel: ServerTunnel, type: ServerType, gameVersion: string): ServerTunnel =>
    tunnel === 'e4mc' && !supportsE4mc(type, gameVersion) ? 'playit' : tunnel
  const chooseType = (type: ServerType) => set({ type, loaderVersion: null, tunnel: tunnelFor(form.tunnel, type, version) })
  const loaderUnavailable = loaders !== null && loaders.length === 0
  const canSave = form.name.trim().length > 0 && !!version && eula && !loaderUnavailable && !saving

  const save = async () => {
    setSaving(true)
    await onSave({ ...form, name: form.name.trim() })
    setSaving(false)
  }

  // Compte gratuit de playit.gg : 4 adresses ; plein, playit.gg est grisé (sauf pour un serveur qui a déjà la sienne)
  const playitFull = !!playit?.linked && playit.used >= playit.max && !(server && playit.serverIds.includes(server.id))
  const tunnels: { id: ServerTunnel; label: string; hint: string; disabled?: boolean; recommended?: boolean }[] = [
    {
      id: 'playit',
      label: t('server.tunnel.playit'),
      recommended: true,
      hint: playitFull
        ? t('server.tunnel.playitFull', { used: playit!.used, max: playit!.max })
        : playit?.linked
          ? t('server.tunnel.playitUsage', { used: playit.used, max: playit.max })
          : t('server.tunnel.playitHint'),
      disabled: playitFull
    },
    { id: 'e4mc', label: t('server.tunnel.e4mc'), hint: t('server.tunnel.e4mcHint'), disabled: !supportsE4mc(form.type, version) },
    { id: 'none', label: t('server.tunnel.none'), hint: t('server.tunnel.noneHint') }
  ]

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog editor" onClick={(e) => e.stopPropagation()}>
        <h3>{server ? t('server.editTitle') : t('server.new')}</h3>

        <div className="field">
          <span>{t('editor.icon')}</span>
          <div className="icon-picker">
            {ICONS.map((icon) => (
              <button key={icon} className={form.icon === icon ? 'active' : ''} onClick={() => set({ icon })}>
                {icon}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>{t('editor.name')}</span>
          <input
            autoFocus
            value={form.name}
            maxLength={32}
            placeholder={t('server.namePlaceholder')}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>

        <div className="field">
          <span>{t('editor.version')}</span>
          <Select
            name="server-version"
            value={version}
            onChange={(v) => {
              const type = typeAvailable(form.type, v) ? form.type : 'fabric'
              set({
                gameVersion: v,
                loaderVersion: null,
                type,
                tunnel: tunnelFor(form.tunnel, type, v)
              })
            }}
            options={versions.filter((v) => v.type === 'release').map((v) => ({ value: v.id, label: v.id }))}
          />
          {server && server.installed && version !== server.installed.gameVersion && (
            <small className="warning">{t('server.versionChangeWarning')}</small>
          )}
        </div>

        <div className="field">
          <span>{t('server.type')}</span>
          <div className="segmented">
            {types
              .filter((type) => typeAvailable(type) || form.type === type)
              .map((type) => (
                <button key={type} disabled={!!server} className={form.type === type ? 'active' : ''} onClick={() => chooseType(type)}>
                  {SERVER_TYPE_LABELS[type]}
                </button>
              ))}
          </div>
          <small className="muted">{t(`server.typeHint.${form.type}`)}</small>
          {loaderUnavailable && (
            <small className="warning">{t('server.loaderUnavailable', { loader: SERVER_TYPE_LABELS[form.type], version })}</small>
          )}
        </div>

        <div className="field">
          <span>{t('server.memory')}</span>
          <div className="slider-line">
            <input
              type="range"
              className="slider"
              min={1024}
              max={maxRamMb}
              step={512}
              value={Math.min(form.ramMb, maxRamMb)}
              onChange={(e) => set({ ramMb: Number(e.target.value) })}
            />
            <strong>{gb(form.ramMb)}</strong>
          </div>
        </div>

        <div className="field">
          <span>{t('server.tunnel')}</span>
          <div className="choice-cards">
            {tunnels.map((tn) => (
              <button
                key={tn.id}
                type="button"
                disabled={tn.disabled}
                className={'choice-card' + (form.tunnel === tn.id && !tn.disabled ? ' active' : '')}
                onClick={() => set({ tunnel: tn.id })}
              >
                <strong>
                  {tn.label}
                  {tn.recommended && <span className="choice-card__tag">{t('server.tunnel.recommended')}</span>}
                </strong>
                <small>{tn.hint}</small>
              </button>
            ))}
          </div>
          {form.tunnel === 'playit' && playit && !playit.linked && <small className="muted">{t('server.tunnel.playitLinkNext')}</small>}
        </div>

        <label className="field">
          <span>{t('server.port')}</span>
          <input
            type="number"
            min={1024}
            max={65535}
            value={form.port}
            onChange={(e) => set({ port: Math.max(1024, Math.min(65535, Number(e.target.value) || 25565)) })}
          />
        </label>

        {!server && (
          <label className="toggle-line">
            <input type="checkbox" checked={eula} onChange={(e) => setEula(e.target.checked)} />
            <span>
              {t('server.eula')}{' '}
              <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer">
                {t('server.eulaLink')}
              </a>
            </span>
          </label>
        )}

        <div className="dialog__actions">
          {server && onDelete && (
            <div className="dialog__danger">
              {confirmDelete ? (
                <>
                  <button className="danger-btn" onClick={onDelete}>
                    {t('server.deleteConfirm')}
                  </button>
                  <button className="secondary" onClick={() => setConfirmDelete(false)}>
                    {t('common.cancel')}
                  </button>
                </>
              ) : (
                <button className="link-danger" onClick={() => setConfirmDelete(true)}>
                  {t('server.delete')}
                </button>
              )}
            </div>
          )}
          <button className="secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="primary" disabled={!canSave} onClick={save}>
            {saving ? t('common.loading') : server ? t('common.save') : t('server.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
