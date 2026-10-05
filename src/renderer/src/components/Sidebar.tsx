export type Page = 'home' | 'library' | 'profiles' | 'settings'

const ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'home', label: 'Accueil', icon: '🏝️' },
  { id: 'library', label: 'Bibliothèque', icon: '🐚' },
  { id: 'profiles', label: 'Profils', icon: '⚓' },
  { id: 'settings', label: 'Paramètres', icon: '⚙️' }
]

export default function Sidebar({ page, onChange }: { page: Page; onChange: (p: Page) => void }) {
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
          {it.label}
        </button>
      ))}
    </nav>
  )
}
