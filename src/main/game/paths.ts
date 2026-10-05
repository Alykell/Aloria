import { app } from 'electron'
import { join } from 'node:path'

// Tout ce qui concerne le jeu vit dans %APPDATA%\.aloria, séparé du launcher officiel
export const ROOT = join(app.getPath('appData'), '.aloria')

export const paths = {
  root: ROOT,
  versions: join(ROOT, 'versions'),
  libraries: join(ROOT, 'libraries'),
  assets: join(ROOT, 'assets'),
  runtime: join(ROOT, 'runtime'),
  instances: join(ROOT, 'instances'),
  settings: join(ROOT, 'settings.json'),
  versionDir: (id: string) => join(ROOT, 'versions', id),
  versionJson: (id: string) => join(ROOT, 'versions', id, `${id}.json`),
  versionJar: (id: string) => join(ROOT, 'versions', id, `${id}.jar`),
  natives: (id: string) => join(ROOT, 'versions', id, 'natives')
}
