export interface PublicAccount {
  uuid: string
  name: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: string; error: string }
