// Le bouton télécharge directement le dernier installeur : chaque release en publie une copie sous un nom fixe
// (…/releases/latest/download/Aloria-Setup.exe). L'API GitHub ne sert qu'à afficher la version et la taille :
// si elle ne répond pas (limite de requêtes…), le téléchargement marche quand même.
const RELEASES = 'https://api.github.com/repos/Alykell/Aloria/releases/latest'

const meta = document.getElementById('download-meta')

fetch(RELEASES)
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
  .then((release) => {
    const installer = release.assets.find((a) => /^Aloria-Setup.*\.exe$/.test(a.name))
    if (!installer) return
    const version = release.tag_name.replace(/^v/, '')
    const size = Math.round(installer.size / 1024 / 1024)
    meta.textContent = `Version ${version} · ${size} Mo · Gratuit · Windows 10 et 11`
  })
  .catch(() => {})

// Sur téléphone ou Mac : prévenir que l'installeur est pour un PC Windows
if (!/Windows/i.test(navigator.userAgent)) {
  const note = document.createElement('p')
  note.className = 'hero__note'
  note.textContent = 'Aloria s’installe sur un PC Windows : ouvre cette page depuis ton ordinateur.'
  meta.after(note)
}
