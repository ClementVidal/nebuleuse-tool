import { nanoid } from 'nanoid'
import type { IdeaEdge, NodeStyle, NodeTemplate } from './types'

export const DEFAULT_NODE_SIZE = { width: 300, height: 200 }

export const DEFAULT_NODE_STYLE: NodeStyle = {
  color: 'ink',
  strokeWidth: 'medium',
  dashed: false,
  shape: 'card',
}

export const DEFAULT_EDGE: Pick<IdeaEdge, 'label' | 'arrows' | 'color' | 'strokeWidth' | 'path' | 'dash'> = {
  label: '',
  arrows: 'end',
  color: 'ink',
  strokeWidth: 'medium',
  path: 'curved',
  dash: 'solid',
}

/** Templates every new project starts with. */
export function defaultTemplates(projectId: string): NodeTemplate[] {
  return [
    {
      id: nanoid(),
      projectId,
      name: 'Note',
      order: 0,
      style: { color: 'orange', strokeWidth: 'thin', dashed: false, shape: 'sticky' },
      fields: [{ id: nanoid(), label: 'Contenu', type: 'richtext' }],
    },
    {
      id: nanoid(),
      projectId,
      name: 'Réflexion',
      order: 1,
      style: { color: 'blue', strokeWidth: 'medium', dashed: false, shape: 'card' },
      fields: [
        { id: nanoid(), label: 'Contenu', type: 'richtext' },
        { id: nanoid(), label: 'Maturité (1-5)', type: 'number' },
      ],
    },
    {
      id: nanoid(),
      projectId,
      name: 'Research',
      order: 2,
      style: { color: 'green', strokeWidth: 'medium', dashed: true, shape: 'card' },
      fields: [
        { id: nanoid(), label: 'Question', type: 'richtext' },
        { id: nanoid(), label: 'Sources', type: 'richtext' },
        { id: nanoid(), label: 'Date', type: 'date' },
      ],
    },
  ]
}
