import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Profile } from '../../../shared/types'
import { t } from '../i18n'

/** Lignes gardées à l'écran (les plus anciennes disparaissent) */
const MAX_LINES = 3000

/** Couleur d'après le niveau de la ligne (« [12:34:56] [Render thread/WARN]: … ») ; sinon, les traces d'exception en rouge */
const lineClass = (line: string) => {
  const level = /^\[[\d:]+\] \[[^\]]*\/(\w+)\]/.exec(line)?.[1]
  if (level) return level === 'ERROR' || level === 'FATAL' ? 'game-console__error' : level === 'WARN' ? 'game-console__warn' : undefined
  return /^\s+at |^\S+(Exception|Error)\b/.test(line) ? 'game-console__error' : undefined
}

/** Console en direct d'un profil : ce que le jeu écrit, relu chaque seconde */
export default function GameConsole({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([])
  const [missing, setMissing] = useState(false)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    let offset = 0
    let rest = ''
    let alive = true
    const read = async () => {
      const res = await window.aloria.game.console(profile.id, offset)
      if (!alive || !res.ok) return
      const chunk = res.value
      setMissing(chunk.missing)
      if (chunk.reset) {
        rest = ''
        setLines([])
      }
      offset = chunk.offset
      if (!chunk.text) return
      const parts = (rest + chunk.text).split(/\r?\n/)
      rest = parts.pop() ?? ''
      setLines((all) => (chunk.reset ? parts : [...all, ...parts]).slice(-MAX_LINES))
    }
    read()
    const timer = setInterval(read, 1000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [profile.id])

  // Reste en bas tant que le joueur n'est pas remonté lire
  useLayoutEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [lines])

  const copy = () => {
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog game-console" onClick={(e) => e.stopPropagation()}>
        <h3>{t('console.title', { profile: profile.name })}</h3>
        <div
          className="server-console__lines game-console__lines"
          ref={box}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
        >
          {lines.length === 0 ? (
            <span className="muted">{missing ? t('console.never') : t('console.empty')}</span>
          ) : (
            lines.map((l, i) => (
              <div key={i} className={lineClass(l)}>
                {l}
              </div>
            ))
          )}
        </div>
        <div className="dialog__actions">
          <button className="secondary" onClick={() => window.aloria.profiles.openFolder(profile.id)}>
            {t('crash.openFolder')}
          </button>
          <button className="secondary" disabled={lines.length === 0} onClick={copy}>
            {copied ? t('console.copied') : t('console.copy')}
          </button>
          <button className="primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
