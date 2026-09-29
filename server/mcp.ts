import {
  buildMap,
  createProject,
  DomainError,
  getMap,
  getOutline,
  listProjects,
  listTemplates,
  search,
  Store,
  updateMap,
  type BuildTarget,
  type MapInput,
  type Operation,
} from './domain.js'
import type { Sql } from './store.js'

/**
 * MCP server (Streamable HTTP, stateless, JSON responses): lets Claude read and write the user's
 * Nébuleuse maps. Implements the JSON-RPC methods Claude uses: initialize, ping, tools/list,
 * tools/call (notifications are acknowledged).
 */

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const INSTRUCTIONS = `Nébuleuse est un outil de réflexion en cartes d'idées imbriquées : chaque idée d'une carte peut
s'ouvrir sur sa propre carte (sous-carte) qui la détaille. Tu es l'éditeur, l'utilisateur est le lecteur :
il lit tes idées dans l'app, confortablement, sur téléphone ou ordinateur.

Méthode :
- Commence par list_projects puis get_outline pour voir ce qui existe ; list_templates pour les templates
  et leurs champs (texte, nombre, date, période).
- Construis avec build_map : une carte entière en un appel (idées + liens), avec des sous-cartes via
  "children" pour approfondir une idée. Le placement est automatique.
- Rédige de vraies idées : un titre court et parlant, un texte en Markdown (titres ##, listes, citations)
  de quelques paragraphes, lisible seul. Relie les idées par des liens nommés (« cause », « s'oppose à »,
  « illustre »…).
- Les idées que tu crées sont marquées « écrites par Claude » et en statut Brouillon ; l'utilisateur les passe à
  Prêt en les relisant. Pour corriger ou compléter, utilise update_map (modifications, suppressions, liens).
- Écris dans la langue de l'utilisateur (français par défaut).`

type Json = Record<string, unknown>

interface Tool {
  name: string
  title: string
  description: string
  inputSchema: Json
  annotations?: Json
  run: (store: Store, args: Json) => Promise<unknown>
}

const ideaSchema: Json = {
  type: 'object',
  properties: {
    key: { type: 'string', description: 'Identifiant libre de l’idée dans cet appel, pour la relier (liens).' },
    title: { type: 'string', description: 'Titre court et parlant.' },
    template: { type: 'string', description: 'Nom du template (voir list_templates). Par défaut « Réflexion ».' },
    text: { type: 'string', description: 'Contenu en Markdown : va dans le premier champ texte du template.' },
    fields: {
      type: 'object',
      description:
        'Autres champs, par nom : nombre, date "AAAA-MM-JJ", période { "start": "AAAA-MM-JJ", "end": "AAAA-MM-JJ" }, ou texte Markdown.',
      additionalProperties: true,
    },
    status: { type: 'string', enum: ['draft', 'ready'], description: 'Par défaut draft (Brouillon).' },
    children: { $ref: '#/$defs/map', description: 'La sous-carte de cette idée (ses propres idées et liens), construite dans le même appel.' },
  },
  required: ['title'],
}

const mapSchema: Json = {
  type: 'object',
  properties: {
    ideas: { type: 'array', items: { $ref: '#/$defs/idea' } },
    links: {
      type: 'array',
      description: 'Liens entre idées de la même carte (clés de cet appel ou ids d’idées existantes de la carte).',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          label: { type: 'string', description: 'Nom de la relation (défaut « lié à »).' },
          arrows: { type: 'string', enum: ['none', 'start', 'end', 'both'] },
        },
        required: ['from', 'to'],
      },
    },
  },
  required: ['ideas'],
}

const TOOLS: Tool[] = [
  {
    name: 'list_projects',
    title: 'Lister les projets',
    description: 'Liste les projets (un projet = une carte racine, ses sous-cartes et ses templates).',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: (store) => listProjects(store),
  },
  {
    name: 'get_outline',
    title: 'Plan d’un projet',
    description:
      'Arbre complet d’un projet : les idées de la carte racine et, pour chacune, les idées de sa sous-carte (titres, templates, statuts, ids). À lire avant d’ajouter pour éviter les doublons.',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] },
    annotations: { readOnlyHint: true },
    run: (store, a) => getOutline(store, String(a.projectId)),
  },
  {
    name: 'get_map',
    title: 'Lire une carte',
    description: 'Contenu complet d’une carte : ses idées (titre, champs dont le texte Markdown, statut) et ses liens.',
    inputSchema: { type: 'object', properties: { mapId: { type: 'string' } }, required: ['mapId'] },
    annotations: { readOnlyHint: true },
    run: (store, a) => getMap(store, String(a.mapId)),
  },
  {
    name: 'search',
    title: 'Rechercher',
    description: 'Recherche plein texte dans les titres et textes des idées d’un projet.',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, query: { type: 'string' } }, required: ['projectId', 'query'] },
    annotations: { readOnlyHint: true },
    run: (store, a) => search(store, String(a.projectId), String(a.query)),
  },
  {
    name: 'list_templates',
    title: 'Templates d’un projet',
    description: 'Les templates d’un projet et leurs champs (nom, type : richtext, number, date, daterange ; frise éventuelle).',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] },
    annotations: { readOnlyHint: true },
    run: (store, a) => listTemplates(store, String(a.projectId)),
  },
  {
    name: 'create_project',
    title: 'Créer un projet',
    description: 'Crée un projet (avec sa carte racine vide et les templates par défaut : Note, Réflexion, Research).',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    run: async (store, a) => {
      const r = await createProject(store, String(a.name))
      await store.commit()
      return r
    },
  },
  {
    name: 'build_map',
    title: 'Construire une carte',
    description: `Ajoute des idées et leurs liens à une carte, en un seul appel, avec éventuellement leurs sous-cartes (champ "children", sur plusieurs niveaux). Placement automatique.
Cible (une seule) : projectId → carte racine du projet ; mapId → une carte ; ideaId → la sous-carte de cette idée (créée si besoin).
Retourne les ids créés (par clé) pour les réutiliser.`,
    inputSchema: {
      type: 'object',
      $defs: { idea: ideaSchema, map: mapSchema },
      properties: {
        projectId: { type: 'string' },
        mapId: { type: 'string' },
        ideaId: { type: 'string' },
        ideas: { type: 'array', items: { $ref: '#/$defs/idea' } },
        links: mapSchema.properties && (mapSchema.properties as Json).links,
      },
      required: ['ideas'],
    },
    run: async (store, a) => {
      const target: BuildTarget = a.mapId ? { mapId: String(a.mapId) } : a.ideaId ? { ideaId: String(a.ideaId) } : { projectId: String(a.projectId ?? '') }
      const r = await buildMap(store, target, { ideas: a.ideas, links: a.links } as MapInput)
      await store.commit()
      return r
    },
  },
  {
    name: 'update_map',
    title: 'Modifier une carte',
    description: `Modifie une carte par une liste d’opérations, appliquées ensemble (toutes ou aucune) :
- { "op": "update_idea", "id", "title"?, "text"?, "fields"?, "status"?, "template"? }
- { "op": "delete_idea", "id" } (supprime aussi sa sous-carte)
- { "op": "add_link", "from", "to", "label"?, "arrows"? }
- { "op": "update_link", "id", "label"?, "arrows"? }
- { "op": "delete_link", "id" }
Pour ajouter des idées, utilise build_map avec ce mapId.`,
    inputSchema: {
      type: 'object',
      properties: {
        mapId: { type: 'string' },
        operations: { type: 'array', items: { type: 'object', properties: { op: { type: 'string' } }, required: ['op'], additionalProperties: true } },
      },
      required: ['mapId', 'operations'],
    },
    annotations: { destructiveHint: true },
    run: async (store, a) => {
      const r = await updateMap(store, String(a.mapId), (a.operations ?? []) as Operation[])
      await store.commit()
      return r
    },
  },
]

interface Message {
  jsonrpc: '2.0'
  id?: string | number | null
  method?: string
  params?: Json
}

const result = (id: Message['id'], value: unknown) => ({ jsonrpc: '2.0', id, result: value })
const failure = (id: Message['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

/** Handles one JSON-RPC message; returns the response, or undefined for a notification. */
export async function handleMessage(sql: Sql, userId: string, msg: Message): Promise<unknown | undefined> {
  if (msg.id === undefined || msg.id === null) return undefined // notification (e.g. notifications/initialized)
  switch (msg.method) {
    case 'initialize': {
      const requested = String(msg.params?.protocolVersion ?? '')
      return result(msg.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'nebuleuse', title: 'Nébuleuse', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return result(msg.id, {})
    case 'tools/list':
      return result(msg.id, {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, ...(annotations ? { annotations } : {}) })),
      })
    case 'tools/call': {
      const name = String(msg.params?.name ?? '')
      const tool = TOOLS.find((t) => t.name === name)
      if (!tool) return failure(msg.id, -32602, `Outil inconnu : ${name}`)
      try {
        const value = await tool.run(new Store(sql, userId), (msg.params?.arguments ?? {}) as Json)
        return result(msg.id, { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: Array.isArray(value) ? { items: value } : value })
      } catch (error) {
        if (error instanceof DomainError) return result(msg.id, { content: [{ type: 'text', text: error.message }], isError: true })
        throw error
      }
    }
    default:
      return failure(msg.id, -32601, `Méthode non prise en charge : ${msg.method}`)
  }
}
