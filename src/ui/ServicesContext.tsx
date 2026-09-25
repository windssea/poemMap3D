import { createContext, useContext } from 'react'
import type { AppServices } from '../app/bootstrap'

export const ServicesContext = createContext<AppServices | null>(null)

export function useServices(): AppServices {
  const s = useContext(ServicesContext)
  if (!s) throw new Error('服务尚未就绪')
  return s
}
