# SlidesPlus

Widget personnalisé pour [Grist](https://www.getgrist.com/) permettant de créer et éditer des présentations
type diaporama (texte, images, formes), avec mode présentation en plein écran et export `.pptx`/PDF, y compris en
**publipostage** : une diapositive (ou une présentation) générée à partir des données d'une ou plusieurs tables
Grist.

**État actuel : éditeur mono-utilisateur basique fonctionnel** (insertion texte/formes/image, multi-diapositives,
enregistrement/chargement dans Grist, mode présentation) — **pas encore d'export pptx/PDF ni de publipostage**,
voir [`ROADMAP.md`](ROADMAP.md) pour le détail de ce qui reste à faire.

Widget sœur : [publipostageGrist](https://github.com/lombre33/publipostagegrist) (publipostage de documents texte
riches). SlidesPlus en réutilise le moteur de résolution de variables cross-table (voir
[`shared/README.md`](shared/README.md)) et les enseignements de son audit de sécurité
([`AUDIT_CODE.md`](https://github.com/lombre33/publipostagegrist/blob/main/AUDIT_CODE.md) de ce dépôt sœur).

## Sommaire

- [Installation dans Grist](#installation-dans-grist)
- [Architecture](#architecture)
- [Sécurité et permissions](#sécurité-et-permissions)
- [Dépendances](#dépendances)
- [État du projet](#état-du-projet)
- [Licence](#licence)

## Installation dans Grist

1. Dans une page Grist, ajouter un widget personnalisé et renseigner l'URL de la page publiée (déploiement GitHub
   Pages de ce dépôt).
2. Grist demande l'autorisation d'accès du widget au chargement (voir
   [Sécurité et permissions](#sécurité-et-permissions) ci-dessous) — l'accepter est nécessaire au fonctionnement.

## Architecture

- **Pas d'étape de build** : page statique unique (`index.html`), servie telle quelle par GitHub Pages — voir
  [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Canevas d'édition** : [Fabric.js](https://fabricjs.com/) 7.4.0, vendorisé (voir
  [Dépendances](#dépendances)) — modèle d'objets riche (texte, formes, images, groupes) avec sérialisation JSON
  native, adapté à un format de diapositive éditable.
- **Diapositive** : 960×540 pt (16:9, mêmes proportions que le format PowerPoint standard) — voir `js/main.js`.
  Cette unité est choisie dès l'éditeur pour que le futur export pptx/pdf n'ait pas de conversion surprise.
- **Mode présentation** : tente le vrai Fullscreen API du navigateur (`element.requestFullscreen()`), avec repli en
  pseudo-plein-écran CSS si indisponible. Grist ne garantit pas que l'iframe hébergeant les widgets custom porte
  l'attribut `allow="fullscreen"` (nécessaire pour que `requestFullscreen()` réussisse depuis l'intérieur d'une
  iframe) — le repli CSS garantit que le mode présentation fonctionne dans tous les cas, avec ou sans vrai plein
  écran natif.
- **Module partagé avec publipostageGrist** (`shared/`) : cœur d'accès à l'API Grist et moteur de résolution de
  variables cross-table, factorisés pour être consommés par les deux widgets sans duplication — voir
  [`shared/README.md`](shared/README.md) pour le détail, y compris son état transitoire (dépôt séparé prévu, pas
  encore créé).

## Sécurité et permissions

**Niveau d'accès demandé** : `requiredAccess: 'full'` — le widget lit et écrit sur l'ensemble du document Grist,
pas seulement sur la table à laquelle il est lié dans la page. L'API de widget personnalisé de Grist ne propose
aucun niveau intermédiaire entre "lecture d'une seule table" et "accès complet" ; ce niveau est nécessaire dès
qu'une variable de diapositive référence une table différente de celle liée au widget (publipostage cross-table),
exactement pour la raison déjà documentée par le widget sœur `publipostageGrist` dans son propre audit de sécurité.

**Ce que cela implique pour un déploiement en administration** : ce niveau d'accès s'applique au *widget*, pas
directement à chaque utilisateur — un utilisateur restreint par les **Règles d'accès** natives de Grist (Access
Rules, configurées sur le document par son propriétaire) conserve cette restriction en utilisant ce widget. **La
restriction fine du périmètre de données doit donc être faite au niveau du document Grist lui-même**, pas dans la
configuration du widget, qui ne l'expose pas.

**Dépendances** : contrairement à `publipostageGrist` (qui charge son moteur d'édition riche depuis un CDN tiers
via import map ESM, une limitation où l'intégrité SRI est structurellement impossible), SlidesPlus **vendorise
systématiquement** toute dépendance tierce (fichier committé dans ce dépôt, servi en same-origin) — voir
[`DEPENDENCIES.md`](DEPENDENCIES.md) pour le détail et les hash de vérification. Seul le SDK officiel du widget
Grist (`grist-plugin-api.js`, `docs.getgrist.com`) ne peut techniquement pas l'être.

**Aucune donnée n'est stockée hors de Grist.**

**Signaler une vulnérabilité** : voir [`SECURITY.md`](SECURITY.md) — ne pas ouvrir d'issue publique.

## Dépendances

Voir [`DEPENDENCIES.md`](DEPENDENCIES.md) pour l'inventaire complet (versions, origine, licence, hash de
vérification) et la règle appliquée à toute future dépendance.

## État du projet

Voir [`ROADMAP.md`](ROADMAP.md). Aucun audit de sécurité n'a encore été réalisé sur ce dépôt (rien à auditer au-delà
de la fondation actuelle) — un audit dans l'esprit de celui de `publipostageGrist` est prévu avant toute publication
en administration, une fois l'éditeur fonctionnel (fin de Phase 1 du `ROADMAP.md`).

## Licence

Ce projet est distribué sous licence [GNU General Public License v3.0](LICENSE) (GPLv3), par cohérence avec le
widget sœur `publipostageGrist`.

Copyright (C) 2026 lombre33
