import { useEffect, useState } from 'react'
import { t } from './i18n'

/**
 * Demande de confirmation dans le style du launcher, à la place de confirm() (fenêtre grise de Windows) :
 * `if (!(await askConfirm(texte))) return`. <ConfirmHost /> (dans App) l'affiche par-dessus tout le reste.
 */
interface Request {
  message: string
  confirmLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}

let show: ((request: Request | null) => void) | null = null

export function askConfirm(message: string, options: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.confirm(message))
    show({ message, confirmLabel: options.confirmLabel ?? t('common.confirm'), danger: options.danger ?? true, resolve })
  })
}

// Développement : appelable depuis le processus principal pour les captures (ALORIA_CAPTURE_CONFIRM)
if (import.meta.env.DEV) (window as unknown as { aloriaAskConfirm: typeof askConfirm }).aloriaAskConfirm = askConfirm

export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null)
  useEffect(() => {
    show = setRequest
    return () => {
      show = null
    }
  }, [])
  const answer = (ok: boolean) => {
    setRequest(null)
    request?.resolve(ok)
  }
  useEffect(() => {
    if (!request) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return
      // Pas jusqu'aux fenêtres en dessous (Échap les fermerait) ni au bouton qui a le focus (deux réponses)
      e.preventDefault()
      e.stopPropagation()
      answer(e.key === 'Enter')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [request])
  if (!request) return null
  return (
    <div className="overlay confirm-overlay" onClick={(e) => (e.stopPropagation(), answer(false))}>
      <div className="dialog confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <p>{request.message}</p>
        <div className="dialog__actions">
          <button className="secondary" onClick={() => answer(false)}>
            {t('common.cancel')}
          </button>
          <button autoFocus className={request.danger ? 'danger-btn' : 'primary'} onClick={() => answer(true)}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
