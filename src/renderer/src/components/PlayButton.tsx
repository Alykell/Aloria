import type { GameStatus } from '../../../shared/types'
import { t } from '../i18n'

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)

function describe(status: GameStatus): { label: string; detail?: string; percent?: number } {
  switch (status.state) {
    case 'preparing':
      return { label: status.label }
    case 'downloading': {
      const percent = status.totalBytes > 0 ? (status.doneBytes / status.totalBytes) * 100 : 0
      return {
        label: t('play.downloading'),
        detail: t('play.downloadDetail', {
          done: mb(status.doneBytes),
          total: mb(status.totalBytes),
          files: status.doneFiles,
          totalFiles: status.totalFiles
        }),
        percent
      }
    }
    case 'launching':
      return { label: t('play.launching') }
    case 'running':
      return { label: t('play.running', { profile: status.profile }) }
    default:
      return { label: '' }
  }
}

export default function PlayButton({ status, disabled, onPlay }: { status: GameStatus; disabled: boolean; onPlay: () => void }) {
  if (status.state === 'idle') {
    return (
      <button className="play" onClick={onPlay} disabled={disabled}>
        {t('common.play')}
      </button>
    )
  }

  const { label, detail, percent } = describe(status)
  return (
    <div className="progress">
      <div className="progress__label">
        <strong>{label}</strong>
        {percent !== undefined && <span>{t('play.percent', { n: Math.floor(percent) })}</span>}
      </div>
      <div className={'progress__bar' + (percent === undefined ? ' indeterminate' : '')}>
        <div className="progress__fill" style={percent !== undefined ? { width: `${percent}%` } : undefined} />
      </div>
      {detail && <small>{detail}</small>}
    </div>
  )
}
