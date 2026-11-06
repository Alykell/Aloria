import { useEffect, useRef, useState } from 'react'
import WorldBackupsDialog from './WorldBackupsDialog'
import { askConfirm } from '../confirm'
import type { BedrockInfo, BedrockPack, BedrockPackType, BedrockWorld } from '../../../shared/types'
import type { MessageKey } from '../../../shared/i18n'
import { t } from '../i18n'

const TYPES: Record<BedrockPackType, MessageKey> = {
  resources: 'bedrock.type.resources',
  behavior: 'bedrock.type.behavior',
  skins: 'bedrock.type.skins'
}

/** Mêmes id que les sauvegardes de mondes côté processus principal */
const BEDROCK_ID = 'bedrock'

/** Fiche de Minecraft Bedrock : mondes (sauvegardes, export .mcworld) et packs (.mcpack / .mcaddon installés en un clic) */
export default function BedrockDialog({ info, onClose }: { info: BedrockInfo; onClose: () => void }) {
  const [worlds, setWorlds] = useState<BedrockWorld[] | null>(null)
  const [packs, setPacks] = useState<BedrockPack[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [backups, setBackups] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const refresh = async () => {
    const [w, p] = await Promise.all([window.aloria.bedrock.worlds(), window.aloria.bedrock.packs()])
    if (w.ok) setWorlds(w.value)
    if (p.ok) setPacks(p.value)
    if (!w.ok || !p.ok) setMessage({ ok: false, text: !w.ok ? w.error : !p.ok ? p.error : '' })
  }
  useEffect(() => {
    refresh()
  }, [])

  const run = async <T,>(
    key: string,
    action: () => Promise<{ ok: true; value: T } | { ok: false; error: string }>,
    success?: (value: T) => string | null
  ) => {
    setBusy(key)
    setMessage(null)
    const res = await action()
    setBusy(null)
    if (!res.ok) setMessage({ ok: false, text: res.error })
    else {
      const text = success?.(res.value)
      if (text) setMessage({ ok: true, text })
    }
    await refresh()
  }

  const importFile = (file: File | null) =>
    run(
      'import',
      () => window.aloria.bedrock.importFile(file),
      (res) =>
        res
          ? t('bedrock.imported', {
              names: [...res.packs, ...res.worlds].join(', ')
            })
          : null
    )

  const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')
  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      dragDepth.current++
      setDragging(true)
    },
    onDragOver: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file && !busy) importFile(file)
    }
  }

  const deleteWorld = async (w: BedrockWorld) => {
    if (
      !(await askConfirm(t('bedrock.confirmDeleteWorld', { name: w.name }), {
        confirmLabel: t('common.delete')
      }))
    )
      return
    run(`delete:${w.id}`, () => window.aloria.bedrock.deleteWorld(w.id))
  }
  const deletePack = async (p: BedrockPack) => {
    if (
      !(await askConfirm(t('bedrock.confirmDeletePack', { name: p.name }), {
        confirmLabel: t('common.delete')
      }))
    )
      return
    run(`pack:${p.type}/${p.folder}`, () => window.aloria.bedrock.deletePack(p.type, p.folder))
  }

  if (backups) return <WorldBackupsDialog profileId={BEDROCK_ID} onClose={() => setBackups(false)} />

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="dialog editor bedrock" onClick={(e) => e.stopPropagation()} {...dropHandlers}>
        {dragging && (
          <div className="library__drop">
            <strong>📥 {t('bedrock.drop')}</strong>
          </div>
        )}
        <div className="worlds__head">
          <h3>
            🪨 Minecraft Bedrock <small className="muted">{info.version}</small>
          </h3>
          <button className="secondary" disabled={!!busy} title={t('bedrock.importHint')} onClick={() => importFile(null)}>
            📥 {busy === 'import' ? t('bedrock.importing') : t('bedrock.import')}
          </button>
        </div>
        <p className="muted">{t('bedrock.intro')}</p>
        {message && (
          <p className={message.ok ? 'modpack__done' : 'modpack__warning'}>
            {message.ok ? '✓' : '⚠️'} {message.text}
          </p>
        )}

        <div className="export-box">
          <div className="worlds__head">
            <strong>🌍 {t('bedrock.worlds')}</strong>
            <button className="secondary" disabled={!!busy} onClick={() => setBackups(true)}>
              💾 {t('bedrock.backups')}
            </button>
          </div>
          {!worlds && <small className="muted">{t('common.loading')}</small>}
          {worlds?.length === 0 && <small className="muted">{t('bedrock.noWorlds')}</small>}
          {worlds?.map((w) => (
            <div key={w.id} className="bedrock__row">
              {w.icon ? <img src={w.icon} alt="" /> : <span className="bedrock__icon">🌍</span>}
              <span className="bedrock__text">
                <strong>{w.name}</strong>
                <small className="muted">
                  {new Date(w.lastPlayed).toLocaleString()} ·{' '}
                  {t('worlds.size', {
                    n: w.sizeMb > 0 ? w.sizeMb.toLocaleString() : `< ${(0.1).toLocaleString()}`
                  })}
                </small>
              </span>
              <div className="export-box__actions">
                <button className="secondary" title={t('common.openFolder')} onClick={() => window.aloria.bedrock.openWorld(w.id)}>
                  📂
                </button>
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() =>
                    run(
                      `export:${w.id}`,
                      () => window.aloria.bedrock.exportWorld(w.id, w.name),
                      (file) => (file ? t('bedrock.exported') : null)
                    )
                  }
                >
                  {t('bedrock.export')}
                </button>
                <button className="secondary" disabled={!!busy} aria-label={t('common.delete')} onClick={() => deleteWorld(w)}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="export-box">
          <div className="worlds__head">
            <strong>🎨 {t('bedrock.packs')}</strong>
            <button className="secondary" title={t('common.openFolder')} onClick={() => window.aloria.bedrock.openPacks()}>
              📂
            </button>
          </div>
          {!packs && <small className="muted">{t('common.loading')}</small>}
          {packs?.length === 0 && <small className="muted">{t('bedrock.noPacks')}</small>}
          {packs?.map((p) => (
            <div key={`${p.type}/${p.folder}`} className="bedrock__row">
              {p.icon ? <img src={p.icon} alt="" /> : <span className="bedrock__icon">📦</span>}
              <span className="bedrock__text">
                <strong>
                  {p.name} <span className="chip">{t(TYPES[p.type])}</span>
                </strong>
                <small className="muted">{[p.version && `v${p.version}`, p.description].filter(Boolean).join(' · ')}</small>
              </span>
              <div className="export-box__actions">
                {p.type === 'resources' && (
                  <label className="toggle-line" title={t('bedrock.globalHint')}>
                    <input
                      type="checkbox"
                      checked={p.global}
                      disabled={!!busy}
                      onChange={(e) => run(`global:${p.folder}`, () => window.aloria.bedrock.setGlobal(p.folder, e.target.checked))}
                    />
                    <span>{t('bedrock.global')}</span>
                  </label>
                )}
                <button className="secondary" disabled={!!busy} aria-label={t('common.delete')} onClick={() => deletePack(p)}>
                  🗑
                </button>
              </div>
            </div>
          ))}
          {packs?.some((p) => p.type === 'behavior') && <small className="muted">{t('bedrock.behaviorHint')}</small>}
        </div>

        <div className="dialog__actions">
          <button className="primary" disabled={!!busy} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
