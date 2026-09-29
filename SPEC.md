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
- Possède toujours un **titre** et un **statut** (`Brouillon` par défaut, ou `Prêt`), plus les
  **valeurs des champs** définis par son template.
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
    - **forme** : carte (bordure, fond atténué) ou post-it (fond plus soutenu, sans bordure,
      ombre, coin plié) — le template « Note » est un post-it par défaut ;
  - une liste ordonnée de **champs**. Chaque champ a :
    - un **nom** et un **type** : texte riche, nombre, **date**, **période** (début → fin) ;
    - une **description** (aide affichée à la saisie) ;
    - **visible sur l'idée** (affiché sur la carte, pas seulement dans l'éditeur ; oui par défaut) ;
    - une **valeur par défaut** (donnée aux nouvelles idées) ;
    - **lecture seule** : la valeur ne se modifie pas sur l'idée, c'est toujours celle du template ;
    - pour les dates et périodes, un nom de **frise** (texte libre, suggestions des frises existantes).
- Un template utilisé par au moins un nœud ne peut pas être supprimé (v1).
- Supprimer un champ n'efface pas les valeurs déjà saisies (elles sont ignorées).

### Lien
- Relie deux nœuds d'une même carte.
- **Nom** : « lié à » par défaut (la relation se lit « A lié à B »), renommable.
- **Flèches** : aucune, au début, à la fin, aux deux extrémités.
- **Couleur** (palette limitée), **épaisseur** (fine / moyenne / épaisse),
  **tracé** (droit / courbe), **trait** (plein / tirets / pointillés).

## Style visuel
- On reprend l'**UX** d'Excalidraw (simple, directe, peu de menus, tout au clavier),
  pas son rendu « dessiné à la main » : nœuds et liens nets, sobres.
- Un nœud qui possède déjà une carte enfant est affiché comme une pile de cartes.
- Palette limitée partagée par les nœuds et les liens (voir `src/db/palette.ts`).
- Interface autour du canvas : composants shadcn/ui standard, thème clair / sombre.
- Langue de l'interface : français.

### Dates, périodes et frises
- Les dates et périodes se choisissent dans les **Réglages** de l'idée, avec un calendrier
  (mois / année en listes déroulantes pour aller vite ; une période = début puis fin).
- Elles s'affichent sous forme de **frise chronologique** : sur l'idée (si visible), dans le lecteur
  (grand format) et dans les réglages.
- Toutes les dates et périodes du projet dont les champs partagent un même **nom de frise**
  s'affichent ensemble : celles de l'idée au premier plan (date = curseur, période = barre avec
  deux curseurs), celles des autres idées en arrière-plan (survol : titre et date). Un champ sans
  nom de frise a sa propre frise. L'axe s'adapte à l'étendue (années, mois ou jours).

## Lecture et édition

La lecture est au cœur de l'app : une idée peut contenir un texte long, qui doit se lire
confortablement sur téléphone comme sur ordinateur.

### Verrou (cadenas, barre flottante en bas à droite du canvas)
Mémorisé dans le navigateur ; raccourci `L`. Double-clic et double-tap sont équivalents partout.

| | Verrouillé (par défaut) — lecture | Déverrouillé — édition |
|---|---|---|
| Clic sur une idée | menu : **Explorer l'idée** | menu : **Explorer l'idée** (mis en avant), **Réglages**, **Supprimer** |
| Double-clic sur une idée | ouvre le **lecteur** | ouvre l'**éditeur** |
| Canvas | lecture seule : rien ne peut être déplacé, relié, créé ni supprimé | tout est modifiable |

- **Explorer l'idée** : entre dans la carte enfant de l'idée.
- **Réglages** : panneau sans titre ni texte — template de l'idée, apparence du template
  (couleur, forme, bordure, contour ; partagée par toutes les idées du template), favori.
- **Supprimer** : supprime l'idée ; confirmation si sa carte contient des idées (annulable avec `Ctrl+Z`).

### Lecteur
- Page dédiée (plein écran sur mobile) : police de lecture (Literata), ~65 caractères par ligne,
  interligne généreux, taille de texte réglable (mémorisée).
- Temps de lecture et nombre de mots, barre de progression, sommaire des titres (écran large),
  statut et champs date / nombre en métadonnées, favori.
- Un double-clic ou double-tap n'importe où ferme le lecteur (ainsi que `Échap` ou la croix).

### Éditeur
- La même page, avec le titre éditable en grand ; juste dessous, en petit : le **statut**
  (menu Brouillon / Prêt) et les champs date / nombre du template.
- Le texte dans un éditeur riche :
  barre d'outils toujours visible (titres, gras, italique, barré, code, lien, listes, tâches,
  citation, bloc de code, séparateur, annuler/rétablir) et menu de mise en forme sur la sélection.
- Raccourcis Markdown pendant la frappe (`## `, `- `, `[ ] `, `> `, `**gras**`…).
- Enregistrement automatique (sans indicateur) ; `Entrée` dans le titre passe au texte.

## Navigation

### Flèches de profondeur
- À côté de chaque idée, deux flèches :
  - ↑ active si l'idée est dans une carte imbriquée : remonte à la carte parente ;
  - ↓ pleine si la carte de l'idée contient des idées, estompée si elle est vide : entre dans la carte.

### Favoris
- N'importe quelle idée peut être mise en favori (lecteur, éditeur, réglages, ou `B` sur la sélection) ;
  une icône le signale sur l'idée.
- Bouton favoris dans la barre flottante du canvas (en bas à droite) (et groupe « Favoris » dans la palette) :
  choisir un favori ouvre la bonne carte, sélectionne l'idée et centre la vue dessus.

### Retour arrière
- Chaque navigation (entrer, remonter, favori, recherche…) crée une étape d'historique.
- Glisser depuis le bord gauche de l'écran vers la droite (mobile) — ou le bouton « précédent »
  du navigateur — revient à la position précédente : carte précédente et vue telle qu'on l'avait laissée.

### Souris et tactile
- Clic / tap sur une idée : la vue s'ajuste sur l'idée (zoom arrière si besoin), avec une marge
  tout autour pour voir les liens qui en partent.
- Clic / tap sur un lien : va à l'idée à l'autre bout (celle qui n'est pas sélectionnée, sinon la
  plus éloignée du clic), sélectionnée et ajustée de la même façon.

Déverrouillé :
- Double-clic sur le fond : créer une idée (l'éditeur s'ouvre).
- Poignées **+** autour de l'idée survolée ou sélectionnée (droite, bas, gauche) : les glisser
  - sur une autre idée : crée un lien, sélectionné, son nom prêt à être modifié ;
  - dans le vide : crée une idée reliée à cet endroit (l'éditeur s'ouvre).
- Clic sur le nom d'un lien (ou sur son point s'il n'a pas de nom) : l'éditer (nom, flèches,
  couleur, épaisseur…).
- Poignées de redimensionnement aux coins et côtés de l'idée sélectionnée (plus grandes au doigt).

### Clavier
| Touche | Action |
|---|---|
| `Ctrl+K` | palette de commandes |
| `Ctrl+Z` | annuler |
| `Ctrl+Maj+Z` / `Ctrl+Y` | rétablir |
| `←` `↑` `→` `↓` | sélectionner le nœud voisin dans cette direction |
| `Entrée` | explorer l'idée sélectionnée (entrer dans sa carte) |
| `Échap` / `Alt+↑` | remonter à la carte parente |
| `Espace` / `E` / `F2` | lire (verrouillé) ou éditer (déverrouillé) l'idée sélectionnée |
| `N` | nouvelle idée au centre de la vue (déverrouillé) |
| `Tab` | nouvelle idée reliée à la sélection (déverrouillé) |
| `F` | centrer la vue sur la sélection |
| `B` | ajouter / retirer la sélection des favoris |
| `L` | verrouiller / déverrouiller le canvas |
| `Suppr` / `Retour arrière` | supprimer la sélection (déverrouillé) |

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
- **Local-first** : tout est stocké dans le navigateur (IndexedDB via Dexie) et l'app fonctionne
  hors ligne, connecté ou non.
- **Synchronisation** (optionnelle) : une fois connecté (bouton nuage de l'en-tête : code par e-mail,
  mot de passe ou Google — Neon Auth), les cartes sont synchronisées avec une base Postgres (Neon)
  et retrouvées sur tous les appareils.
  - Les modifications locales partent environ une seconde après ; les nouveautés arrivent toutes les
    10 s tant que l'app est visible (et dès qu'elle revient au premier plan ou en ligne).
  - La première connexion d'un appareil envoie ce qu'il contient déjà.
  - Conflits : la dernière écriture gagne ; une modification locale pas encore envoyée l'emporte
    sur ce qui arrive du serveur.
- Prochaine étape : un serveur MCP pour que Claude crée et enrichisse les cartes (voir plus bas).

## Hors v1 (plus tard)
- Export / import JSON d'un projet.
- Une carte atteignable depuis plusieurs nœuds (graphe plutôt qu'arbre).
- Synchronisation serveur / multi-utilisateurs.
- **Serveur MCP** pour qu'un LLM puisse lire et écrire dans les cartes et structurer une pensée :
  `QueryReflexionMap(mapId, search)` et `PatchReflexionMap(mapId, patch)` (plus probablement
  `ListProjects` et `OpenNode` pour découvrir les cartes). Prérequis : les données doivent être
  accessibles hors du navigateur (piste privilégiée : serveur local + SQLite comme source de vérité).
