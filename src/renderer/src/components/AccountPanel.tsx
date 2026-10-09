import { useState } from 'react'
import type { AccountsState } from '../hooks/useAccounts'
import { t } from '../i18n'

const head = (uuid: string) => `https://mc-heads.net/avatar/${uuid}/64`

export default function AccountPanel({ state, onSkin }: { state: AccountsState; onSkin: () => void }) {
  const { accounts, active, busy, add, select, remove } = state
  const [open, setOpen] = useState(false)

  if (!active) {
    return (
      <div className="account">
        <button className="account__login" onClick={add} disabled={busy}>
          {busy ? t('common.connecting') : t('common.login')}
        </button>
      </div>
    )
  }

  return (
    <div className="account">
      {open && (
        <div className="account__menu">
          {accounts
            .filter((a) => a.uuid !== active.uuid)
            .map((a) => (
              <button
                key={a.uuid}
                className="account__row"
                onClick={() => {
                  select(a.uuid)
                  setOpen(false)
                }}
              >
                <img src={head(a.uuid)} alt="" />
                {a.name}
              </button>
            ))}
          <button
            className="account__action"
            onClick={() => {
              setOpen(false)
              onSkin()
            }}
          >
            {t('home.changeSkin')}
          </button>
          <button
            className="account__action"
            onClick={() => {
              setOpen(false)
              add()
            }}
          >
            {t('account.add')}
          </button>
          <button
            className="account__action danger"
            onClick={() => {
              setOpen(false)
              remove(active.uuid)
            }}
          >
            {t('account.logout')}
          </button>
        </div>
      )}
      <button className="account__current" onClick={() => setOpen(!open)} disabled={busy}>
        <img src={head(active.uuid)} alt="" />
        <span>
          <strong>{active.name}</strong>
          <small>{busy ? t('common.connecting') : t('account.microsoft')}</small>
        </span>
        {/* Vers le haut : la liste des comptes s'ouvre au-dessus */}
        <svg className={`chevron ${open ? 'open' : ''}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 7.5 6 4l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
