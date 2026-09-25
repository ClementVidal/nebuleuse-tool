# Nébuleuse — spécification produit

Nébuleuse est un outil pour représenter des idées sous forme de **graphe multidimensionnel** :
chaque idée est un nœud d'une carte 2D, et chaque nœud peut être « ouvert » pour révéler
une nouvelle carte qui le détaille. On navigue ainsi en profondeur dans ses réflexions.

## Concepts

### Projet
- Regroupe des idées. Un projet possède une **carte racine** et une **liste de templates**.
- Actions : créer, renommer, supprimer.

### Reflexion-map (carte)
- Un graphe 2D (canvas infini) : des **nœuds** reliés par des **liens**.
- Chaque carte appartient à un projet. Hormis la carte racine, chaque carte appartient à un
  **nœud parent** (structure en arbre : une carte = un seul parent).
- Un fil d'Ariane indique la position : `Projet › Idée A › Idée B`.

### Nœud
- Instance d'un **template** du projet.
- Possède toujours un **titre**, plus les **valeurs des champs** définis par son template.
- Style **entièrement défini par son template** (tous les nœuds d'un template le partagent,
  pas de surcharge par nœud).
- Position et dimensions libres (redimensionnable).
- Tout nœud est **navigable** : l'ouvrir crée (à la demande) sa carte enfant.

### Template (par projet)
- Liste de templates propre à chaque projet : **ajouter, renommer, éditer, supprimer**.
- Templates créés par défaut avec un nouveau projet : `Note`, `Réflexion`, `Research`.
- Un template définit :
  - un **style** (modifiable uniquement dans l'éditeur de templates) :
    - **une seule couleur** (palette limitée) qui donne à la fois la couleur du texte, de la bordure
      et un fond atténué ;
    - épaisseur de bordure (fine / moyenne / épaisse) ;
    - contour plein ou pointillé ;
  - une liste ordonnée de **champs** : `{ id, label, type }` avec
    `type ∈ { richtext, date, number }`.
- Un template utilisé par au moins un nœud ne peut pas être supprimé (v1).
- Supprimer un champ n'efface pas les valeurs déjà saisies (elles sont ignorées).

### Lien
- Relie deux nœuds d'une même carte.
- **Flèches** : aucune, au début, à la fin, aux deux extrémités.
- **Label** (texte libre), **couleur** (palette limitée), **épaisseur** (fine / moyenne / épaisse),
  **tracé** (droit / courbe), **trait** (plein / tirets / pointillés).

## Style visuel
- On reprend l'**UX** d'Excalidraw (simple, directe, peu de menus, tout au clavier),
  pas son rendu « dessiné à la main » : nœuds et liens nets, sobres.
- Un nœud qui possède déjà une carte enfant est affiché comme une pile de cartes.
- Palette limitée partagée par les nœuds et les liens (voir `src/db/palette.ts`).
- Interface autour du canvas : composants shadcn/ui standard, thème clair / sombre.
- Langue de l'interface : français.

## Navigation

### Menu d'une idée (simple clic)
- Un clic sur une idée ouvre un petit menu au-dessus d'elle :
  - **Focus** : sélectionne l'idée et centre la vue dessus (zoom de lecture si on est dézoomé) ;
  - **Entrer** : ouvre la carte de l'idée ;
  - **Éditer** : ouvre l'éditeur (uniquement en mode verrouillé).
- Le menu se ferme au clic sur le fond, avec `Échap`, en déplaçant une idée ou la vue.
- Focus en deux clics : clic sur l'idée → Focus. Au clavier : `F` sur la sélection.

### Verrou (barre flottante du canvas)
- **Verrouillé** (par défaut) : double-clic / double-tap sur une idée → ouvre son éditeur.
- **Déverrouillé** : double-clic / double-tap sur une idée → entre directement dans sa carte.
- Le choix est mémorisé dans le navigateur. Raccourci `L`.

### Flèches de profondeur
- À côté de chaque idée, deux flèches :
  - ↑ active si l'idée est dans une carte imbriquée : remonte à la carte parente ;
  - ↓ pleine si la carte de l'idée contient des idées, estompée si elle est vide : entre dans la carte.

### Favoris
- N'importe quelle idée peut être mise en favori (éditeur de l'idée, ou `B` sur la sélection) ;
  une icône le signale sur l'idée.
- Bouton favoris dans la barre flottante du canvas (et groupe « Favoris » dans la palette) :
  choisir un favori ouvre la bonne carte, sélectionne l'idée et centre la vue dessus.

### Retour arrière
- Chaque navigation (entrer, remonter, favori, recherche…) crée une étape d'historique.
- Glisser depuis le bord gauche de l'écran vers la droite (mobile) — ou le bouton « précédent »
  du navigateur — revient à la position précédente : carte précédente et vue telle qu'on l'avait laissée.

### Souris
- Double-clic sur le fond : créer un nœud.
- Glisser depuis le bord d'un nœud vers un autre : créer un lien.
- Clic sur un lien : l'éditer (flèches, label, couleur, épaisseur…).

### Clavier
| Touche | Action |
|---|---|
| `Ctrl+K` | palette de commandes |
| `Ctrl+Z` | annuler |
| `Ctrl+Maj+Z` / `Ctrl+Y` | rétablir |
| `←` `↑` `→` `↓` | sélectionner le nœud voisin dans cette direction |
| `Entrée` | entrer dans la carte du nœud sélectionné |
| `Échap` / `Alt+↑` | remonter à la carte parente |
| `E` / `F2` | éditer le nœud sélectionné |
| `N` | nouveau nœud au centre de la vue |
| `Tab` | nouveau nœud relié au nœud sélectionné |
| `F` | focus : centrer la vue sur la sélection |
| `B` | ajouter / retirer la sélection des favoris |
| `L` | verrouiller / déverrouiller le canvas |
| `Suppr` / `Retour arrière` | supprimer la sélection |

### Annuler / rétablir
- Toute modification du contenu d'un projet est annulable : nœuds, liens, déplacements,
  redimensionnements, templates, suppressions en cascade (une idée supprimée revient avec
  toute sa sous-carte).
- Une saisie continue dans un même champ (titre, label, texte riche…) compte comme une seule étape.
- Historique en mémoire, propre à chaque projet (perdu au rechargement de la page).
- Non annulables : création / renommage / suppression d'un projet, vue (zoom, position).
- Dans un champ texte, `Ctrl+Z` garde le comportement natif du champ.

### Palette de commandes (`Ctrl+K`)
- Recherche dans toutes les idées du projet (titre, champs texte riche, carte où elle se trouve) :
  choisir un résultat ouvre sa carte et sélectionne l'idée.
- Actions : nouvelle idée (par template), remonter, carte racine, annuler, rétablir,
  templates du projet.
- Changer de projet, revenir à la liste des projets, choisir le thème.

## Données
- **Local-first** : tout est stocké dans le navigateur (IndexedDB via Dexie).
- La couche d'accès (`src/db`) est isolée pour permettre plus tard une synchronisation serveur.

## Hors v1 (plus tard)
- Export / import JSON d'un projet.
- Une carte atteignable depuis plusieurs nœuds (graphe plutôt qu'arbre).
- Synchronisation serveur / multi-utilisateurs.
- **Serveur MCP** pour qu'un LLM puisse lire et écrire dans les cartes et structurer une pensée :
  `QueryReflexionMap(mapId, search)` et `PatchReflexionMap(mapId, patch)` (plus probablement
  `ListProjects` et `OpenNode` pour découvrir les cartes). Prérequis : les données doivent être
  accessibles hors du navigateur (piste privilégiée : serveur local + SQLite comme source de vérité).
