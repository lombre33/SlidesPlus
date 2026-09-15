# Feuille de route

État au premier commit : une fondation (connexion Grist + canevas Fabric.js vide + mode présentation), **pas encore
un éditeur de diapositives utilisable**. Rien ci-dessous n'est implémenté sauf mention contraire.

Ordre inspiré de la priorisation retenue par le widget sœur `publipostageGrist` pour son propre backlog (contenu
piloté par les données avant les outils visuels avant les options d'export avancées) et de l'analyse d'architecture
qui a précédé ce commit.

## Phase 1 — Éditeur

- Barre d'outils d'insertion : zone de texte, image (upload + pièce jointe Grist), formes simples (rectangle,
  ellipse, ligne).
- Sélection multiple, alignement/distribution, guides d'alignement (magnétisme).
- Gestion multi-diapositives (ajout/suppression/réordonnancement), miniatures.
- Sauvegarde du modèle de présentation (JSON des diapositives) dans une table Grist interne dédiée
  (`SlidesPlus_Presentations`), sur le même patron que `Publipostage_Modeles` côté widget sœur — voir
  `AUDIT_CODE.md` de publipostageGrist pour le détail du patron (création/migration idempotente, un seul
  "par défaut" à la fois).

## Phase 2 — Export

- Export `.pptx` via PptxGenJS (voir `DEPENDENCIES.md`), depuis le même modèle JSON de diapositives que l'éditeur.
- Export PDF vectoriel via pdfmake (réutilisation du choix déjà fait par publipostageGrist), périmètre limité en v1
  à ce que pdfmake sait faire nativement : texte/image/forme à position fixe, pas de rotation/ombres/dégradés (voir
  la synthèse d'architecture — décision assumée pour garder une seule bibliothèque PDF sur l'ensemble des widgets
  Grist du projet plutôt que d'en ajouter une seconde).

## Phase 3 — Publipostage

- Panneau de liaison de données par élément de diapositive, au-dessus des primitives déjà prêtes dans
  `shared/grist-api-core.js`/`shared/variable-resolver.js` (résolution cross-table, y compris depuis n'importe
  quelle table du document, pas seulement la table liée au widget dans la page Grist).
- Génération en lot : boucle sur un ensemble de lignes Grist (sélection libre, pas nécessairement liée
  ligne-à-ligne), une diapositive — ou une présentation entière — par ligne, potentiellement dans un Web Worker
  pour ne pas geler l'UI de l'éditeur sur un gros volume.
- Stockage des exports dans une table Grist dédiée (pièce jointe), voir la discussion d'architecture initiale.

## Phase 4 — Polish

- Galerie de modèles pré-remplis (catalogue statique, même patron que `templates-gallery/` côté publipostageGrist).
- Undo/redo, raccourcis clavier, thèmes/palettes de couleurs réutilisables.
- Suite de tests automatisés (runner maison sans dépendance, sur le modèle de `dev-tests/` côté publipostageGrist)
  avec un décodeur de "vérité terrain" sur le `.pptx` réellement généré (lire le XML du zip produit), pas sur les
  structures internes de PptxGenJS.

## Non retenu pour l'instant (à documenter si ça change)

- Animations/transitions de diapositives.
- Édition collaborative temps réel (au-delà de ce que Grist lui-même permet).
- Import direct d'un `.pptx` existant.
