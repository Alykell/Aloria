import { useCallback, useEffect, useState } from 'react'
import CodeEditor from './CodeEditor'
import type { ServerFile, ServerInfo } from '../../../shared/types'
import { t } from '../i18n'

/**
 * Onglet Fichiers : le dossier du serveur dans le launcher. Parcourir, créer, renommer, supprimer, zipper, dézipper,
 * envoyer depuis le PC, télécharger, et modifier les fichiers texte dans un vrai éditeur de code.
 */

interface Props {
  server: ServerInfo
  onError: (message: string) => void
}

/** Fichiers jamais ouverts dans l'éditeur (binaires) */
const BINARY = /\.(jar|zip|gz|dat|dat_old|mca|mcr|png|jpg|jpeg|gif|exe|dll|so|nbt|schem|schematic|db|sqlite|lock|bin)$/i

function iconOf(f: ServerFile): string {
  if (f.dir) return '📁'
  if (/\.(ya?ml|json5?|properties|toml|cfg|conf|ini|mcmeta)$/i.test(f.name)) return '⚙️'
  if (/\.jar$/i.test(f.name)) return '🧩'
  if (/\.(zip|gz)$/i.test(f.name)) return '🗜️'
  if (/\.(png|jpe?g|gif)$/i.test(f.name)) return '🖼️'
  if (/\.(log|txt|md)$/i.test(f.name)) return '📄'
  return '📃'
}

function sizeOf(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} Ko`
  return `${(bytes / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} Mo`
}

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name)

/** Petite fenêtre de saisie (nom d'un fichier, d'un dossier, d'une archive) */
function Prompt(props: { title: string; initial: string; confirm: string; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(props.initial)
  return (
    <div className="overlay" onClick={() => props.onDone(null)}>
      <div className="dialog files-prompt" onClick={(e) => e.stopPropagation()}>
        <h3>{props.title}</h3>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) props.onDone(value.trim())
            if (e.key === 'Escape') props.onDone(null)
          }}
        />
        <div className="dialog__actions">
          <button className="secondary" onClick={() => props.onDone(null)}>
            {t('common.cancel')}
          </button>
          <button className="primary" disabled={!value.trim()} onClick={() => props.onDone(value.trim())}>
            {props.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ServerFiles({ server, onError }: Props) {
  const [dir, setDir] = useState('')
  const [files, setFiles] = useState<ServerFile[] | null>(null)
  const [quick, setQuick] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [menu, setMenu] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<{ title: string; initial: string; confirm: string; run: (v: string) => Promise<unknown> } | null>(
    null
  )
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  // Fichier ouvert dans l'éditeur
  const [open, setOpen] = useState<{ path: string; text: string; saved: string } | null>(null)
  // Fermeture demandée alors que le fichier a des modifications pas enregistrées
  const [askClose, setAskClose] = useState(false)

  const refresh = useCallback(async () => {
    const res = await window.aloria.servers.files(server.id, dir)
    if (res.ok) setFiles(res.value)
    else {
      onError(res.error)
      setDir('')
    }
  }, [server.id, dir])
  useEffect(() => {
    setSelected([])
    setFilter('')
    refresh()
  }, [refresh])
  useEffect(() => {
    window.aloria.servers.quickFiles(server.id).then(setQuick)
  }, [server.id])

  const run = async (res: Promise<{ ok: boolean; error?: string }>) => {
    const r = await res
    if (!r.ok && r.error) onError(r.error)
    refresh()
  }

  const openFile = async (path: string) => {
    const res = await window.aloria.servers.readFile(server.id, path)
    if (!res.ok) return onError(res.error)
    setOpen({ path, text: res.value, saved: res.value })
  }
  const save = async () => {
    if (!open) return
    const res = await window.aloria.servers.writeFile(server.id, open.path, open.text)
    if (!res.ok) return onError(res.error)
    setOpen((o) => (o ? { ...o, saved: o.text } : o))
  }
  const closeFile = () => {
    if (open && open.text !== open.saved) return setAskClose(true)
    setOpen(null)
  }

  const crumbs = dir ? dir.split('/') : []
  const breadcrumb = (
    <div className="files-crumbs">
      <button className="files-crumb" onClick={() => (open ? closeFile() : setDir(''))}>
        🏠 {t('server.files.home')}
      </button>
      {crumbs.map((c, i) => (
        <span key={i}>
          <span className="muted"> › </span>
          <button className="files-crumb" onClick={() => setDir(crumbs.slice(0, i + 1).join('/'))}>
            {c}
          </button>
        </span>
      ))}
      {open && (
        <span>
          <span className="muted"> › </span>
          <strong>{open.path.split('/').pop()}</strong>
        </span>
      )}
    </div>
  )

  // ---------------------------------------------------------------- éditeur
  if (open) {
    const dirty = open.text !== open.saved
    const name = open.path.split('/').pop() ?? open.path
    return (
      <div className="manage-tab files">
        <div className="files-bar">
          {breadcrumb}
          <div className="files-bar__actions">
            <small className="muted">{dirty ? t('server.files.unsaved') : t('server.files.saved')}</small>
            <button className="primary" disabled={!dirty} onClick={save}>
              💾 {t('common.save')}
            </button>
            <button className="secondary" onClick={closeFile}>
              ✕ {t('common.close')}
            </button>
          </div>
        </div>
        {askClose && (
          <div className="files-selection">
            <span>{t('server.files.discard')}</span>
            <button
              className="primary"
              onClick={async () => {
                await save()
                setAskClose(false)
                setOpen(null)
              }}
            >
              {t('server.files.saveClose')}
            </button>
            <button
              className="secondary danger-text"
              onClick={() => {
                setAskClose(false)
                setOpen(null)
              }}
            >
              {t('server.files.closeNoSave')}
            </button>
            <button className="secondary" onClick={() => setAskClose(false)}>
              {t('common.cancel')}
            </button>
          </div>
        )}
        <CodeEditor
          key={open.path}
          name={name}
          value={open.saved}
          onChange={(text) => setOpen((o) => (o ? { ...o, text } : o))}
          onSave={save}
        />
        <small className="muted">{t('server.files.editorHint')}</small>
      </div>
    )
  }

  // ---------------------------------------------------------------- liste
  const shown = (files ?? []).filter((f) => f.name.toLowerCase().includes(filter.toLowerCase()))
  const allSelected = shown.length > 0 && shown.every((f) => selected.includes(join(dir, f.name)))
  const toggle = (path: string) => setSelected((s) => (s.includes(path) ? s.filter((x) => x !== path) : [...s, path]))
  const ask = (title: string, initial: string, confirm: string, action: (v: string) => Promise<unknown>) =>
    setPrompt({ title, initial, confirm, run: action })

  return (
    <div className="manage-tab files">
      {quick.length > 0 && (
        <div className="files-quick">
          <small className="muted">⚡ {t('server.files.quick')}</small>
          {quick.map((q) => (
            <button key={q} className="files-chip" onClick={() => openFile(q)}>
              {q.split('/').pop()}
            </button>
          ))}
        </div>
      )}

      <div className="files-bar">
        {breadcrumb}
        <div className="files-bar__actions">
          <input
            className="files-search"
            value={filter}
            placeholder={t('server.files.search')}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            className="secondary"
            onClick={() =>
              ask(t('server.files.newFile'), '', t('common.create'), (n) =>
                run(window.aloria.servers.createEntry(server.id, dir, n, false))
              )
            }
          >
            📄 {t('server.files.newFile')}
          </button>
          <button
            className="secondary"
            onClick={() =>
              ask(t('server.files.newFolder'), '', t('common.create'), (n) =>
                run(window.aloria.servers.createEntry(server.id, dir, n, true))
              )
            }
          >
            📁 {t('server.files.newFolder')}
          </button>
          <button className="secondary" onClick={() => run(window.aloria.servers.uploadFiles(server.id, dir))}>
            ⬆ {t('server.files.upload')}
          </button>
          <button className="secondary icon-btn" title={t('server.files.refresh')} onClick={refresh}>
            ⟳
          </button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="files-selection">
          <span>{t('server.files.selected', { n: selected.length })}</span>
          <button
            className="secondary"
            onClick={() =>
              ask(t('server.files.zip'), selected.length === 1 ? selected[0].split('/').pop()! : 'archive', t('server.files.zip'), (n) =>
                run(window.aloria.servers.zipEntries(server.id, selected, n))
              )
            }
          >
            🗜️ {t('server.files.zip')}
          </button>
          <button className="secondary danger-text" onClick={() => setConfirmDelete(selected)}>
            🗑 {t('common.delete')}
          </button>
          <button className="secondary" onClick={() => setSelected([])}>
            {t('server.files.unselect')}
          </button>
        </div>
      )}

      <div className="card files-table">
        <div className="files-row files-row--head">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? [] : shown.map((f) => join(dir, f.name)))}
          />
          <span>{t('server.files.name')}</span>
          <span>{t('server.files.size')}</span>
          <span>{t('server.files.date')}</span>
          <span />
        </div>
        {dir && (
          <div className="files-row files-row--link" onClick={() => setDir(crumbs.slice(0, -1).join('/'))}>
            <span />
            <span className="files-name">↩ ..</span>
            <span />
            <span />
            <span />
          </div>
        )}
        {files === null ? (
          <small className="muted">{t('common.loading')}</small>
        ) : shown.length === 0 ? (
          <small className="muted files-empty">{t('server.files.empty')}</small>
        ) : (
          shown.map((f) => {
            const path = join(dir, f.name)
            const editable = !f.dir && !BINARY.test(f.name)
            return (
              <div
                key={f.name}
                className={'files-row' + (f.dir || editable ? ' files-row--link' : '') + (selected.includes(path) ? ' selected' : '')}
                onClick={() => (f.dir ? setDir(path) : editable ? openFile(path) : undefined)}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(path)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggle(path)}
                />
                <span className="files-name">
                  <span className="files-icon">{iconOf(f)}</span>
                  {f.name}
                </span>
                <span className="muted">{f.dir ? '' : sizeOf(f.size)}</span>
                <span className="muted">
                  {f.modified ? new Date(f.modified).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : ''}
                </span>
                <span className="files-menu" onClick={(e) => e.stopPropagation()}>
                  <button className="files-menu__btn" onClick={() => setMenu(menu === path ? null : path)}>
                    ⋮
                  </button>
                  {menu === path && (
                    <div className="files-menu__list" onMouseLeave={() => setMenu(null)}>
                      {editable && <button onClick={() => (setMenu(null), openFile(path))}>✎ {t('server.files.edit')}</button>}
                      <button
                        onClick={() => {
                          setMenu(null)
                          ask(t('server.files.rename'), f.name, t('server.files.rename'), (n) =>
                            run(window.aloria.servers.renameEntry(server.id, path, n))
                          )
                        }}
                      >
                        ✏️ {t('server.files.rename')}
                      </button>
                      {!f.dir && (
                        <button onClick={() => (setMenu(null), run(window.aloria.servers.downloadFile(server.id, path)))}>
                          ⬇ {t('server.files.download')}
                        </button>
                      )}
                      {/\.zip$/i.test(f.name) && (
                        <button onClick={() => (setMenu(null), run(window.aloria.servers.unzipEntry(server.id, path)))}>
                          🗜️ {t('server.files.unzip')}
                        </button>
                      )}
                      <button
                        onClick={() =>
                          ask(t('server.files.zip'), f.name, t('server.files.zip'), (n) =>
                            run(window.aloria.servers.zipEntries(server.id, [path], n))
                          )
                        }
                      >
                        🗜️ {t('server.files.zip')}
                      </button>
                      <button className="danger-text" onClick={() => (setMenu(null), setConfirmDelete([path]))}>
                        🗑 {t('common.delete')}
                      </button>
                    </div>
                  )}
                </span>
              </div>
            )
          })
        )}
      </div>

      {prompt && (
        <Prompt
          title={prompt.title}
          initial={prompt.initial}
          confirm={prompt.confirm}
          onDone={async (v) => {
            const current = prompt
            setPrompt(null)
            if (v) {
              await current.run(v)
              setSelected([])
            }
          }}
        />
      )}
      {confirmDelete && (
        <div className="overlay" onClick={() => setConfirmDelete(null)}>
          <div className="dialog files-prompt" onClick={(e) => e.stopPropagation()}>
            <h3>{t('server.files.deleteTitle', { n: confirmDelete.length })}</h3>
            <p className="muted">{confirmDelete.map((p) => p.split('/').pop()).join(', ')}</p>
            <div className="dialog__actions">
              <button className="secondary" onClick={() => setConfirmDelete(null)}>
                {t('common.cancel')}
              </button>
              <button
                className="danger-btn"
                onClick={async () => {
                  const paths = confirmDelete
                  setConfirmDelete(null)
                  setSelected([])
                  await run(window.aloria.servers.deleteEntries(server.id, paths))
                }}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
