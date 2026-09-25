import { DEFAULT_NODE_STYLE } from '@/db/defaults'
import type { IdeaNode, NodeStyle, NodeTemplate } from '@/db/types'

export function resolveNodeStyle(model: IdeaNode, template: NodeTemplate | undefined): NodeStyle {
  return { ...DEFAULT_NODE_STYLE, ...template?.style, ...model.style }
}
