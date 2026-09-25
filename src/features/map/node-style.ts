import { DEFAULT_NODE_STYLE } from '@/db/defaults'
import type { FillStyle, IdeaNode, NodeStyle, NodeTemplate } from '@/db/types'

export function resolveNodeStyle(model: IdeaNode, template: NodeTemplate | undefined): NodeStyle {
  return { ...DEFAULT_NODE_STYLE, ...template?.style, ...model.style }
}

export const FILL_STYLE_OPTIONS: { value: FillStyle; label: string }[] = [
  { value: 'solid', label: 'Plein' },
  { value: 'hachure', label: 'Hachures' },
  { value: 'cross-hatch', label: 'Croisé' },
  { value: 'none', label: 'Aucun' },
]
