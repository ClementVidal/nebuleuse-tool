import { useNavigate, useParams } from '@tanstack/react-router'
import { useCallback } from 'react'
import type { IdeaNode } from '@/db/types'
import { sendMapCommand } from './map-commands'

/** Opens the map holding `node`, then selects the node and pans onto it. */
export function useGoToNode() {
  const navigate = useNavigate()
  const { mapId } = useParams({ strict: false })
  return useCallback(
    (node: Pick<IdeaNode, 'id' | 'mapId' | 'projectId'>) => {
      if (node.mapId === mapId) {
        sendMapCommand({ type: 'focus-node', nodeId: node.id })
        return
      }
      void navigate({
        to: '/projects/$projectId/maps/$mapId',
        params: { projectId: node.projectId, mapId: node.mapId },
        search: { focus: node.id },
      })
    },
    [navigate, mapId],
  )
}
