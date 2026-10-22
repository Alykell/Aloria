import { useEffect } from 'react'
import { clearModpackTask, describeProgress, useModpackTask } from '../hooks/useModpackTask'
import { t } from '../i18n'

/** Installation de modpack réduite : avancement en bas de l'écran, puis résultat (la liste des profils est rafraîchie) */
export default function ModpackTaskBar({ onFinished }: { onFinished: () => void }) {
  const task = useModpackTask()
  const finished = !!task?.minimized && !task.running
  useEffect(() => {
    if (finished && task?.result) onFinished()
  }, [finished])

  if (!task?.minimized) return null
  const { percent, label } = describeProgress(task.progress, task.update)
  return (
    <div className="modpack-task" role="status">
      {task.iconUrl ? <img src={task.iconUrl} alt="" /> : <div className="result__noicon small">📦</div>}
      <div className="modpack-task__body">
        <strong>{task.title}</strong>
        {task.running ? (
          <>
            <small className="muted">
              {label}
              {percent !== null ? ` · ${percent} %` : ''}
            </small>
            <div className={'progress__bar' + (percent === null ? ' indeterminate' : '')}>
              <div className="progress__fill" style={percent !== null ? { width: `${percent}%` } : undefined} />
            </div>
          </>
        ) : task.result ? (
          <small className="modpack__done">
            ✓ {t(task.server ? 'modpack.taskServer' : task.update ? 'modpack.taskUpdated' : 'modpack.taskDone', { name: task.result.name })}
          </small>
        ) : (
          <small className="modpack__warning">⚠️ {task.error}</small>
        )}
      </div>
      {!task.running && (
        <button aria-label={t('common.close')} onClick={clearModpackTask}>
          &#10005;
        </button>
      )}
    </div>
  )
}
