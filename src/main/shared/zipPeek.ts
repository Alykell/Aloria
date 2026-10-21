import { open } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'

/**
 * Lecture de quelques fichiers d'un zip sans le charger en entier : la fin du zip (son sommaire), puis seulement les
 * fichiers voulus. Marche sur un fichier du disque, un zip en mémoire (jar dans un jar) ou une adresse (lecture par morceaux).
 */
export type ZipSource = (start: number, length: number) => Promise<Buffer | null>

export interface ZipEntry {
  method: number
  compressedSize: number
  offset: number
}

export const bufferSource = (data: Buffer): ZipSource => async (start, length) => data.subarray(start, start + length)

/** Ouvre un fichier du disque ; `close` à appeler une fois la lecture finie */
export async function fileSource(path: string): Promise<{ read: ZipSource; size: number; close: () => Promise<void> }> {
  const handle = await open(path, 'r')
  const { size } = await handle.stat()
  const read: ZipSource = async (start, length) => {
    const buffer = Buffer.alloc(Math.max(0, Math.min(length, size - start)))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start)
    return buffer.subarray(0, bytesRead)
  }
  return { read, size, close: () => handle.close() }
}

/** Adresse lue par morceaux (null si le serveur ne sait pas envoyer seulement une partie) */
export const urlSource = (url: string, headers: Record<string, string> = {}): ZipSource => async (start, length) => {
  const res = await fetch(url, { headers: { ...headers, Range: `bytes=${start}-${start + length - 1}` } })
  if (res.status !== 206) return null
  return Buffer.from(await res.arrayBuffer())
}

/** Sommaire du zip (nom → emplacement), null s'il est illisible ou trop gros pour ce lecteur (zip64) */
export async function zipEntries(read: ZipSource, size: number): Promise<Map<string, ZipEntry> | null> {
  // Fin du sommaire : 22 octets, plus un commentaire de 64 Ko au plus
  const tailStart = Math.max(0, size - 65_557)
  const tail = await read(tailStart, size - tailStart)
  if (!tail) return null
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0 || eocd + 22 > tail.length) return null
  const cdSize = tail.readUInt32LE(eocd + 12)
  const cdOffset = tail.readUInt32LE(eocd + 16)
  if (cdOffset === 0xffffffff) return null
  const cd = cdOffset >= tailStart ? tail.subarray(cdOffset - tailStart, cdOffset - tailStart + cdSize) : await read(cdOffset, cdSize)
  if (!cd) return null

  const entries = new Map<string, ZipEntry>()
  for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
    const nameLen = cd.readUInt16LE(p + 28)
    entries.set(cd.toString('utf8', p + 46, p + 46 + nameLen), {
      method: cd.readUInt16LE(p + 10),
      compressedSize: cd.readUInt32LE(p + 20),
      offset: cd.readUInt32LE(p + 42)
    })
    p += 46 + nameLen + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32)
  }
  return entries
}

/** Contenu d'un fichier du zip (null s'il est illisible) */
export async function zipRead(read: ZipSource, entry: ZipEntry): Promise<Buffer | null> {
  // En-tête local (30 octets + nom + extra) puis les données compressées
  const head = await read(entry.offset, 30)
  if (!head || head.length < 30 || head.readUInt32LE(0) !== 0x04034b50) return null
  const start = entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28)
  const data = entry.compressedSize ? await read(start, entry.compressedSize) : Buffer.alloc(0)
  if (!data) return null
  try {
    return entry.method === 8 ? inflateRawSync(data) : entry.method === 0 ? data : null
  } catch {
    return null
  }
}
