import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ServerEditor, { SERVER_TYPE_LABELS } from './ServerEditor'
import { BackupsTab, ContentTab, PlayersTab, SettingsTab } from './ServerManage'
import ServerFiles from './ServerFiles'
import Select from './Select'
import { useVersions } from '../hooks/useVersions'
import type { SettingsState } from '../hooks/useSettings'
import type { Profile, ServerInfo, ServerState, ServerStatus } from '../../../shared/types'
import { gb, t } from '../i18n'

interface Props {
  settings: SettingsState
  onError: (message: string) => void
  /** Vrai quand le panneau d'un serveur est ouvert : l'application cache alors son menu */
  onFocus: (focused: boolean) => void
}

const STATE_LABELS: Record<ServerState, Parameters<typeof t>[0]> = {
  stopped: 'server.state.stopped',
  installing: 'server.state.installing',
  starting: 'server.state.starting',
  running: 'server.state.running',
  stopping: 'server.state.stopping'
}

const idle = (id: string): ServerStatus => ({
  id,
  state: 'stopped',
  publicAddress: null,
  players: []
})

/** Liste des serveurs, leur état en direct et l'adresse du PC sur le réseau local */
function useServers() {
  const [servers, setServers] = useState<ServerInfo[]>([])
  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({})
  const [freePort, setFreePort] = useState(25565)
  const [lanAddress, setLanAddress] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await window.aloria.servers.list()
    setServers(res.servers)
    setFreePort(res.freePort)
    setLanAddress(res.lanAddress)
    setStatuses(Object.fromEntries(res.statuses.map((s) => [s.id, s])))
  }, [])

  useEffect(() => {
    refresh()
    const last: Record<string, string> = {}
    return window.aloria.servers.onStatus((s) => {
      setStatuses((all) => ({ ...all, [s.id]: s }))
      // Démarrage terminé ou arrêt : la fiche du serveur a changé (version installée, dernier démarrage). L'état revient
      // toutes les 2 s avec les mesures : on ne relit la liste qu'au changement
      if (last[s.id] !== s.state && (s.state === 'running' || s.state === 'stopped')) refresh()
      last[s.id] = s.state
    })
  }, [refresh])

  return {
    servers,
    statuses,
    freePort,
    lanAddress,
    refresh,
    status: (id: string) => statuses[id] ?? idle(id)
  }
}

function StateBadge({ status }: { status: ServerStatus }) {
  return (
    <span className={`server-state server-state--${status.state}`}>
      <span className="server-state__dot" />
      {t(STATE_LABELS[status.state])}
    </span>
  )
}

function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="server-address">
      <code>{value}</code>
      <button
        className="secondary"
        onClick={() => {
          navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? t('server.copied') : t('server.copy')}
      </button>
    </span>
  )
}

/** Case de statistique : valeur, détail et jauge facultative */
function Stat(props: { label: string; value: string; hint?: string; ratio?: number; level?: 'good' | 'warn' | 'bad' }) {
  const { label, value, hint, ratio, level } = props
  const fill = ratio === undefined ? undefined : Math.max(0, Math.min(1, ratio))
  const tone = level ?? (fill === undefined ? undefined : fill > 0.9 ? 'bad' : fill > 0.7 ? 'warn' : 'good')
  return (
    <div className={'server-stat' + (tone ? ` server-stat--${tone}` : '')}>
      <span className="server-stat__label">{label}</span>
      <strong className="server-stat__value">{value}</strong>
      {hint && <small className="muted">{hint}</small>}
      {fill !== undefined && (
        <div className="server-stat__bar">
          <div style={{ width: `${Math.round(fill * 100)}%` }} />
        </div>
      )}
    </div>
  )
}

/** « Rejoindre » : lance un profil de la même version, qui arrive directement sur le serveur */
function JoinServer({ server, running, onError }: { server: ServerInfo; running: boolean; onError: (message: string) => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [choice, setChoice] = useState('')
  const [launching, setLaunching] = useState(false)
  const { latestRelease } = useVersions(false)
  useEffect(() => {
    window.aloria.profiles.list().then((res) => setProfiles(res.profiles))
  }, [])
  const versionOf = (p: Profile) => (p.versionId === 'latest-release' ? latestRelease : p.versionId)
  const matching = profiles.filter((p) => versionOf(p) === server.gameVersion)
  useEffect(() => {
    if (!matching.some((p) => p.id === choice)) setChoice(matching[0]?.id ?? '')
  }, [matching.map((p) => p.id).join()])

  if (matching.length === 0) return <small className="muted">{t('server.join.noProfile', { version: server.gameVersion })}</small>
  const join = async () => {
    setLaunching(true)
    const res = await window.aloria.game.play(choice, { host: 'localhost', port: server.port })
    setLaunching(false)
    if (!res.ok) onError(res.error)
  }
  return (
    <div className="server-join">
      <Select value={choice} onChange={setChoice} options={matching.map((p) => ({ value: p.id, label: `${p.icon} ${p.name}` }))} />
      <button
        className="primary"
        disabled={!running || !choice || launching}
        title={running ? undefined : t('server.join.offline')}
        onClick={join}
      >
        🎮 {t('server.join.button')}
      </button>
    </div>
  )
}

/** Console en direct, avec une ligne pour envoyer des commandes */
function Console({ id, running }: { id: string; running: boolean }) {
  const [lines, setLines] = useState<string[]>([])
  const [command, setCommand] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    let current = true
    window.aloria.servers.log(id).then((l) => current && setLines(l))
    const off = window.aloria.servers.onLog((l) => {
      if (l.id === id) setLines((all) => [...all.slice(-1999), l.line])
    })
    return () => {
      current = false
      off()
    }
  }, [id])

  // Reste en bas tant que le joueur n'est pas remonté lire
  useLayoutEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [lines])

  const send = () => {
    if (!command.trim()) return
    window.aloria.servers.command(id, command)
    setCommand('')
  }

  return (
    <div className="server-console">
      <div
        className="server-console__lines"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {lines.length === 0 ? <span className="muted">{t('server.consoleEmpty')}</span> : lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
      <div className="server-console__input">
        <input
          value={command}
          disabled={!running}
          placeholder={running ? t('server.commandPlaceholder') : t('server.commandOffline')}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="primary" disabled={!running || !command.trim()} onClick={send}>
          {t('server.send')}
        </button>
      </div>
    </div>
  )
}

export default function ServersPage({ settings, onError, onFocus }: Props) {
  const { servers, freePort, lanAddress, refresh, status } = useServers()
  const [openId, setOpenId] = useState<string | null>(null)
  // Onglet du panneau d'un serveur (la console par défaut)
  const [tab, setTab] = useState<'console' | 'players' | 'settings' | 'content' | 'files' | 'backups'>('console')
  // undefined = fermé, null = création, ServerInfo = modification
  const [editing, setEditing] = useState<ServerInfo | null | undefined>(undefined)
  const maxRamMb = Math.max(1024, Math.floor((settings.systemRamMb - 2048) / 512) * 512)
  const open = servers.find((s) => s.id === openId) ?? null

  const start = async (id: string) => {
    const res = await window.aloria.servers.start(id)
    if (!res.ok) onError(res.error)
    refresh()
  }
  const stop = async (id: string) => {
    const res = await window.aloria.servers.stop(id)
    if (!res.ok) onError(res.error)
  }
  // Compte playit.gg relié à ce PC (une fois pour tous les serveurs)
  const [playitLinked, setPlayitLinked] = useState(true)
  const [linking, setLinking] = useState(false)
  useEffect(() => {
    window.aloria.servers.playitLinked().then(setPlayitLinked)
  }, [])
  const linkPlayit = async (id: string, alive: boolean) => {
    setLinking(true)
    const res = await window.aloria.servers.playitLink()
    setLinking(false)
    if (!res.ok) return onError(res.error)
    setPlayitLinked(true)
    if (alive) window.aloria.servers.tunnel(id)
  }
  const restart = async (id: string) => {
    const res = await window.aloria.servers.restart(id)
    if (!res.ok) onError(res.error)
  }

  // Panneau d'un serveur : en plein écran, sans le menu de gauche
  const focused = open !== null
  useEffect(() => {
    onFocus(focused)
  }, [focused])
  useEffect(() => () => onFocus(false), [])

  const startStop = (s: ServerInfo, st: ServerStatus) => {
    const busy = st.state === 'installing' || st.state === 'stopping'
    const on = st.state === 'running' || st.state === 'starting'
    return (
      <button
        className={on ? 'secondary' : 'primary'}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation()
          if (on) stop(s.id)
          else start(s.id)
        }}
      >
        {on ? t('server.stop') : t('server.start')}
      </button>
    )
  }

  const editor = editing !== undefined && (
    <ServerEditor
      server={editing}
      defaultPort={freePort}
      maxRamMb={maxRamMb}
      onClose={() => setEditing(undefined)}
      onSave={async (input) => {
        const res = editing ? await window.aloria.servers.update(editing.id, input) : await window.aloria.servers.create(input)
        if (!res.ok) onError(res.error)
        else if (!editing) setOpenId(res.value.id)
        setEditing(undefined)
        refresh()
      }}
      onDelete={async () => {
        if (!editing) return
        const res = await window.aloria.servers.remove(editing.id)
        if (!res.ok) onError(res.error)
        setEditing(undefined)
        setOpenId(null)
        refresh()
      }}
    />
  )

  // ---------------------------------------------------------------- panneau d'un serveur (plein écran)
  if (open) {
    const st = status(open.id)
    const running = st.state === 'running'
    const alive = running || st.state === 'starting'
    const busy = st.state === 'installing' || st.state === 'stopping'
    const local = open.port === 25565 ? 'localhost' : `localhost:${open.port}`
    const lan = lanAddress ? (open.port === 25565 ? lanAddress : `${lanAddress}:${open.port}`) : null
    const stats = alive ? st.stats : undefined
    const ramMax = stats?.ramMaxMb ?? open.ramMb
    return (
      <section className="server-panel">
        <header className="server-panel__header">
          <button
            className="secondary"
            onClick={() => {
              setOpenId(null)
              setTab('console')
            }}
          >
            ← {t('server.back')}
          </button>
          <span className="server-panel__icon">{open.icon}</span>
          <div className="server-panel__title">
            <h2>{open.name}</h2>
            <span className="muted">
              {SERVER_TYPE_LABELS[open.type]} · {open.gameVersion}
            </span>
          </div>
          <StateBadge status={st} />
          <div className="server-panel__actions">
            <button className={alive ? 'secondary' : 'primary'} disabled={busy} onClick={() => (alive ? stop(open.id) : start(open.id))}>
              {alive ? `■ ${t('server.stop')}` : `▶ ${t('server.start')}`}
            </button>
            <button className="secondary" disabled={!alive} onClick={() => restart(open.id)}>
              ⟳ {t('server.restart')}
            </button>
            <button
              className="secondary danger-text"
              disabled={!alive && st.state !== 'stopping'}
              title={t('server.killHint')}
              onClick={() => window.aloria.servers.kill(open.id)}
            >
              ⏻ {t('server.kill')}
            </button>
            <button className="secondary icon-btn" title={t('common.openFolder')} onClick={() => window.aloria.servers.openFolder(open.id)}>
              📁
            </button>
            <button
              className="secondary icon-btn"
              title={t('server.edit')}
              disabled={st.state !== 'stopped'}
              onClick={() => setEditing(open)}
            >
              ✎
            </button>
          </div>
        </header>

        {(st.state === 'installing' || (st.state === 'stopping' && st.label)) && (
          <div className="card server-progress">
            <span>{st.label}</span>
            {st.progress !== undefined && (
              <div className="progress">
                <div className="progress__bar">
                  <div className="progress__fill" style={{ width: `${Math.round(st.progress * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        )}
        {st.error && st.state === 'stopped' && <div className="card server-error">⚠️ {st.error}</div>}

        <div className="server-panel__body">
          <div className="server-main">
            <div className="segmented server-tabs">
              {(['console', 'players', 'settings', 'content', 'files', 'backups'] as const).map((id) => (
                <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                  {id === 'content' ? t(open.type === 'paper' ? 'server.tab.plugins' : 'server.tab.mods') : t(`server.tab.${id}`)}
                </button>
              ))}
            </div>
            {tab === 'console' && <Console id={open.id} running={alive} />}
            {tab === 'players' && <PlayersTab server={open} alive={alive} online={st.players} onError={onError} />}
            {tab === 'settings' && <SettingsTab server={open} alive={alive} onError={onError} onRestart={() => restart(open.id)} />}
            {tab === 'content' && <ContentTab server={open} alive={alive} onError={onError} onRestart={() => restart(open.id)} />}
            {tab === 'files' && <ServerFiles server={open} onError={onError} />}
            {tab === 'backups' && <BackupsTab server={open} alive={alive} onError={onError} onSaved={refresh} />}
          </div>

          <aside className="server-side">
            <div className="server-stats">
              <Stat label={t('server.stat.players')} value={alive ? String(st.players.length) : '—'} />
              <Stat
                label={t('server.stat.tps')}
                value={stats?.tps !== undefined ? stats.tps.toFixed(1) : '—'}
                hint={
                  stats?.mspt !== undefined
                    ? t('server.stat.mspt', { ms: stats.mspt.toFixed(1) })
                    : alive
                      ? t('server.stat.tpsWaiting')
                      : undefined
                }
                level={stats?.tps === undefined ? undefined : stats.tps >= 19 ? 'good' : stats.tps >= 15 ? 'warn' : 'bad'}
              />
              <Stat
                label={t('server.stat.ram')}
                value={stats?.ramMb !== undefined ? gb(stats.ramMb) : '—'}
                hint={t('server.stat.ramOf', { max: gb(ramMax) })}
                ratio={stats?.ramMb !== undefined ? stats.ramMb / ramMax : undefined}
              />
              <Stat
                label={t('server.stat.cpu')}
                value={stats?.cpu !== undefined ? `${stats.cpu.toFixed(0)} %` : '—'}
                ratio={stats?.cpu !== undefined ? stats.cpu / 100 : undefined}
              />
            </div>

            <div className="card server-side__card">
              <strong>{t('server.addressFriends')}</strong>
              {open.tunnel === 'none' ? (
                <small className="muted">{t('server.noTunnel')}</small>
              ) : open.tunnel === 'playit' && !playitLinked ? (
                <>
                  <small className="muted">{linking ? t('server.playit.linking') : t('server.playit.link')}</small>
                  <button className="primary" disabled={linking} onClick={() => linkPlayit(open.id, alive)}>
                    {t('server.playit.linkButton')}
                  </button>
                </>
              ) : st.publicAddress ? (
                <>
                  <Copyable value={st.publicAddress} />
                  {st.fallbackAddress && (
                    <>
                      <small className="muted">{t('server.playit.fallback')}</small>
                      <Copyable value={st.fallbackAddress} />
                    </>
                  )}
                </>
              ) : (
                <small className={st.tunnelError ? 'warning' : 'muted'}>
                  {st.tunnelError ?? (st.state === 'stopped' ? t('server.addressWhenStarted') : t('server.addressWaiting'))}
                </small>
              )}
              <strong>{t('server.addressYou')}</strong>
              <Copyable value={local} />
              <JoinServer server={open} running={running} onError={onError} />
              {lan && (
                <>
                  <strong>{t('server.addressLan')}</strong>
                  <Copyable value={lan} />
                </>
              )}
            </div>

            <div className="card server-side__card">
              <strong>{t('server.players', { n: st.players.length })}</strong>
              {st.players.length === 0 ? (
                <small className="muted">{running ? t('server.playersNone') : t('server.playersOffline')}</small>
              ) : (
                <div className="server-players__list">
                  {st.players.map((p) => (
                    <span key={p} className="server-player">
                      <img src={`https://mc-heads.net/avatar/${encodeURIComponent(p)}/24`} alt="" />
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
        {editor}
      </section>
    )
  }

  // ---------------------------------------------------------------- liste
  return (
    <section className="page wide">
      <div className="library__header">
        <h2>{t('server.title')}</h2>
      </div>
      <p className="muted">{t('server.intro')}</p>

      <div className="profile-grid">
        {servers.map((s) => {
          const st = status(s.id)
          return (
            <div key={s.id} className="profile-card" onClick={() => setOpenId(s.id)}>
              <span className="profile-card__icon">{s.icon}</span>
              <strong>{s.name}</strong>
              <span className="profile-card__version">
                {SERVER_TYPE_LABELS[s.type]} · {s.gameVersion}
              </span>
              <StateBadge status={st} />
              {st.state === 'running' && <small>{t('server.players', { n: st.players.length })}</small>}
              <div className="profile-card__actions">{startStop(s, st)}</div>
            </div>
          )
        })}
        <button className="profile-card new" onClick={() => setEditing(null)}>
          <span className="profile-card__icon">＋</span>
          <strong>{t('server.new')}</strong>
        </button>
      </div>
      {editor}
    </section>
  )
}
