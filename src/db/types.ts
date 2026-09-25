import type { PaletteColor, StrokeWidth } from './palette'

export type FieldType = 'richtext' | 'date' | 'number'

export interface TemplateField {
  id: string
  label: string
  type: FieldType
}

export type FillStyle = 'solid' | 'hachure' | 'cross-hatch' | 'none'

export interface NodeStyle {
  stroke: PaletteColor
  background: PaletteColor
  strokeWidth: StrokeWidth
  fillStyle: FillStyle
}

export interface NodeTemplate {
  id: string
  projectId: string
  name: string
  order: number
  style: NodeStyle
  fields: TemplateField[]
}

export interface Project {
  id: string
  name: string
  rootMapId: string
  createdAt: number
  updatedAt: number
}

export interface ReflexionMap {
  id: string
  projectId: string
  /** Node that owns this map; null for the project's root map. */
  parentNodeId: string | null
  viewport?: { x: number; y: number; zoom: number }
}

/** Richtext values are stored as markdown, dates as ISO `yyyy-mm-dd`. */
export type FieldValue = string | number | null

export interface IdeaNode {
  id: string
  projectId: string
  mapId: string
  templateId: string
  title: string
  values: Record<string, FieldValue>
  /** Per-node overrides of the template style. */
  style?: Partial<NodeStyle>
  x: number
  y: number
  width: number
  height: number
  /** Map opened when entering this node; created lazily. */
  childMapId: string | null
}

export type ArrowMode = 'none' | 'start' | 'end' | 'both'
export type EdgePathKind = 'straight' | 'curved'
export type EdgeDash = 'solid' | 'dashed' | 'dotted'

export interface IdeaEdge {
  id: string
  projectId: string
  mapId: string
  source: string
  target: string
  label: string
  arrows: ArrowMode
  color: PaletteColor
  strokeWidth: StrokeWidth
  path: EdgePathKind
  dash: EdgeDash
}
