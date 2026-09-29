import {
  buildMap,
  createLinkTemplate,
  createProject,
  createTemplate,
  DomainError,
  getMap,
  getOutline,
  listProjects,
  listTemplates,
  search,
  Store,
  updateLinkTemplate,
  updateMap,
  updateTemplate,
  type BuildTarget,
  type FieldInput,
  type FieldOperation,
  type LinkStyleInput,
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
- Une idée marquée "aliasOf" est un alias : la même idée placée sur une autre carte. La modifier modifie
  l'originale (partout) ; la supprimer ne retire que l'alias.
- Si aucun template ne convient (ex. une frise historique : Événement avec une période, Personnage avec
  naissance et mort), crée-le avec create_template, ou adapte-en un avec update_template, avant build_map.
  Les dates et périodes qui partagent un nom de frise ("timeline") s'affichent ensemble sur une frise.
- Les liens ont un type (list_templates → linkTemplates : Lien, Cause, Opposition…) qui donne leur
  style et leur nom par défaut ; précise "type" sur un lien quand la relation s'y prête. Crée ou adapte
  des types avec create_link_template / update_link_template.
- Une carte « référençable » peut être placée sur une autre carte du projet sous forme de carte
  cliquable (update_map : set_referenceable, add_map_card), reliée aux idées par des liens.
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
          label: { type: 'string', description: 'Nom de la relation (défaut : celui du type).' },
          type: { type: 'string', description: 'Type de lien (voir list_templates → linkTemplates). Défaut : le premier type.' },
          arrows: { type: 'string', enum: ['none', 'start', 'end', 'both'], description: 'Défaut : celles du type.' },
        },
        required: ['from', 'to'],
      },
    },
  },
  required: ['ideas'],
}

const styleProperties: Json = {
  color: { type: 'string', enum: ['ink', 'red', 'green', 'blue', 'orange', 'violet'], description: 'Couleur d’accent des idées.' },
  shape: { type: 'string', enum: ['card', 'sticky'], description: 'card = carte, sticky = post-it.' },
  strokeWidth: { type: 'string', enum: ['thin', 'medium', 'thick'], description: 'Épaisseur du liseré.' },
  dashed: { type: 'boolean', description: 'Contour pointillé.' },
}

const fieldOptions: Json = {
  type: { type: 'string', enum: ['richtext', 'number', 'date', 'daterange'], description: 'richtext = texte Markdown, number, date, daterange = période.' },
  description: { type: 'string', description: 'Aide affichée à la saisie ("" pour l’enlever).' },
  visibleOnNode: { type: 'boolean', description: 'Affiché sur l’idée dans la carte (défaut true), pas seulement dans l’éditeur.' },
  readOnly: { type: 'boolean', description: 'Toutes les idées ont la valeur par défaut, non modifiable.' },
  default: { description: 'Valeur par défaut (même format que les champs des idées ; null pour l’enlever).' },
  timeline: { type: 'string', description: 'Dates et périodes seulement : nom de frise ; celles qui le partagent s’affichent ensemble ("" pour l’enlever).' },
}

const linkStyleProperties: Json = {
  label: { type: 'string', description: 'Nom donné aux liens de ce type (ex. « cause », « s’oppose à »).' },
  arrows: { type: 'string', enum: ['none', 'start', 'end', 'both'] },
  color: { type: 'string', enum: ['ink', 'red', 'green', 'blue', 'orange', 'violet'] },
  strokeWidth: { type: 'string', enum: ['thin', 'medium', 'thick'] },
  path: { type: 'string', enum: ['straight', 'curved'] },
  dash: { type: 'string', enum: ['solid', 'dashed', 'dotted'] },
  first: { type: 'boolean', description: 'En faire le premier type : celui donné par défaut aux nouveaux liens.' },
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
    description:
      'Les templates d’un projet : ideaTemplates (templates d’idées et leurs champs : richtext, number, date, daterange ; frise éventuelle) et linkTemplates (types de liens : nom, nom donné aux liens, style).',
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
    name: 'create_template',
    title: 'Créer un template',
    description:
      'Crée un template dans un projet : nom, apparence et champs. Le premier champ texte (richtext) reçoit le "text" des idées.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        name: { type: 'string', description: 'Nom unique dans le projet.' },
        ...styleProperties,
        fields: {
          type: 'array',
          items: { type: 'object', properties: { name: { type: 'string' }, ...fieldOptions }, required: ['name', 'type'] },
        },
      },
      required: ['projectId', 'name'],
    },
    run: async (store, a) => {
      const r = await createTemplate(store, String(a.projectId), a as { name: string; fields?: FieldInput[] })
      await store.commit()
      return r
    },
  },
  {
    name: 'update_template',
    title: 'Modifier un template',
    description: `Modifie un template (désigné par son nom) : nom ("rename"), apparence, et champs par une liste d’opérations, appliquées ensemble (toutes ou aucune) :
- { "op": "add_field", "name", "type", "position"?, options… }
- { "op": "update_field", "field", "rename"?, "type"?, options… }
- { "op": "remove_field", "field" }
- { "op": "move_field", "field", "position" } (position à partir de 1)
Options : description, visibleOnNode, readOnly, default, timeline. Les champs sont désignés par leur nom ; les renommer garde les valeurs des idées. La modification s’applique à toutes les idées du template.`,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        template: { type: 'string', description: 'Nom actuel du template.' },
        rename: { type: 'string' },
        ...styleProperties,
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['add_field', 'update_field', 'remove_field', 'move_field'] },
              field: { type: 'string', description: 'Nom du champ existant.' },
              name: { type: 'string', description: 'add_field : nom du nouveau champ.' },
              rename: { type: 'string' },
              position: { type: 'number' },
              ...fieldOptions,
            },
            required: ['op'],
          },
        },
      },
      required: ['projectId', 'template'],
    },
    annotations: { destructiveHint: true },
    run: async (store, a) => {
      const r = await updateTemplate(store, String(a.projectId), a as { template: string; fields?: FieldOperation[] })
      await store.commit()
      return r
    },
  },
  {
    name: 'create_link_template',
    title: 'Créer un type de lien',
    description: 'Crée un type de lien dans un projet : nom, nom donné aux liens, style (flèches, couleur, épaisseur, tracé, trait). Ses liens partagent son style.',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' }, name: { type: 'string', description: 'Nom unique dans le projet.' }, ...linkStyleProperties },
      required: ['projectId', 'name'],
    },
    run: async (store, a) => {
      const r = await createLinkTemplate(store, String(a.projectId), a as unknown as { name: string } & LinkStyleInput)
      await store.commit()
      return r
    },
  },
  {
    name: 'update_link_template',
    title: 'Modifier un type de lien',
    description: 'Modifie un type de lien (désigné par son nom) : nom ("rename"), nom donné aux liens, style. Le style change sur tous les liens de ce type ; leurs noms déjà donnés restent.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        template: { type: 'string', description: 'Nom actuel du type de lien.' },
        rename: { type: 'string' },
        ...linkStyleProperties,
      },
      required: ['projectId', 'template'],
    },
    annotations: { destructiveHint: true },
    run: async (store, a) => {
      const r = await updateLinkTemplate(store, String(a.projectId), a as unknown as { template: string } & LinkStyleInput)
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
- { "op": "update_idea", "id", "title"?, "text"?, "fields"?, "status"?, "template"?, "referenceable"? } (référençable : l'idée est proposée en alias sur les autres cartes)
- { "op": "delete_idea", "id" } (supprime aussi sa sous-carte)
- { "op": "add_link", "from", "to", "label"?, "type"?, "arrows"? }
- { "op": "update_link", "id", "label"?, "type"?, "arrows"? }
- { "op": "set_referenceable", "value" } (cette carte : peut être placée sur les autres cartes du projet)
- { "op": "add_map_card", "map" } (place sur cette carte une carte cliquable vers une autre carte, qui doit être référençable ; relie-la ensuite avec add_link)
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
