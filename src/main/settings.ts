import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { totalmem } from 'node:os'
import { paths } from './game/paths'
import type { Settings } from '../shared/types'

const DEFAULTS: Settings = {
  ramMb: Math.min(4096, Math.floor(totalmem() / 1024 / 1024 / 2 / 512) * 512),
  showSnapshots: false,
  theme: 'auto',
  afterLaunch: 'keep',
  discordPresence: true
}

export function getSettings(): Settings {
  if (!existsSync(paths.settings)) return { ...DEFAULTS }
  try {
    return { ...DEFAULTS, ...(JSON.parse(readFileSync(paths.settings, 'utf8').replace(/^﻿/, '')) as Partial<Settings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  mkdirSync(dirname(paths.settings), { recursive: true })
  writeFileSync(paths.settings, JSON.stringify(next, null, 2))
  return next
}

export const systemRamMb = () => Math.floor(totalmem() / 1024 / 1024)
