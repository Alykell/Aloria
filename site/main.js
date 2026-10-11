// Le bouton télécharge directement la dernière version : chaque release en publie une copie sous un nom fixe
// (…/releases/latest/download/Aloria-Setup.exe, Aloria.AppImage). L'API GitHub ne sert qu'à afficher la version et la taille :
// si elle ne répond pas (limite de requêtes…), le téléchargement marche quand même.
const RELEASES = 'https://api.github.com/repos/Alykell/Aloria/releases/latest'

const button = document.getElementById('download')
const meta = document.getElementById('download-meta')

// Sous Linux (hors Android), le bouton principal propose l'AppImage
const agent = navigator.userAgent
const linux = /Linux|X11/i.test(agent) && !/Android/i.test(agent)
const platform = linux
  ? { label: 'Télécharger pour Linux', file: 'Aloria.AppImage', asset: /^Aloria-[\d.]+\.AppImage$/, system: 'Linux (AppImage)' }
  : { label: 'Télécharger pour Windows', file: 'Aloria-Setup.exe', asset: /^Aloria-Setup.*\.exe$/, system: 'Windows 10 et 11' }

if (linux) {
  button.href = button.href.replace('Aloria-Setup.exe', platform.file)
  button.querySelector('span').textContent = platform.label
  meta.textContent = `Gratuit · ${platform.system}`
}

fetch(RELEASES)
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
  .then((release) => {
    const file = release.assets.find((a) => platform.asset.test(a.name))
    if (!file) return
    const version = release.tag_name.replace(/^v/, '')
    const size = Math.round(file.size / 1024 / 1024)
    meta.textContent = `Version ${version} · ${size} Mo · Gratuit · ${platform.system}`
  })
  .catch(() => {})

// Sur téléphone ou Mac : prévenir qu'Aloria s'installe sur un ordinateur Windows ou Linux
if (!linux && !/Windows/i.test(agent)) {
  const note = document.createElement('p')
  note.className = 'hero__note'
  note.textContent = 'Aloria s’installe sur un PC Windows ou Linux : ouvre cette page depuis ton ordinateur.'
  meta.after(note)
}
