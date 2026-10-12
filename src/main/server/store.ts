import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { networkInterfaces } from 'node:os'
import { shell } from 'electron'
import { paths } from '../game/paths'
import type { ServerInfo, ServerInput } from '../../shared/types'
import { tm } from '../i18n'

/** Serveurs Minecraft hébergés sur ce PC (page Serveurs) : liste dans servers.json, fichiers dans servers/<id> */
const file = join(paths.root, 'servers.json')
export const serverDirOf = (id: string) => join(paths.root, 'servers', id)

function load(): ServerInfo[] {
  if (!existsSync(file)) return []
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) as ServerInfo[]
  } catch {
    return []
  }
}

function save(servers: ServerInfo[]): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(servers, null, 2))
}

export const listServers = (): ServerInfo[] => load()

export function getServer(id: string): ServerInfo {
  const server = load().find((s) => s.id === id)
  if (!server) throw new Error(tm('err.serverUnknown'))
  return server
}

/** Premier port libre parmi les serveurs déjà créés (25565 = port par défaut de Minecraft) */
export function freePort(): number {
  const used = new Set(load().map((s) => s.port))
  let port = 25565
  while (used.has(port)) port++
  return port
}

/**
 * Crée le serveur. Le joueur a accepté le CLUF de Minecraft (case obligatoire dans la fenêtre de création) :
 * on l'écrit dans eula.txt, comme le demande le serveur au premier démarrage.
 */
export async function createServer(input: ServerInput): Promise<ServerInfo> {
  const server: ServerInfo = { ...input, id: randomUUID().slice(0, 8), createdAt: Date.now(), lastStarted: null }
  const dir = serverDirOf(server.id)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'eula.txt'),
    `# EULA accepted in Aloria (https://aka.ms/MinecraftEULA) on ${new Date().toISOString()}\neula=true\n`
  )
  await writeFile(join(dir, 'server.properties'), `server-port=${server.port}\nmotd=${server.name.replace(/[\r\n]/g, ' ')}\n`)
  save([...load(), server])
  return server
}

export function updateServer(id: string, patch: Partial<ServerInfo>): ServerInfo {
  const servers = load()
  const index = servers.findIndex((s) => s.id === id)
  if (index < 0) throw new Error(tm('err.serverUnknown'))
  servers[index] = { ...servers[index], ...patch, id }
  save(servers)
  return servers[index]
}

export async function deleteServer(id: string): Promise<void> {
  save(load().filter((s) => s.id !== id))
  await rm(serverDirOf(id), { recursive: true, force: true })
}

export async function openServerFolder(id: string): Promise<void> {
  const dir = serverDirOf(id)
  await mkdir(dir, { recursive: true })
  await shell.openPath(dir)
}

/** Adresse du PC sur le réseau local (pour les amis branchés sur la même box) */
export function lanAddress(): string | null {
  const all = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal)
  // Les box donnent presque toujours du 192.168.x.x ; les adaptateurs virtuels (VPN, WSL) passent après
  const best = all.find((i) => i!.address.startsWith('192.168.')) ?? all.find((i) => i!.address.startsWith('10.')) ?? all[0]
  return best?.address ?? null
}
