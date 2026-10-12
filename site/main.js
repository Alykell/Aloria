// Site en français (racine) et en anglais (en/). La langue de la page est celle de <html lang>.
const lang = document.documentElement.lang === 'en' ? 'en' : 'fr'
const T = {
  fr: {
    linux: 'Télécharger pour Linux',
    windows: 'Télécharger pour Windows',
    linuxSystem: 'Linux (AppImage)',
    windowsSystem: 'Windows 10 et 11',
    free: 'Gratuit',
    version: (v, size, system) => `Version ${v} · ${size} Mo · Gratuit · ${system}`,
    otherSystem: 'Aloria s’installe sur un PC Windows ou Linux : ouvre cette page depuis ton ordinateur.'
  },
  en: {
    linux: 'Download for Linux',
    windows: 'Download for Windows',
    linuxSystem: 'Linux (AppImage)',
    windowsSystem: 'Windows 10 and 11',
    free: 'Free',
    version: (v, size, system) => `Version ${v} · ${size} MB · Free · ${system}`,
    otherSystem: 'Aloria installs on a Windows or Linux PC: open this page from your computer.'
  }
}[lang]

// Langue choisie avec le lien « English » / « Français » : retenue pour les visites suivantes
const STORAGE = 'aloria-lang'
const saved = (() => {
  try {
    return localStorage.getItem(STORAGE)
  } catch {
    return null
  }
})()
for (const link of document.querySelectorAll('.js-lang')) {
  link.addEventListener('click', () => {
    try {
      localStorage.setItem(STORAGE, link.dataset.lang)
    } catch {
      // Stockage bloqué : le lien marche quand même
    }
  })
}

// Page d'accueil : première visite d'un navigateur qui n'est pas en français → version anglaise
// (et l'inverse si le visiteur a choisi l'autre langue)
const home = /\/(en\/)?(index\.html)?$/.test(location.pathname)
if (home) {
  const browserFr = (navigator.languages?.[0] ?? navigator.language ?? 'fr').toLowerCase().startsWith('fr')
  const wanted = saved ?? (browserFr ? 'fr' : 'en')
  if (wanted !== lang) location.replace((lang === 'fr' ? 'en/' : '../') + location.hash)
}

// Le bouton télécharge directement la dernière version : chaque release en publie une copie sous un nom fixe
// (…/releases/latest/download/Aloria-Setup.exe, Aloria.AppImage). L'API GitHub ne sert qu'à afficher la version et la taille :
// si elle ne répond pas (limite de requêtes…), le téléchargement marche quand même.
const RELEASES = 'https://api.github.com/repos/Alykell/Aloria/releases/latest'
const button = document.getElementById('download')
const meta = document.getElementById('download-meta')

if (button && meta) {
  // Sous Linux (hors Android), le bouton principal propose l'AppImage
  const agent = navigator.userAgent
  const linux = /Linux|X11/i.test(agent) && !/Android/i.test(agent)
  const platform = linux
    ? { label: T.linux, file: 'Aloria.AppImage', asset: /^Aloria-[\d.]+\.AppImage$/, system: T.linuxSystem }
    : { label: T.windows, file: 'Aloria-Setup.exe', asset: /^Aloria-Setup.*\.exe$/, system: T.windowsSystem }

  if (linux) {
    button.href = button.href.replace('Aloria-Setup.exe', platform.file)
    button.querySelector('span').textContent = platform.label
    meta.textContent = `${T.free} · ${platform.system}`
  }

  fetch(RELEASES)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((release) => {
      const file = release.assets.find((a) => platform.asset.test(a.name))
      if (!file) return
      const version = release.tag_name.replace(/^v/, '')
      meta.textContent = T.version(version, Math.round(file.size / 1024 / 1024), platform.system)
    })
    .catch(() => {})

  // Sur téléphone ou Mac : prévenir qu'Aloria s'installe sur un ordinateur Windows ou Linux
  if (!linux && !/Windows/i.test(agent)) {
    const note = document.createElement('p')
    note.className = 'hero__note'
    note.textContent = T.otherSystem
    meta.after(note)
  }
}
