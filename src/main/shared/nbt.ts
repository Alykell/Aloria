/**
 * NBT non compressé (format des fichiers de Minecraft comme servers.dat) : juste ce qu'il faut pour lire la liste des
 * serveurs du menu Multijoueur, y ajouter une entrée et la réécrire sans rien perdre des autres champs.
 */

export type NbtValue =
  | { type: 1; value: number }
  | { type: 2; value: number }
  | { type: 3; value: number }
  | { type: 4; value: bigint }
  | { type: 5; value: number }
  | { type: 6; value: number }
  | { type: 7; value: Buffer }
  | { type: 8; value: string }
  | { type: 9; itemType: number; value: NbtValue[] }
  | { type: 10; value: Map<string, NbtValue> }
  | { type: 11; value: number[] }
  | { type: 12; value: bigint[] }

class Reader {
  pos = 0
  constructor(private buf: Buffer) {}
  byte = () => this.buf.readInt8(this.pos++)
  short() {
    const v = this.buf.readInt16BE(this.pos)
    this.pos += 2
    return v
  }
  int() {
    const v = this.buf.readInt32BE(this.pos)
    this.pos += 4
    return v
  }
  long() {
    const v = this.buf.readBigInt64BE(this.pos)
    this.pos += 8
    return v
  }
  string() {
    const len = this.buf.readUInt16BE(this.pos)
    this.pos += 2
    const s = this.buf.toString('utf8', this.pos, this.pos + len)
    this.pos += len
    return s
  }
  payload(type: number): NbtValue {
    switch (type) {
      case 1:
        return { type, value: this.byte() }
      case 2:
        return { type, value: this.short() }
      case 3:
        return { type, value: this.int() }
      case 4:
        return { type, value: this.long() }
      case 5: {
        const v = this.buf.readFloatBE(this.pos)
        this.pos += 4
        return { type, value: v }
      }
      case 6: {
        const v = this.buf.readDoubleBE(this.pos)
        this.pos += 8
        return { type, value: v }
      }
      case 7: {
        const len = this.int()
        const v = this.buf.subarray(this.pos, this.pos + len)
        this.pos += len
        return { type, value: Buffer.from(v) }
      }
      case 8:
        return { type, value: this.string() }
      case 9: {
        const itemType = this.byte()
        const len = this.int()
        return { type, itemType, value: Array.from({ length: len }, () => this.payload(itemType)) }
      }
      case 10: {
        const map = new Map<string, NbtValue>()
        for (let t = this.byte(); t !== 0; t = this.byte()) map.set(this.string(), this.payload(t))
        return { type, value: map }
      }
      case 11:
        return { type, value: Array.from({ length: this.int() }, () => this.int()) }
      case 12:
        return { type, value: Array.from({ length: this.int() }, () => this.long()) }
      default:
        throw new Error(`NBT : type ${type} inconnu`)
    }
  }
}

/** Lit un fichier NBT non compressé (compound racine) */
export function readNbt(buf: Buffer): Map<string, NbtValue> {
  const r = new Reader(buf)
  if (r.byte() !== 10) throw new Error('NBT : racine attendue')
  r.string()
  return (r.payload(10) as { value: Map<string, NbtValue> }).value
}

function writePayload(out: Buffer[], v: NbtValue): void {
  const num = (size: number, write: (b: Buffer) => void) => {
    const b = Buffer.alloc(size)
    write(b)
    out.push(b)
  }
  const str = (s: string) => {
    const data = Buffer.from(s, 'utf8')
    num(2, (b) => b.writeUInt16BE(data.length))
    out.push(data)
  }
  switch (v.type) {
    case 1:
      return num(1, (b) => b.writeInt8(v.value))
    case 2:
      return num(2, (b) => b.writeInt16BE(v.value))
    case 3:
      return num(4, (b) => b.writeInt32BE(v.value))
    case 4:
      return num(8, (b) => b.writeBigInt64BE(v.value))
    case 5:
      return num(4, (b) => b.writeFloatBE(v.value))
    case 6:
      return num(8, (b) => b.writeDoubleBE(v.value))
    case 7:
      num(4, (b) => b.writeInt32BE(v.value.length))
      out.push(v.value)
      return
    case 8:
      return str(v.value)
    case 9:
      num(1, (b) => b.writeInt8(v.value.length ? v.itemType : 0))
      num(4, (b) => b.writeInt32BE(v.value.length))
      for (const item of v.value) writePayload(out, item)
      return
    case 10:
      for (const [name, child] of v.value) {
        num(1, (b) => b.writeInt8(child.type))
        str(name)
        writePayload(out, child)
      }
      num(1, (b) => b.writeInt8(0))
      return
    case 11:
      num(4, (b) => b.writeInt32BE(v.value.length))
      for (const n of v.value) num(4, (b) => b.writeInt32BE(n))
      return
    case 12:
      num(4, (b) => b.writeInt32BE(v.value.length))
      for (const n of v.value) num(8, (b) => b.writeBigInt64BE(n))
      return
  }
}

/** Écrit un compound racine en NBT non compressé */
export function writeNbt(root: Map<string, NbtValue>): Buffer {
  const out: Buffer[] = [Buffer.from([10, 0, 0])]
  writePayload(out, { type: 10, value: root })
  return Buffer.concat(out)
}

/** Ajoute un serveur à servers.dat (créé s'il n'existe pas) ; rien si l'adresse y est déjà. Renvoie le nouveau contenu */
export function addServerEntry(existing: Buffer | null, name: string, address: string): Buffer | null {
  const root = existing ? readNbt(existing) : new Map<string, NbtValue>()
  const list = root.get('servers')
  const servers: NbtValue[] = list && list.type === 9 ? list.value : []
  const already = servers.some((s) => s.type === 10 && (s.value.get('ip') as { value?: string } | undefined)?.value === address)
  if (already) return null
  const entry: NbtValue = {
    type: 10,
    value: new Map<string, NbtValue>([
      ['ip', { type: 8, value: address }],
      ['name', { type: 8, value: name }]
    ])
  }
  root.set('servers', { type: 9, itemType: 10, value: [entry, ...servers] })
  return writeNbt(root)
}
