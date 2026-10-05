export type AuthErrorCode =
  | 'cancelled'
  | 'microsoft'
  | 'no_xbox'
  | 'child'
  | 'xbox_banned'
  | 'xbox'
  | 'app_not_approved'
  | 'minecraft'
  | 'not_owned'
  | 'no_profile'
  | 'unknown'

export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string
  ) {
    super(message)
  }
}

export function toAuthError(err: unknown): AuthError {
  if (err instanceof AuthError) return err
  return new AuthError('unknown', err instanceof Error ? err.message : String(err))
}
