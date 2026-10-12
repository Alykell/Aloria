import { useCallback, useEffect, useState } from 'react'
import Select from './Select'
import type { ServerBackup, ServerContent, ServerContentHit, ServerInfo, ServerPlayerAction, ServerPlayers } from '../../../shared/types'
import { compactNumber, t } from '../i18n'

/** Onglets du panneau d'un serveur, à côté de la console : joueurs, réglages, mods ou plugins */

interface TabProps {
  server: ServerInfo
  /** Serveur allumé (ou en train de démarrer) */
  alive: boolean
  onError: (message: string) => void
}

const head = (name: string) => `https://mc-heads.net/avatar/${encodeURIComponent(name)}/24`

// ---------------------------------------------------------------- joueurs

export function PlayersTab({ server, alive, online, onError }: TabProps & { online: string[] }) {
  const [players, setPlayers] = useState<ServerPlayers | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const res = await window.aloria.servers.players(server.id)
    if (res.ok) setPlayers(res.value)
  }, [server.id])
  // Les listes changent aussi quand quelqu'un se connecte ou utilise une commande en jeu
  useEffect(() => {
    refresh()
  }, [refresh, online.join()])

  const act = async (action: ServerPlayerAction, who: string) => {
    setBusy(true)
    const res = await window.aloria.servers.player(server.id, action, who)
    setBusy(false)
    if (!res.ok) onError(res.error)
    else if (action === 'whitelist-add' || action === 'op' || action === 'ban') setName('')
    refresh()
  }
  const toggleWhitelist = async () => {
    if (!players) return
    const res = await window.aloria.servers.whitelist(server.id, !players.whitelistOn)
    if (!res.ok) onError(res.error)
    refresh()
  }

  const list = (title: string, hint: string, names: string[], remove: ServerPlayerAction) => (
    <div className="card manage-list">
      <strong>
        {title} <span className="muted">({names.length})</span>
      </strong>
      <small className="muted">{hint}</small>
      {names.length === 0 ? (
        <small className="muted">{t('server.players.empty')}</small>
      ) : (
        <div className="server-players__list">
          {names.map((n) => (
            <span key={n} className="server-player">
              <img src={head(n)} alt="" />
              {n}
              <button className="chip-remove" title={t('server.players.remove')} disabled={busy} onClick={() => act(remove, n)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )

  if (!players) return <div className="manage-tab muted">{t('common.loading')}</div>
  const valid = /^\w{1,16}$/.test(name.trim())
  return (
    <div className="manage-tab">
      <div className="card">
        <label className="toggle-line">
          <input type="checkbox" checked={players.whitelistOn} onChange={toggleWhitelist} />
          <span>
            {t('server.players.whitelistOn')} <small className="muted">· {t('server.players.whitelistOnHint')}</small>
          </span>
        </label>
        <div className="manage-add">
          <input value={name} maxLength={16} placeholder={t('server.players.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
          <button className="primary" disabled={!valid || busy} onClick={() => act('whitelist-add', name.trim())}>
            {t('server.players.addWhitelist')}
          </button>
          <button className="secondary" disabled={!valid || busy} onClick={() => act('op', name.trim())}>
            {t('server.players.addOp')}
          </button>
          <button className="secondary danger-text" disabled={!valid || busy} onClick={() => act('ban', name.trim())}>
            {t('server.players.addBan')}
          </button>
        </div>
        {!alive && <small className="muted">{t('server.players.offlineEdit')}</small>}
      </div>

      {online.length > 0 && (
        <div className="card manage-list">
          <strong>{t('server.players', { n: online.length })}</strong>
          {online.map((n) => (
            <div key={n} className="manage-row">
              <span className="server-player">
                <img src={head(n)} alt="" />
                {n}
              </span>
              <div className="manage-row__actions">
                {players.ops.includes(n) ? (
                  <button className="secondary" disabled={busy} onClick={() => act('deop', n)}>
                    {t('server.players.deop')}
                  </button>
                ) : (
                  <button className="secondary" disabled={busy} onClick={() => act('op', n)}>
                    {t('server.players.addOp')}
                  </button>
                )}
                <button className="secondary" disabled={busy} onClick={() => act('kick', n)}>
                  {t('server.players.kick')}
                </button>
                <button className="secondary danger-text" disabled={busy} onClick={() => act('ban', n)}>
                  {t('server.players.addBan')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {list(t('server.players.whitelist'), t('server.players.whitelistHint'), players.whitelist, 'whitelist-remove')}
      {list(t('server.players.ops'), t('server.players.opsHint'), players.ops, 'deop')}
      {list(t('server.players.banned'), t('server.players.bannedHint'), players.banned, 'pardon')}
    </div>
  )
}

// ---------------------------------------------------------------- réglages (server.properties)

type Field =
  | { key: string; kind: 'bool'; label: string; hint?: string; fallback: boolean }
  | { key: string; kind: 'number'; label: string; hint?: string; fallback: number; min: number; max: number }
  | { key: string; kind: 'text'; label: string; hint?: string; fallback: string }
  | { key: string; kind: 'choice'; label: string; hint?: string; fallback: string; options: string[] }

export function SettingsTab({ server, alive, onError, onRestart }: TabProps & { onRestart: () => void }) {
  const [props, setProps] = useState<Record<string, string> | null>(null)
  const [changed, setChanged] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.aloria.servers.properties(server.id).then((res) => res.ok && setProps(res.value))
  }, [server.id])

  const fields: Field[] = [
    { key: 'motd', kind: 'text', label: t('server.settings.motd'), hint: t('server.settings.motdHint'), fallback: server.name },
    { key: 'max-players', kind: 'number', label: t('server.settings.maxPlayers'), fallback: 20, min: 1, max: 500 },
    {
      key: 'difficulty',
      kind: 'choice',
      label: t('server.settings.difficulty'),
      fallback: 'easy',
      options: ['peaceful', 'easy', 'normal', 'hard']
    },
    {
      key: 'gamemode',
      kind: 'choice',
      label: t('server.settings.gamemode'),
      fallback: 'survival',
      options: ['survival', 'creative', 'adventure', 'spectator']
    },
    { key: 'pvp', kind: 'bool', label: t('server.settings.pvp'), fallback: true },
    { key: 'hardcore', kind: 'bool', label: t('server.settings.hardcore'), hint: t('server.settings.hardcoreHint'), fallback: false },
    {
      key: 'allow-flight',
      kind: 'bool',
      label: t('server.settings.allowFlight'),
      hint: t('server.settings.allowFlightHint'),
      fallback: false
    },
    { key: 'enable-command-block', kind: 'bool', label: t('server.settings.commandBlocks'), fallback: false },
    {
      key: 'online-mode',
      kind: 'bool',
      label: t('server.settings.onlineMode'),
      hint: t('server.settings.onlineModeHint'),
      fallback: true
    },
    {
      key: 'view-distance',
      kind: 'number',
      label: t('server.settings.viewDistance'),
      hint: t('server.settings.chunks'),
      fallback: 10,
      min: 3,
      max: 32
    },
    {
      key: 'simulation-distance',
      kind: 'number',
      label: t('server.settings.simulationDistance'),
      hint: t('server.settings.simulationDistanceHint'),
      fallback: 10,
      min: 3,
      max: 32
    },
    {
      key: 'spawn-protection',
      kind: 'number',
      label: t('server.settings.spawnProtection'),
      hint: t('server.settings.blocks'),
      fallback: 16,
      min: 0,
      max: 256
    },
    { key: 'level-seed', kind: 'text', label: t('server.settings.seed'), hint: t('server.settings.seedHint'), fallback: '' }
  ]

  if (!props) return <div className="manage-tab muted">{t('common.loading')}</div>
  const value = (key: string, fallback: string) => changed[key] ?? props[key] ?? fallback
  const set = (key: string, v: string) => {
    setSaved(false)
    setChanged((c) => ({ ...c, [key]: v }))
  }
  const save = async () => {
    const res = await window.aloria.servers.setProperties(server.id, changed)
    if (!res.ok) return onError(res.error)
    setProps({ ...props, ...changed })
    setChanged({})
    setSaved(true)
  }
  const dirty = Object.keys(changed).length > 0

  return (
    <div className="manage-tab">
      <div className="card manage-settings">
        {fields.map((f) => (
          <div key={f.key} className="manage-setting">
            <div>
              <strong>{f.label}</strong>
              {f.hint && <small className="muted">{f.hint}</small>}
            </div>
            {f.kind === 'bool' ? (
              <input
                type="checkbox"
                className="manage-check"
                checked={value(f.key, String(f.fallback)) === 'true'}
                onChange={(e) => set(f.key, String(e.target.checked))}
              />
            ) : f.kind === 'number' ? (
              <input
                type="number"
                min={f.min}
                max={f.max}
                value={value(f.key, String(f.fallback))}
                onChange={(e) => set(f.key, String(Math.max(f.min, Math.min(f.max, Number(e.target.value) || f.min))))}
              />
            ) : f.kind === 'choice' ? (
              <Select
                value={value(f.key, f.fallback)}
                onChange={(v) => set(f.key, v)}
                options={f.options.map((o) => ({ value: o, label: t(`server.settings.${f.key}.${o}` as Parameters<typeof t>[0]) }))}
              />
            ) : (
              <input value={value(f.key, f.fallback)} maxLength={f.key === 'motd' ? 59 : 64} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </div>
        ))}
      </div>
      <div className="manage-footer">
        {saved && alive && (
          <>
            <small className="muted">{t('server.settings.restartHint')}</small>
            <button className="secondary" onClick={onRestart}>
              ⟳ {t('server.restart')}
            </button>
          </>
        )}
        {saved && !alive && <small className="muted">{t('server.settings.saved')}</small>}
        <button className="primary" disabled={!dirty} onClick={save}>
          {t('common.save')}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- mods ou plugins

export function ContentTab({ server, alive, onError, onRestart }: TabProps & { onRestart: () => void }) {
  const [installed, setInstalled] = useState<ServerContent[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ServerContentHit[] | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [changedWhileOn, setChangedWhileOn] = useState(false)
  const plugins = server.type === 'paper'

  const refresh = useCallback(async () => {
    const res = await window.aloria.servers.content(server.id)
    if (res.ok) setInstalled(res.value)
  }, [server.id])
  useEffect(() => {
    refresh()
  }, [refresh])

  // Recherche Modrinth, un instant après la dernière lettre tapée
  useEffect(() => {
    let current = true
    const timer = setTimeout(async () => {
      const res = await window.aloria.servers.contentSearch(server.id, query)
      if (!current) return
      if (res.ok) setHits(res.value)
      else onError(res.error)
    }, 350)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [server.id, query])

  if (server.type === 'vanilla') return <div className="manage-tab card muted">{t('server.content.vanilla')}</div>

  const install = async (hit: ServerContentHit) => {
    setInstalling(hit.projectId)
    const res = await window.aloria.servers.contentInstall(server.id, hit.projectId)
    setInstalling(null)
    if (!res.ok) onError(res.error)
    else if (alive) setChangedWhileOn(true)
    refresh()
  }
  const remove = async (c: ServerContent) => {
    const res = await window.aloria.servers.contentRemove(server.id, c.fileName)
    if (!res.ok) onError(res.error)
    else if (alive) setChangedWhileOn(true)
    refresh()
  }

  return (
    <div className="manage-tab">
      {changedWhileOn && (
        <div className="card manage-footer">
          <small className="muted">{t('server.content.restartHint')}</small>
          <button className="secondary" onClick={onRestart}>
            ⟳ {t('server.restart')}
          </button>
        </div>
      )}
      <div className="card manage-list">
        <strong>
          {t(plugins ? 'server.content.installedPlugins' : 'server.content.installedMods')}{' '}
          <span className="muted">({installed.length})</span>
        </strong>
        {installed.length === 0 ? (
          <small className="muted">{t('server.content.none')}</small>
        ) : (
          installed.map((c) => (
            <div key={c.fileName} className="manage-row">
              <span className="manage-content">
                {c.iconUrl ? <img src={c.iconUrl} alt="" /> : <span className="manage-content__blank">🧩</span>}
                {c.title}
              </span>
              <button className="secondary danger-text" onClick={() => remove(c)}>
                {t('server.content.remove')}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card manage-list">
        <strong>{t(plugins ? 'server.content.addPlugins' : 'server.content.addMods')}</strong>
        <input
          className="manage-search"
          value={query}
          placeholder={t(plugins ? 'server.content.searchPlugins' : 'server.content.searchMods')}
          onChange={(e) => setQuery(e.target.value)}
        />
        {hits === null ? (
          <small className="muted">{t('common.loading')}</small>
        ) : hits.length === 0 ? (
          <small className="muted">{t('server.content.noResults')}</small>
        ) : (
          hits.map((h) => (
            <div key={h.projectId} className="manage-row">
              <span className="manage-content">
                {h.iconUrl ? <img src={h.iconUrl} alt="" /> : <span className="manage-content__blank">🧩</span>}
                <span>
                  <strong>{h.title}</strong> <small className="muted">· {compactNumber(h.downloads)} ⬇</small>
                  <small className="muted manage-content__desc">{h.description}</small>
                  {h.clientRequired && <small className="warning">{t('server.content.clientRequired')}</small>}
                </span>
              </span>
              <button className="primary" disabled={installing !== null} onClick={() => install(h)}>
                {installing === h.projectId ? t('common.loading') : t('server.content.install')}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- sauvegardes

const KIND_LABELS = {
  manual: 'server.backups.kind.manual',
  auto: 'server.backups.kind.auto',
  version: 'server.backups.kind.version',
  restore: 'server.backups.kind.restore'
} as const

export function BackupsTab({ server, alive, onError, onSaved }: TabProps & { onSaved: () => void }) {
  const [backups, setBackups] = useState<ServerBackup[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await window.aloria.servers.backups(server.id)
    if (res.ok) setBackups(res.value)
  }, [server.id])
  useEffect(() => {
    refresh()
  }, [refresh])

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (!res.ok && res.error) onError(res.error)
    setConfirm(null)
    refresh()
  }
  const setOption = async (patch: { backupHours?: number; backupKeep?: number }) => {
    const res = await window.aloria.servers.update(server.id, patch)
    if (!res.ok) onError(res.error)
    onSaved()
  }

  const hours = server.backupHours ?? 6
  const keep = server.backupKeep ?? 10
  return (
    <div className="manage-tab">
      <div className="card manage-settings">
        <div className="manage-setting">
          <div>
            <strong>{t('server.backups.auto')}</strong>
            <small className="muted">{t('server.backups.autoHint')}</small>
          </div>
          <Select
            value={String(hours)}
            onChange={(v) => setOption({ backupHours: Number(v) })}
            options={[0, 1, 3, 6, 12, 24].map((h) => ({
              value: String(h),
              label: h === 0 ? t('server.backups.never') : t('server.backups.every', { n: h })
            }))}
          />
        </div>
        <div className="manage-setting">
          <div>
            <strong>{t('server.backups.keep')}</strong>
            <small className="muted">{t('server.backups.keepHint')}</small>
          </div>
          <Select
            value={String(keep)}
            onChange={(v) => setOption({ backupKeep: Number(v) })}
            options={[3, 5, 10, 20, 50].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </div>
      </div>

      <div className="card manage-list">
        <div className="manage-row manage-row--head">
          <strong>
            {t('server.backups.title')} <span className="muted">({backups?.length ?? 0})</span>
          </strong>
          <div className="manage-row__actions">
            <button className="secondary" onClick={() => window.aloria.servers.openBackups(server.id)}>
              {t('common.openFolder')}
            </button>
            <button className="primary" disabled={busy} onClick={() => run(() => window.aloria.servers.backup(server.id))}>
              {busy ? t('server.backups.saving') : t('server.backups.now')}
            </button>
          </div>
        </div>
        {alive && <small className="muted">{t('server.backups.restoreOffline')}</small>}
        {backups === null ? (
          <small className="muted">{t('common.loading')}</small>
        ) : backups.length === 0 ? (
          <small className="muted">{t('server.backups.none')}</small>
        ) : (
          backups.map((b) => (
            <div key={b.file} className="manage-row">
              <span className="manage-content">
                <span className="manage-content__blank">💾</span>
                <span>
                  <strong>{new Date(b.date).toLocaleString()}</strong>
                  <small className="muted">
                    {t(KIND_LABELS[b.kind])} · {b.sizeMb.toLocaleString()} Mo
                  </small>
                </span>
              </span>
              <div className="manage-row__actions">
                {confirm === b.file ? (
                  <>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => run(() => window.aloria.servers.restoreBackup(server.id, b.file))}
                    >
                      {t('server.backups.restoreConfirm')}
                    </button>
                    <button className="secondary" onClick={() => setConfirm(null)}>
                      {t('common.cancel')}
                    </button>
                  </>
                ) : (
                  <button className="secondary" disabled={alive || busy} onClick={() => setConfirm(b.file)}>
                    {t('server.backups.restore')}
                  </button>
                )}
                <button
                  className="secondary danger-text"
                  disabled={busy}
                  onClick={() => run(() => window.aloria.servers.deleteBackup(server.id, b.file))}
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
