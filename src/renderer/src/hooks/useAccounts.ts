import { useCallback, useEffect, useState } from 'react'
import type { PublicAccount } from '../../../shared/types'

export function useAccounts() {
  const [accounts, setAccounts] = useState<PublicAccount[]>([])
  const [activeUuid, setActiveUuid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await window.aloria.accounts.list()
    setAccounts(res.accounts)
    setActiveUuid(res.active)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const add = async () => {
    setBusy(true)
    setError(null)
    const res = await window.aloria.accounts.add()
    if (!res.ok && res.code !== 'cancelled') setError(res.error)
    await refresh()
    setBusy(false)
  }

  const select = async (uuid: string) => {
    await window.aloria.accounts.select(uuid)
    await refresh()
  }

  const remove = async (uuid: string) => {
    await window.aloria.accounts.remove(uuid)
    await refresh()
  }

  const active = accounts.find((a) => a.uuid === activeUuid) ?? null

  return { accounts, active, busy, error, clearError: () => setError(null), add, select, remove }
}

export type AccountsState = ReturnType<typeof useAccounts>
