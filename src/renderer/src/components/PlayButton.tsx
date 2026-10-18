import type { GameStatus, LaunchStep } from '../../../shared/types'
import { t } from '../i18n'

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)

function describe(step: LaunchStep): { label: string; detail?: string; percent?: number } {
  switch (step.state) {
    case 'preparing':
      return { label: step.label }
    case 'downloading': {
      const percent = step.totalBytes > 0 ? (step.doneBytes / step.totalBytes) * 100 : 0
      return {
        label: t('play.downloading'),
        detail: t('play.downloadDetail', {
          done: mb(step.doneBytes),
          total: mb(step.totalBytes),
          files: step.doneFiles,
          totalFiles: step.totalFiles
        }),
        percent
      }
    }
    case 'launching':
      return { label: t('play.launching') }
  }
}

interface Props {
  status: GameStatus
  /** Profil choisi sur l'accueil */
  profileId: string | null
  disabled: boolean
  onPlay: () => void
  onCancel: () => void
  onStop: (profileId: string) => void
}

/** Bouton du profil choisi : Jouer, progression du lancement (annulable) ou Arrêter si sa partie est ouverte */
export default function PlayButton({ status, profileId, disabled, onPlay, onCancel, onStop }: Props) {
  const { launch } = status
  const game = status.running.find((r) => r.profileId === profileId)

  if (launch && launch.profileId === profileId) {
    const { label, detail, percent } = describe(launch)
    return (
      <div className="progress">
        <div className="progress__label">
          <strong>{launch.cancelling ? t('play.cancelling') : label}</strong>
          {percent !== undefined && <span>{t('play.percent', { n: Math.floor(percent) })}</span>}
        </div>
        <div className={'progress__bar' + (percent === undefined ? ' indeterminate' : '')}>
          <div className="progress__fill" style={percent !== undefined ? { width: `${percent}%` } : undefined} />
        </div>
        <div className="progress__footer">
          <small>{detail}</small>
          {launch.state !== 'launching' && (
            <button className="link-danger" onClick={onCancel} disabled={launch.cancelling}>
              {t('play.cancel')}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (game) {
    return (
      <>
        <button
          className="play play--stop"
          onClick={() => onStop(game.profileId)}
          title={t(game.stopping ? 'play.forceTitle' : 'play.stopTitle')}
        >
          {t(game.stopping ? 'play.forceStop' : 'play.stop')}
        </button>
        <small>{t('play.running', { profile: game.profile })}</small>
      </>
    )
  }

  return (
    <>
      <button className="play" onClick={onPlay} disabled={disabled || !!launch}>
        {t('common.play')}
      </button>
      {launch && <small>{t('play.otherLaunching', { profile: launch.profile })}</small>}
    </>
  )
}

/** Autres parties ouvertes, chacune avec son bouton Arrêter */
export function RunningGames({ status, exceptId, onStop }: { status: GameStatus; exceptId: string | null; onStop: (id: string) => void }) {
  const others = status.running.filter((r) => r.profileId !== exceptId)
  if (others.length === 0) return null
  return (
    <div className="running-games">
      <span>{t('play.inGame')}</span>
      {others.map((r) => (
        <span key={r.profileId} className="running-game">
          {r.profile}
          <button
            className="link-danger"
            onClick={() => onStop(r.profileId)}
            title={t(r.stopping ? 'play.forceTitle' : 'play.stopTitle')}
          >
            {t(r.stopping ? 'play.forceStop' : 'play.stop')}
          </button>
        </span>
      ))}
    </div>
  )
}
