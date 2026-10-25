import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gameDirOf } from '../profiles'
import type { GameConsoleChunk } from '../../shared/types'

/** Au premier affichage, seule la fin d'un long journal est montrée */
const FIRST_READ = 512 * 1024

// Le jeu écrit son journal en XML de log4j quand un launcher le lance (configuration « client-1.12.xml » de Mojang)
const EVENT = /<log4j:Event logger="([^"]*)" timestamp="(\d+)" level="(\w+)" thread="([^"]*)">([\s\S]*?)<\/log4j:Event>/g
const cdata = (xml: string, tag: string) => {
  const m = new RegExp(`<log4j:${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></log4j:${tag}>`).exec(xml)
  // Un « ]]> » dans le texte est coupé en deux blocs CDATA
  return m ? m[1].replace(/\]\]><!\[CDATA\[/g, '') : ''
}
const time = (ms: number) => new Date(ms).toTimeString().slice(0, 8)

/**
 * Sortie du jeu rendue lisible : chaque événement XML devient « [12:34:56] [Render thread/INFO]: message »
 * (+ l'exception), le reste (texte brut de Java ou des mods) est gardé tel quel.
 * `consumed` s'arrête avant un événement pas encore terminé d'écrire.
 */
export function readableLog(text: string): { text: string; consumed: number } {
  let out = ''
  let last = 0
  for (const m of text.matchAll(EVENT)) {
    out += rawPart(text.slice(last, m.index))
    const [, , timestamp, level, thread, body] = m
    const throwable = cdata(body, 'Throwable').trimEnd()
    out += `[${time(Number(timestamp))}] [${thread}/${level}]: ${cdata(body, 'Message')}\n${throwable ? throwable + '\n' : ''}`
    last = m.index + m[0].length
  }
  const pending = text.indexOf('<log4j:', last)
  const end = pending >= 0 ? pending : text.length
  out += rawPart(text.slice(last, end))
  return { text: out, consumed: end }
}

/** Texte hors événements : lignes vides (indentation du XML) retirées */
const rawPart = (s: string) =>
  s
    .split(/(?<=\n)/)
    .filter((l) => l.trim())
    .join('')

/**
 * Suite de la sortie du jeu depuis `offset` (tout ce qu'il écrit, y compris avant son propre latest.log).
 * Le fichier est recréé à chaque lancement : plus court que l'offset, on repart du début (`reset`).
 */
export function readGameConsole(profileId: string, offset: number): GameConsoleChunk {
  const file = join(gameDirOf(profileId), 'logs', 'aloria-launch.log')
  let size: number
  try {
    size = statSync(file).size
  } catch {
    return { text: '', offset: 0, reset: offset > 0, missing: true }
  }
  const reset = size < offset
  let start = reset ? 0 : offset
  if (start === 0 && size > FIRST_READ) start = size - FIRST_READ
  if (start === size) return { text: '', offset: size, reset, missing: false }
  const buffer = Buffer.alloc(size - start)
  const fd = openSync(file, 'r')
  try {
    readSync(fd, buffer, 0, buffer.length, start)
  } finally {
    closeSync(fd)
  }
  // Lecture commencée au milieu du fichier : on repart de la ligne suivante
  const skipped = start > 0 && start !== offset ? buffer.indexOf(10) + 1 : 0
  const raw = buffer.subarray(skipped).toString('utf8')
  const { text, consumed } = readableLog(raw)
  return { text, offset: start + skipped + Buffer.byteLength(raw.slice(0, consumed)), reset, missing: false }
}
