# Réflexion en cours : SlidesPlus / Publipostage+, deux widgets ou une suite ?

Ce document résume une discussion d'architecture (session Claude Code du 2026-09-15, dépôt `SlidesPlus`) sur
l'opportunité de rapprocher `SlidesPlus` (édition de diapositives) et
[`publipostageGrist`](https://github.com/lombre33/publipostagegrist) (édition de documents texte + publipostage),
pour partager un maximum entre les deux plutôt que dupliquer. **Rien n'est tranché** — ce fichier sert de mémoire
pour reprendre la discussion côté `publipostageGrist`, pas de spécification actée.

## 1. Vision et contraintes (posées par l'utilisateur)

- Rassembler dans Grist un outil d'édition de texte/prise de notes avec publipostage (déjà en alpha côté
  `publipostageGrist`) et un outil de création de slides — parce qu'une grosse partie des informations qui iront
  sur ces documents sont déjà dans Grist, ou mériteraient d'y être. Grist centralise tout.
- Idéalement un **éditeur "deux-en-un" très complet**, où le mode slide serait une bascule (format paysage, plus de
  sauts de page — chaque page devient une diapositive), avec juste quelques fonctionnalités propres aux slides
  ajoutées par-dessus (notamment : pouvoir faire glisser un bloc de texte comme un élément flottant — idée pas
  fermée à un bouton équivalent dans l'éditeur classique aussi).
- Contraintes fortes et explicites :
  - Le(s) module(s) doivent pouvoir être **audités par la DINUM**.
  - Ils doivent être **stables dans le temps**, demander **peu de maintenance**, être **le plus sécurisés
    possible**.
  - Une **approche modulaire semble plus simple pour l'audit** (mot de l'utilisateur) — donc portée fonctionnelle
    étroite par widget plutôt qu'un seul très gros widget.
  - Garder la **toolbar** et le **système de gestion de modèles** de Publipostage+, jugés très bons.
  - Un problème connu à ne pas reproduire : **fiabilité de la position des images flottantes à l'export PDF**, et
    plus globalement de la position relative entre images et texte.

Point de tension identifié : "éditeur complet deux-en-un" tire vers *plus* de code partagé/fusionné, alors que
"modulaire pour l'audit" (le guide Grist.Gouv/DINUM valorise une portée fonctionnelle étroite par widget) tire vers
*moins* de fusion. Les options ci-dessous sont une tentative de concilier les deux.

## 2. État des lieux (ce qui existe déjà)

**`publipostageGrist`** : éditeur de texte riche (TipTap/ProseMirror), variables `#Table.Colonne` avec résolution
cross-table, galerie de modèles + modèles utilisateur stockés dans une table Grist interne, export PDF vectoriel via
pdfmake, export en lot (zip). Un audit de sécurité/qualité complet a déjà été réalisé
([`AUDIT_CODE.md`](https://github.com/lombre33/publipostagegrist/blob/main/AUDIT_CODE.md)), explicitement en
préparation d'une revue DINUM/RSSI (guide "Grist.Gouv Widgets"). Aucun point Bloquant, plusieurs points Importants
encore ouverts (voir ce fichier pour le détail : `requiredAccess:'full'`, absence de SRI sur l'import map esm.sh,
LICENSE/CONTRIBUTING/SECURITY.md absents, etc.).

**`SlidesPlus`** (ce dépôt) : fondation posée avec Fabric.js (canevas libre, pas ProseMirror) — connexion Grist,
insertion texte/formes/image, multi-diapositives avec miniatures, enregistrement/chargement dans une table Grist
interne (`SlidesPlus_Presentations`), mode présentation (plein écran réel ou repli CSS + navigation clavier). Voir
`README.md`/`ROADMAP.md` de ce dépôt pour le détail. **Ce canevas Fabric.js est probablement remis en cause** par la
suite de cette réflexion (voir §6).

**Déjà mutualisé** (`shared/` dans ce dépôt, pensé pour devenir un dépôt séparé `grist-widget-shared` dès que
possible — voir `shared/README.md`) : `grist-api-core.js` et `variable-resolver.js`, extraits/généralisés depuis
`publipostageGrist` (`js/grist-api.js`, `js/variables.js`) en **factory paramétrée par `namespace`** pour que chaque
widget ait ses propres tables de bookkeeping sans collision. `variable-format.js` et `html-sanitize.js` copiés tels
quels (déjà autonomes). Ce module a été conçu, testé et poussé dans ce dépôt — il fonctionne, indépendamment du
choix d'architecture ci-dessous.

## 3. Constat technique central : le moteur d'édition

Premier réflexe : TipTap/ProseMirror (document qui **coule**, pagination automatique) et Fabric.js (positionnement
**libre**, ce qu'une diapositive demande) sont deux paradigmes différents — remplacer l'un par l'autre pour tout
faire semblait risqué dans un sens comme dans l'autre.

**Mais** en lisant `js/floating-toolbars.js` de `publipostageGrist` (450 lignes), il s'avère que Publipostage+ a
déjà un mécanisme de **calque** (`layer: 'normal' | 'front' | 'behind'`) pour les images : un nœud ProseMirror peut
sortir du flux, recevoir une position `left`/`top` + une position de grille de page
(`HeaderFooterPreview.computePageGridPosition`), et cette position est directement réutilisée par `pdf-export.js`
via `absolutePosition` de pdfmake. C'est un vrai mécanisme de "bloc flottant" qui fonctionne déjà et exporte déjà
correctement — juste limité aux images aujourd'hui. La toolbar contextuelle elle-même
(`EditorCore.createFloatingPanel`, activée selon `editor.state.selection.node.type.name`) est un patron générique,
déjà appliqué à 3 cas (image/tableau/variable), extensible à de nouveaux types de nœuds.

**Conséquence** : généraliser ce mécanisme existant (à un bloc de texte flottant, puis à des formes) est plus
réaliste que d'en construire un nouveau — et plus réaliste que d'essayer de faire porter le positionnement libre par
Fabric.js en parallèle d'un moteur de texte différent.

## 4. Options d'architecture envisagées

| # | Option | Avantages | Inconvénients |
|---|---|---|---|
| **1** | **Deux widgets séparés (dépôts distincts), noyau d'édition commun versionné** — un nouveau dépôt "cœur" (schéma de nœuds, toolbar, gestion de modèles, export pdfmake) consommé en dépendance figée par les deux (fichiers vendorisés + hash, ou tag Git + SRI, comme `vendor/fabric.min.js` aujourd'hui) | Portée étroite par widget → conforme à la doctrine DINUM/Grist.Gouv ; le cœur n'est audité/durci qu'une fois ; garde vraiment la toolbar et les modèles (ils vivent dans le cœur) ; un widget peut rester sur une version du cœur pendant que l'autre teste la suivante (isolation du risque) ; répond directement au critère "modulaire = plus simple à auditer" formulé par l'utilisateur | Chantier d'extraction plus gros que ce qui a été fait jusqu'ici pour `shared/` (il faudrait en plus extraire le moteur d'édition, pas seulement l'accès Grist/variables) ; discipline de versionning à tenir dans la durée ; un correctif du cœur doit être re-testé et republié dans les deux avant d'être "fait" partout |
| **2** | **Un seul dépôt/code, mode `document`/`slide`** (paramètre au chargement, ex. `?mode=slide` dans l'URL) | Zéro duplication possible par construction ; UX unifiée immédiate ; **rien n'empêche techniquement d'exposer plusieurs URL de widget Grist depuis ce même dépôt** (voir §5) | Contredit le critère de modularité pour l'audit exprimé par l'utilisateur (un seul gros widget avec deux métiers, plus dur à auditer d'un bloc, risque de régression croisée) ; nécessite une vraie refonte de certaines parties de Publipostage+ (voir §6) |
| **3** | Fork total, rien de partagé | Découplage maximal, audit strictement indépendant | Perd la toolbar/les modèles (sauf à les recoder) ; duplique la maintenance de bugs identiques (ex. le bug de position d'image serait à corriger deux fois) ; va à l'encontre de "peu de maintenance dans le temps" |
| **4** | Cœur partagé limité à l'infra (ce qui existe déjà dans `shared/`), pas le moteur d'édition/toolbar | C'est l'état actuel | N'inclut pas la toolbar ni les modèles → ne répond pas à la demande explicite de les garder communs |

Avis exprimé pendant la discussion (pas une décision) : l'option 1 coche les trois critères en même temps (garder
toolbar/modèles, modularité pour l'audit, stabilité par gel de version), au prix d'un chantier d'extraction plus
lourd. L'utilisateur explore activement l'option 2 (voir §6).

## 5. Un seul dépôt peut quand même exposer plusieurs "façades"

Question posée et résolue : avec l'option 2 (un seul dépôt), peut-on quand même proposer côté Grist une URL "texte
seul", une URL "slides seul" et une URL "suite" ? **Oui, simplement** :
- Un paramètre dans l'URL du widget (`index.html?mode=document`, `?mode=slide`, ou sans paramètre = sélecteur de
  mode) lu au démarrage (`new URLSearchParams(location.search).get('mode')`), avec chargement conditionnel
  (`import()` dynamique du code spécifique à un mode) pour qu'un widget "verrouillé" sur un mode livre réellement
  moins de code.
- Un `manifest.json` à plusieurs entrées nommées (même patron que le dépôt officiel `grist-widget`), pour que ces
  variantes apparaissent comme des choix propres dans le sélecteur "Ajouter un widget personnalisé" de Grist plutôt
  que de coller une URL à la main.

Ce mécanisme est indépendant du choix entre les options du §4 — il fonctionne aussi bien pour éclater artificiellement
un dépôt unique (option 2) que pour, plus tard, ajouter une 3ᵉ URL "suite" par-dessus deux dépôts séparés (option 1).

## 6. Si l'option 2 est retenue : ampleur réelle du travail sur Publipostage+

Vérifié dans le code plutôt que deviné (recherche des constantes de dimension de page) :

**Constat concret** : les dimensions A4 (595.28 × 841.89 pt) sont **dupliquées en dur dans au moins 3 fichiers**
(`js/pdf-export.js`, `js/header-footer-preview.js`, `js/reader-mode.js`), et le code l'admet lui-même — commentaire
ligne 164 de `header-footer-preview.js` : *"Constantes dupliquées depuis pdf-export.js (...) : pas de module
partagé entre les deux fichiers."* `pdf-export-alt.js` a même `'@page { size: A4; margin: 18mm; }'` en toutes
lettres dans une chaîne CSS. L'UI elle-même est brandée A4 (`wireA4PreviewToggle`, libellés i18n `"Aperçu A4"`).

| Zone | Ampleur | Détail |
|---|---|---|
| Format de page (A4 → paramétrable) | Refacto réelle mais bornée | Centraliser les constantes dupliquées avant de les rendre paramétrables — dette déjà identifiée par le code lui-même, indépendamment des slides |
| Instance d'éditeur unique → plusieurs instances commutables | Refacto modérée, transverse | `floating-toolbars.js` (`setEditor()`), `header-footer-preview.js`, `pdf-export.js` referment tous sur UNE référence d'éditeur posée une fois au démarrage |
| Variables, sanitization, stockage de modèles, toolbar contextuelle (couleurs, panneaux flottants) | Quasi rien à changer | Déjà découplé du modèle de document |
| Sauts de page → "nouvelle diapositive" | Petit mais pas gratuit | Il faut aussi désactiver la pagination automatique par débordement à l'intérieur d'une diapo, pas juste renommer un bouton |
| Formes (rectangle/ellipse/ligne), sélection multiple + déplacement groupé, rotation | **Développement neuf, pas une refacto** | N'existe nulle part aujourd'hui |
| Généraliser le calque (aujourd'hui limité aux images) au texte | **Développement neuf** | Nouveau type de nœud, sur le modèle de `editorImage` |
| Export PDF du mode slide | **Probablement un nouveau module à côté de `pdf-export.js`, pas une extension** | Réutilise les briques bas niveau (polices, couleurs, primitives de formes) mais la logique de parcours (flux vs liste de blocs flottants) diffère |

**Verdict** : pas une réécriture de Publipostage+ dans son ensemble (la base — variables, modèles, sanitization,
toolbar — traverse quasiment sans y toucher), mais un vrai chantier de fond à deux endroits précis (format de page,
instance d'éditeur unique) avant même de commencer les fonctionnalités propres aux slides, qui elles restent du
développement neuf quelle que soit l'option retenue.

## 7. Le bug de position des images flottantes — diagnostic, piste de correction

Cause probable (lue dans `pdf-export.js`/`header-footer-preview.js`) : pdfmake n'a pas de vraie API de mesure a
priori, donc la position d'une image en calque est **recalculée heuristiquement en JS**
(`computePageGridPosition`) pour deviner sur quelle page pdfmake va la placer. Cette page dépend de la quantité de
texte qui coule au-dessus — si ce texte change, la page peut changer, et la position stockée devient obsolète.
Deux bugs déjà documentés dans `AUDIT_CODE.md` (le bloc réserve sa hauteur en flux même en position absolue ;
`alignment` écrase silencieusement `absolutePosition`) confirment la fragilité du mécanisme actuel.

**Piste intéressante** : une diapositive n'a pas ce problème par construction (pas de texte qui coule autour, juste
des coordonnées fixes). Construire un système de position flottante robuste pour les slides, puis **remplacer par
lui** le mécanisme heuristique actuel des images en calque côté document, pourrait corriger le bug à la racine plutôt
que d'en hériter. Argument concret en faveur du rapprochement des deux outils, au-delà du partage de code brut.

## 8. Décisions déjà actées (faites, pas seulement discutées)

- Le dépôt `SlidesPlus` travaille désormais sur `main` (plus de branche `claude/affectionate-faraday-5ewixp` comme
  branche de travail par défaut) — l'ancienne branche existe encore, suppression à faire manuellement côté GitHub
  (droits insuffisants pour la supprimer depuis cette session).
- Convention de nommage recommandée par l'audit Grist.Gouv/DINUM (`grist-widget-[nom]`) : renommage de `SlidesPlus`
  en `grist-widget-slidesplus` **décidé mais pas encore fait** (pas d'outil de rename de dépôt disponible dans cette
  session — à faire manuellement par l'utilisateur, GitHub redirige automatiquement l'ancienne URL).
- Le dépôt séparé `grist-widget-shared` n'a pas pu être créé automatiquement (l'intégration GitHub de cette session
  n'a pas le droit de créer de nouveaux dépôts). En attendant, `shared/` vit dans `SlidesPlus`, conçu pour être
  extrait facilement (voir `shared/README.md`).
- Fabric.js 7.4.0 vendorisé (pas de CDN) avec hash sha384 documenté dans `DEPENDENCIES.md` — probablement à
  reconsidérer entièrement si l'option 2 (moteur ProseMirror unique) est retenue.

## 9. Questions encore ouvertes

1. **Option 1 vs option 2** (ou une variante) : pas tranché. L'option 2 est celle explorée activement par
   l'utilisateur dans les derniers échanges, mais l'option 1 reste celle qui répond le mieux au critère de
   modularité pour l'audit qu'il a lui-même posé — à reconfronter.
2. Si l'option 1 est retenue : le futur dépôt "cœur" est-il un vrai produit à part (nom, gouvernance propre,
   éventuellement réutilisable par d'autres widgets Grist déjà maintenus par l'utilisateur — `Grist-BI`,
   `GRIST_automation`, `grist-sync-connector`...), ou un détail d'implémentation entre ces deux widgets seulement ?
3. Le processus d'audit DINUM accepte-t-il qu'un widget déclare une dépendance figée vers un composant déjà audité
   séparément, ou faut-il s'attendre à ce que tout soit revu d'un bloc à chaque fois ? Inconnu à ce stade — influence
   beaucoup la valeur de l'option 1.
4. En mode slide, le placement flottant doit-il être le comportement **par défaut** de tout bloc inséré, ou rester
   un geste explicite ("détacher") — y compris pour cette même bascule en mode document classique, comme évoqué par
   l'utilisateur ?
5. Le canevas Fabric.js déjà codé côté `SlidesPlus` (Phase 1, fonctionnel — voir `ROADMAP.md`) est probablement à
   abandonner si le moteur ProseMirror unifié est retenu. À confirmer explicitement avant de continuer à
   l'enrichir ou de le déprécier.

---

*Document de travail, pas une spécification figée — à mettre à jour au fil de la discussion côté
`publipostageGrist`, ou à faire évoluer ici si la conversation continue sur ce dépôt.*
