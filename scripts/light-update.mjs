// Prépare la mise à jour « légère » d'une release : le code du launcher (app.asar) et les jars du mod,
// avec un manifeste (aloria-light.json). Le launcher installé les télécharge et les remplace lui-même
// quand la version d'Electron n'a pas changé, sans lancer d'installeur (bloqué par Windows s'il n'est pas signé).
// Utilisation (CI, après electron-builder) : node scripts/light-update.mjs → fichiers dans dist/light
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const resources = join('dist', 'win-unpacked', 'resources')
const out = join('dist', 'light')
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const electron = JSON.parse(readFileSync(join('node_modules', 'electron', 'package.json'), 'utf8')).version

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

/** asset : nom du fichier dans la release (sans « + », que GitHub n'accepte pas tel quel) ; path : place dans resources */
const files = [{ asset: 'aloria-app.asar', path: 'app.asar' }]
for (const jar of readdirSync(join(resources, 'mods')).filter((f) => f.endsWith('.jar'))) {
  files.push({ asset: jar.replace(/\+/g, '_'), path: `mods/${jar}` })
}

const manifest = {
  version,
  electron,
  files: files.map(({ asset, path }) => {
    const source = join(resources, path)
    copyFileSync(source, join(out, asset))
    return { asset, path, size: statSync(source).size, sha512: createHash('sha512').update(readFileSync(source)).digest('base64') }
  })
}
writeFileSync(join(out, 'aloria-light.json'), JSON.stringify(manifest, null, 2))
console.log(`Mise à jour légère ${version} (Electron ${electron}) : ${files.length} fichiers`)
