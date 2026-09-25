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
- Style par défaut hérité du template (couleur de trait, couleur de fond, épaisseur de bordure),
  **surchargeable par nœud**.
- Position et dimensions libres (redimensionnable).
- Tout nœud est **navigable** : l'ouvrir crée (à la demande) sa carte enfant.

### Template (par projet)
- Liste de templates propre à chaque projet : **ajouter, renommer, éditer, supprimer**.
- Templates créés par défaut avec un nouveau projet : `Note`, `Réflexion`, `Research`.
- Un template définit :
  - un **style** : couleur de trait et couleur de fond choisies dans une palette limitée,
    épaisseur de bordure (fine / moyenne / épaisse), style de remplissage ;
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
- Inspiré d'Excalidraw : tracés « dessinés à la main » (rough.js), police manuscrite
  Excalifont dans le canvas.
- Palette limitée partagée par les nœuds et les liens (voir `src/db/palette.ts`).
- Interface autour du canvas : composants shadcn/ui standard, thème clair / sombre.
- Langue de l'interface : français.

## Navigation

### Souris
- Double-clic sur le fond : créer un nœud.
- Glisser depuis le bord d'un nœud vers un autre : créer un lien.
- Double-clic sur un nœud : éditer ; bouton « ouvrir » ou `Entrée` : entrer dans sa carte.
- Clic sur un lien : l'éditer (flèches, label, couleur, épaisseur…).

### Clavier
| Touche | Action |
|---|---|
| `←` `↑` `→` `↓` | sélectionner le nœud voisin dans cette direction |
| `Entrée` | entrer dans la carte du nœud sélectionné |
| `Échap` / `Alt+↑` | remonter à la carte parente |
| `E` / `F2` | éditer le nœud sélectionné |
| `N` | nouveau nœud au centre de la vue |
| `Tab` | nouveau nœud relié au nœud sélectionné |
| `Suppr` / `Retour arrière` | supprimer la sélection |

## Données
- **Local-first** : tout est stocké dans le navigateur (IndexedDB via Dexie).
- La couche d'accès (`src/db`) est isolée pour permettre plus tard une synchronisation serveur.

## Hors v1 (plus tard)
- Annuler / rétablir, recherche globale, palette de commandes (`Ctrl+K`).
- Export / import JSON d'un projet.
- Une carte atteignable depuis plusieurs nœuds (graphe plutôt qu'arbre).
- Synchronisation serveur / multi-utilisateurs.
