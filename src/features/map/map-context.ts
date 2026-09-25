import { createContext, useContext } from 'react'
import type { NodeTemplate } from '@/db/types'

export interface MapActions {
  templates: Map<string, NodeTemplate>
  openNode: (nodeId: string) => void
  editNode: (nodeId: string) => void
  /** Go to the parent map; undefined on a project's root map. */
  navigateUp: (() => void) | undefined
  /** Number of ideas in each child map, keyed by map id. */
  childMapSizes: Map<string, number>
}

export const MapContext = createContext<MapActions | null>(null)

export function useMapActions(): MapActions {
  const ctx = useContext(MapContext)
  if (!ctx) throw new Error('useMapActions must be used inside <MapContext>')
  return ctx
}
