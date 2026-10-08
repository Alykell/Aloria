// Rendu des SVG de la mascotte en PNG (512 et 128) avec Electron, plus une planche d'aperçu
const { app, BrowserWindow } = require('electron')
const fs = require('fs'); const path = require('path')
const dir = process.argv[process.argv.length - 1]
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 600, height: 600, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<canvas id=c></canvas>')
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))
  for (const f of names) {
    const svg = fs.readFileSync(path.join(dir, f), 'utf8')
    for (const size of [512, 128]) {
      const data = await win.webContents.executeJavaScript(`new Promise((ok, ko) => {
        const img = new Image(); img.onerror = () => ko('svg invalide')
        img.onload = () => { const c = document.getElementById('c'); c.width = c.height = ${size}
          const g = c.getContext('2d'); g.clearRect(0, 0, ${size}, ${size}); g.drawImage(img, 0, 0, ${size}, ${size}); ok(c.toDataURL('image/png')) }
        img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))} })`)
      fs.writeFileSync(path.join(dir, f.replace('.svg', size === 512 ? '.png' : '-128.png')), Buffer.from(data.split(',')[1], 'base64'))
    }
  }
  app.quit()
})
