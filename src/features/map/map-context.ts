import { createContext, useContext } from 'react'
import type { NodeTemplate } from '@/db/types'

export interface MapActions {
  templates: Map<string, NodeTemplate>
  /** Enter the idea's own map ("Explorer l'idée"). */
  openNode: (nodeId: string) => void
  openSettings: (nodeId: string) => void
  /** Delete an idea (asks for confirmation when its map has content). */
  requestDelete: (nodeId: string) => void
  /** Go to the parent map; undefined on a project's root map. */
  navigateUp: (() => void) | undefined
  /** Number of ideas in each child map, keyed by map id. */
  childMapSizes: Map<string, number>
  /** Node whose click menu is open. */
  menuNodeId: string | undefined
  /** Read-only canvas (see lock-store). */
  locked: boolean
  closeMenu: () => void
}

export const MapContext = createContext<MapActions | null>(null)

export function useMapActions(): MapActions {
  const ctx = useContext(MapContext)
  if (!ctx) throw new Error('useMapActions must be used inside <MapContext>')
  return ctx
}
