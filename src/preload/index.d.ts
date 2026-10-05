import type { AloriaApi } from './index'

declare global {
  interface Window {
    aloria: AloriaApi
  }
}
