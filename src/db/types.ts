import type { PaletteColor, StrokeWidth } from './palette'

export type FieldType = 'richtext' | 'number' | 'date' | 'daterange'

export interface TemplateField {
  id: string
  label: string
  type: FieldType
  /** Help shown where the value is entered. */
  description?: string
  /** Shown on the idea on the canvas (default: true). */
  showOnNode?: boolean
  /** Value given to new ideas; for read-only fields, the value of every idea. */
  defaultValue?: FieldValue
  /** The value can't be changed on an idea: it is always the default value. */
  readOnly?: boolean
  /**
   * date / daterange: ideas whose fields share a timeline name are drawn on one timeline
   * (the idea's own date in front, the others behind).
   */
  timelineName?: string
}

/** Style shared by every node of a template (only editable in the template editor). */
/** Card: bordered box. Sticky: post-it look (brighter fill, no border, shadow, folded corner). */
export type NodeShape = 'card' | 'sticky'

export interface NodeStyle {
  /** Drives the text, the border and a dimmed background. */
  color: PaletteColor
  strokeWidth: StrokeWidth
  dashed: boolean
  shape: NodeShape
}

export interface NodeTemplate {
  id: string
  projectId: string
  name: string
  order: number
  style: NodeStyle
  fields: TemplateField[]
}

/** Look of a link: set on the link itself, or shared by every link of a link template. */
export type LinkStyle = Pick<IdeaEdge, 'arrows' | 'color' | 'strokeWidth' | 'path' | 'dash'>

/** Link template ("type de lien"): a name, the label new links get, and a style they share. */
export interface LinkTemplate {
  id: string
  projectId: string
  name: string
  order: number
  /** Label given to a link when it gets this template. */
  label: string
  style: LinkStyle
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
  /** « Référençable »: the map can be placed as a card on the project's other maps. */
  reusable?: boolean
}

/** Richtext values are stored as markdown, dates as ISO `yyyy-mm-dd`, ranges as two dates. */
export type FieldValue = string | number | DateRangeValue | null

export interface DateRangeValue {
  start: string
  end: string
}

export interface IdeaNode {
  id: string
  projectId: string
  mapId: string
  templateId: string
  title: string
  values: Record<string, FieldValue>
  x: number
  y: number
  width: number
  height: number
  /** Map opened when entering this node; created lazily. */
  childMapId: string | null
  /** Set when the node is bookmarked (timestamp, used to order bookmarks). */
  bookmarkedAt?: number
  /** Writing status; absent means draft. */
  status?: IdeaStatus
  /** Reader / editor page spans the full width instead of a centred reading column. */
  fullWidth?: boolean
  /** Stacking order on the canvas (higher = in front); absent means 0. */
  z?: number
  /** Written by Claude through the MCP server (absent: by the user). */
  author?: 'claude'
  /** MCP call that created or last changed the idea. */
  batchId?: string
  /** « Référençable »: can be placed in other maps as an alias (see aliasOf). */
  reusable?: boolean
  /**
   * Alias: this record only holds a place on its map (position, size, links); title, content,
   * template and sub-map are those of the original idea, so editing either updates both.
   */
  aliasOf?: string
  /**
   * Map card: this record stands for another map of the project (a « référençable » one); it has
   * a place, a size and links, no content. Clicking it opens that map.
   */
  mapRef?: string
}

export type IdeaStatus = 'draft' | 'ready'

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
  /** Link template: when it exists, its style replaces the link's own. */
  templateId?: string
}
