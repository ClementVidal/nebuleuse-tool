import { nanoid } from 'nanoid'
import type { IdeaEdge, LinkStyle, LinkTemplate, NodeStyle, NodeTemplate } from './types'

export const DEFAULT_NODE_SIZE = { width: 300, height: 200 }

export const DEFAULT_NODE_STYLE: NodeStyle = {
  color: 'ink',
  strokeWidth: 'medium',
  dashed: false,
  shape: 'card',
}

/** New links read as a sentence, "A lié à B", until renamed. */
export const DEFAULT_EDGE: Pick<IdeaEdge, 'label' | 'arrows' | 'color' | 'strokeWidth' | 'path' | 'dash'> = {
  label: 'lié à',
  arrows: 'end',
  color: 'ink',
  strokeWidth: 'medium',
  path: 'curved',
  dash: 'solid',
}

/** Size of a map card (a node standing for another map). */
export const MAP_CARD_SIZE = { width: 260, height: 132 }

const linkStyle = (style: Partial<LinkStyle>): LinkStyle => ({
  arrows: DEFAULT_EDGE.arrows,
  color: DEFAULT_EDGE.color,
  strokeWidth: DEFAULT_EDGE.strokeWidth,
  path: DEFAULT_EDGE.path,
  dash: DEFAULT_EDGE.dash,
  ...style,
})

/** Link templates every new project starts with; the first one is used for new links. */
export function defaultLinkTemplates(projectId: string): LinkTemplate[] {
  return [
    { id: nanoid(), projectId, order: 0, name: 'Lien', label: 'lié à', style: linkStyle({}) },
    { id: nanoid(), projectId, order: 1, name: 'Cause', label: 'cause', style: linkStyle({ color: 'red', strokeWidth: 'thick' }) },
    { id: nanoid(), projectId, order: 2, name: 'Opposition', label: 's’oppose à', style: linkStyle({ color: 'violet', dash: 'dashed', arrows: 'both' }) },
    { id: nanoid(), projectId, order: 3, name: 'Illustration', label: 'illustre', style: linkStyle({ color: 'green', dash: 'dotted' }) },
  ]
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
