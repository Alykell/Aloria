import { closeSync, openSync, readSync, statSync } from 'node:fs'

/**
 * Suit le journal du jeu pour savoir où joue le joueur (serveur, monde solo, menus),
 * à partir des messages que Minecraft écrit lui-même.
 */
const CONNECTING = /Connecting to ([^,\s]+), (\d+)/
const SOLO = /Starting integrated minecraft server/
const LEFT = /Client disconnected with reason|Stopping server/

export function watchGameLog(file: string, onServer: (server: string | null) => void): () => void {
  let offset = 0
  let rest = ''

  const read = () => {
    try {
      const size = statSync(file).size
      if (size < offset) offset = 0
      if (size === offset) return
      const fd = openSync(file, 'r')
      const buffer = Buffer.alloc(size - offset)
      readSync(fd, buffer, 0, buffer.length, offset)
      closeSync(fd)
      offset = size
      const lines = (rest + buffer.toString('utf8')).split(/\r?\n/)
      rest = lines.pop() ?? ''
      for (const line of lines) {
        const m = CONNECTING.exec(line)
        // Port par défaut masqué : « donutsmp.net » plutôt que « donutsmp.net:25565 »
        if (m) onServer(m[2] === '25565' ? m[1] : `${m[1]}:${m[2]}`)
        else if (SOLO.test(line)) onServer('solo')
        else if (LEFT.test(line)) onServer(null)
      }
    } catch {
      // Journal pas encore créé
    }
  }

  const timer = setInterval(read, 2000)
  return () => clearInterval(timer)
}
