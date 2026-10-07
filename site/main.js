// Le bouton de téléchargement pointe sur l'installeur de la dernière release GitHub.
// Sans réponse de GitHub, il garde son lien vers la page des releases.
const RELEASES = 'https://api.github.com/repos/Alykell/Aloria/releases/latest'

const buttons = [document.getElementById('download'), ...document.querySelectorAll('.js-download')]
const meta = document.getElementById('download-meta')

for (const link of document.querySelectorAll('.js-download')) {
  link.href = document.getElementById('download').href
}

fetch(RELEASES)
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
  .then((release) => {
    const installer = release.assets.find((a) => /^Aloria-Setup-.*\.exe$/.test(a.name))
    if (!installer) return
    for (const button of buttons) button.href = installer.browser_download_url
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
