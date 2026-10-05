import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchJson, type DownloadTask } from './download'
import { paths } from './paths'

// Index officiel des Java fournis par Mojang (le même que celui du launcher officiel)
const RUNTIMES_URL =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'

type RuntimeIndex = Record<string, Record<string, { manifest: { url: string } }[]>>

interface RuntimeManifest {
  files: Record<
    string,
    { type: 'file' | 'directory' | 'link'; executable?: boolean; downloads?: { raw: { url: string; sha1: string; size: number } } }
  >
}

function platformKey(): string {
  if (process.platform === 'win32') return process.arch === 'arm64' ? 'windows-arm64' : process.arch === 'ia32' ? 'windows-x86' : 'windows-x64'
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  return process.arch === 'ia32' ? 'linux-i386' : 'linux'
}

function javaExecutable(home: string): string {
  if (process.platform === 'win32') return join(home, 'bin', 'javaw.exe')
  if (process.platform === 'darwin') return join(home, 'jre.bundle', 'Contents', 'Home', 'bin', 'java')
  return join(home, 'bin', 'java')
}

/** Prépare l'installation du Java demandé par la version et renvoie le chemin de l'exécutable. */
export async function prepareJava(component: string): Promise<{ tasks: DownloadTask[]; executable: string }> {
  const index = await fetchJson<RuntimeIndex>(RUNTIMES_URL)
  const entry = index[platformKey()]?.[component]?.[0]
  if (!entry) throw new Error(`Java « ${component} » n'est pas disponible pour ce système.`)

  const manifest = await fetchJson<RuntimeManifest>(entry.manifest.url)
  const home = join(paths.runtime, component)
  const tasks: DownloadTask[] = []

  for (const [rel, file] of Object.entries(manifest.files)) {
    const target = join(home, rel)
    if (file.type === 'directory') await mkdir(target, { recursive: true })
    else if (file.type === 'file' && file.downloads) {
      const { url, sha1, size } = file.downloads.raw
      tasks.push({ url, path: target, sha1, size, executable: file.executable })
    }
  }
  return { tasks, executable: javaExecutable(home) }
}
