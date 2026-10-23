// Textures des cosmétiques (pixel art), au format des modèles Minecraft : node scripts/cosmetics-textures.mjs
// Écrites pour le launcher (aperçu 3D) et pour Aloria HUD (dessin en jeu) : une seule source.
//  - aloria_cape.png : cape 64×32 (face extérieure en (1,1), 10×16)
//  - pumpkin_hat.png : cubes en « box UV » — citrouille 10×6×10 en (0,0), tige 2×3×2 en (0,16)
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = [join(root, 'src/renderer/src/assets/cosmetics'), join(root, 'mod/src/main/resources/assets/aloriahud/textures/cosmetics')]

function image(w, h) {
  const px = new Uint8Array(w * h * 4)
  const set = (x, y, hex) => {
    const i = (y * w + x) * 4
    px[i] = parseInt(hex.slice(1, 3), 16)
    px[i + 1] = parseInt(hex.slice(3, 5), 16)
    px[i + 2] = parseInt(hex.slice(5, 7), 16)
    px[i + 3] = 255
  }
  const rect = (x, y, rw, rh, color) => {
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) set(x + i, y + j, typeof color === 'function' ? color(i, j) : color)
  }
  return { w, h, px, set, rect }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function png({ w, h, px }) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) Buffer.from(px.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// ---------------------------------------------------------------- cape Aloria : mer profonde, « A » doré, vagues
function cape() {
  const img = image(64, 32)
  const deep = '#073f5c'
  img.rect(0, 0, 22, 17, deep)
  const gold = '#e8c872'
  const sea = ['#0b5f86', '#0b5f86', '#0a5a80', '#0a557a', '#095074', '#084b6e', '#084668', '#074262']
  // Face extérieure 10×16 en (1,1) : dégradé, bordure, lettre, deux rangs de vagues
  img.rect(1, 1, 10, 16, (x, y) => (x === 0 || x === 9 || y === 0 || y === 15 ? gold : sea[Math.floor(y / 2)]))
  const letter = ['.##.', '#..#', '####', '#..#', '#..#']
  letter.forEach((row, j) => [...row].forEach((c, i) => c === '#' && img.set(1 + 3 + i, 1 + 3 + j, gold)))
  const wave = (y, color) => {
    for (let x = 1; x < 9; x++) img.set(1 + x, 1 + y + (x % 4 < 2 ? 0 : 1), color)
  }
  wave(9, '#5cc8e0')
  wave(12, '#e8f6fb')
  return img
}

// ---------------------------------------------------------------- chapeau citrouille : petite citrouille allumée sur la tête
function pumpkin() {
  const img = image(64, 32)
  const side = (x, y) => (y === 5 ? '#b85e10' : x % 3 === 0 ? '#c4661a' : y === 0 ? '#ef9530' : '#e8831f')
  // Corps 10×6×10 en (0,0) : dessus (10,0), dessous (20,0), côtés en y = 10 : gauche (0), avant (10), droite (20), arrière (30)
  img.rect(10, 0, 10, 10, (x, y) => (x >= 4 && x <= 5 && y >= 4 && y <= 5 ? '#7a4010' : (x + y) % 3 === 0 ? '#d9741c' : '#e8831f'))
  img.rect(20, 0, 10, 10, '#b85e10')
  for (const u of [0, 10, 20, 30]) img.rect(u, 10, 10, 6, side)
  // Visage allumé sur l'avant
  const face = ['..........', '..##..##..', '..........', '.#......#.', '..######..', '..........']
  face.forEach((row, j) => [...row].forEach((c, i) => c === '#' && img.set(10 + i, 10 + j, '#ffd24a')))
  // Tige 2×3×2 en (0,16) : dessus (2,16), dessous (4,16), côtés en y = 18
  img.rect(2, 16, 2, 2, '#5c8f26')
  img.rect(4, 16, 2, 2, '#3d6b18')
  img.rect(0, 18, 8, 3, (x, y) => (x % 2 === 0 ? '#4a7a1e' : y === 0 ? '#5c8f26' : '#3d6b18'))
  return img
}

for (const dir of OUT) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'aloria_cape.png'), png(cape()))
  writeFileSync(join(dir, 'pumpkin_hat.png'), png(pumpkin()))
}
console.log('textures écrites dans', OUT.join(', '))
