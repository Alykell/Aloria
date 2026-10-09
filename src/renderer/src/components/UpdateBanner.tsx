import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/types'
import { t } from '../i18n'

export default function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    window.aloria.updater.status().then(setStatus)
    return window.aloria.updater.onStatus(setStatus)
  }, [])

  if (status.state === 'downloading') {
    return (
      <div className="update">
        <span>{t('update.downloading', { version: status.version })}</span>
        <div className="update__bar">
          <div style={{ width: `${status.percent}%` }} />
        </div>
      </div>
    )
  }

  if (status.state === 'ready') {
    return (
      <button className="update ready" onClick={() => window.aloria.updater.install()}>
        <span>{t('update.ready', { version: status.version })}</span>
        <strong>{t('update.restart')}</strong>
      </button>
    )
  }

  return null
}
