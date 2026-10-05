import type { GameStatus } from '../../../shared/types'

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)

function describe(status: GameStatus): { label: string; detail?: string; percent?: number } {
  switch (status.state) {
    case 'preparing':
      return { label: status.label }
    case 'downloading': {
      const percent = status.totalBytes > 0 ? (status.doneBytes / status.totalBytes) * 100 : 0
      return {
        label: 'Téléchargement…',
        detail: `${mb(status.doneBytes)} / ${mb(status.totalBytes)} Mo · ${status.doneFiles}/${status.totalFiles} fichiers`,
        percent
      }
    }
    case 'launching':
      return { label: 'Lancement du jeu…' }
    case 'running':
      return { label: `Minecraft ${status.version} est lancé` }
    default:
      return { label: '' }
  }
}

export default function PlayButton({ status, disabled, onPlay }: { status: GameStatus; disabled: boolean; onPlay: () => void }) {
  if (status.state === 'idle') {
    return (
      <button className="play" onClick={onPlay} disabled={disabled}>
        Jouer
      </button>
    )
  }

  const { label, detail, percent } = describe(status)
  return (
    <div className="progress">
      <div className="progress__label">
        <strong>{label}</strong>
        {percent !== undefined && <span>{Math.floor(percent)} %</span>}
      </div>
      <div className={'progress__bar' + (percent === undefined ? ' indeterminate' : '')}>
        <div className="progress__fill" style={percent !== undefined ? { width: `${percent}%` } : undefined} />
      </div>
      {detail && <small>{detail}</small>}
    </div>
  )
}
