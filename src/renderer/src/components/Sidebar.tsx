import AccountPanel from './AccountPanel'
import UpdateBanner from './UpdateBanner'
import type { AccountsState } from '../hooks/useAccounts'
import { t } from '../i18n'
import type { MessageKey } from '../../../shared/i18n'

export type Page = 'home' | 'library' | 'creations' | 'profiles' | 'gamesettings' | 'settings'

const ITEMS: { id: Page; label: MessageKey; icon: string }[] = [
  { id: 'home', label: 'nav.home', icon: '🏝️' },
  { id: 'library', label: 'nav.library', icon: '🐚' },
  { id: 'creations', label: 'nav.creations', icon: '🎨' },
  { id: 'profiles', label: 'nav.profiles', icon: '⚓' },
  { id: 'gamesettings', label: 'nav.gamesettings', icon: '🎮' },
  { id: 'settings', label: 'nav.settings', icon: '⚙️' }
]

interface Props {
  page: Page
  onChange: (p: Page) => void
  accounts: AccountsState
  onSkin: () => void
}

export default function Sidebar({ page, onChange, accounts, onSkin }: Props) {
  return (
    <nav className="sidebar">
      <div className="sidebar__logo">
        <span className="wave">〰</span>
        <strong>Aloria</strong>
      </div>
      {ITEMS.map((it) => (
        <button
          key={it.id}
          className={'sidebar__item' + (page === it.id ? ' active' : '')}
          onClick={() => onChange(it.id)}
        >
          <span className="icon">{it.icon}</span>
          {t(it.label)}
        </button>
      ))}
      <div className="sidebar__spacer" />
      <UpdateBanner />
      <AccountPanel state={accounts} onSkin={onSkin} />
    </nav>
  )
}
