# shared/ — module commun entre widgets Grist

Ce dossier contient la logique **générique**, extraite/adaptée du widget sœur
[publipostageGrist](https://github.com/lombre33/publipostagegrist), commune à tout widget Grist ayant besoin de
résoudre des variables `Table.Colonne` (y compris cross-table) à partir des données d'un document Grist :

| Fichier | Rôle | Statut |
|---|---|---|
| `grist-api-core.js` | Accès à l'API Grist : schéma, lecture de lignes/tables, règles de correspondance cross-table, jetons d'accès pièces jointes. | Généralisé (factory `createGristCore({namespace})`, voir ci-dessous) |
| `variable-resolver.js` | Résolution d'une variable `Table.Colonne` en valeur, y compris cross-table via les règles de `grist-api-core.js`. | Généralisé (factory `createVariableResolver(gristApi)`) |
| `variable-format.js` | Formatage nombre/date d'une valeur résolue. | Copié tel quel (déjà autonome) |
| `html-sanitize.js` | Assainissement minimal d'un HTML externe avant insertion DOM. | Copié tel quel (déjà autonome) |

## Pourquoi une factory plutôt qu'un singleton global ?

`js/grist-api.js` de publipostageGrist est un singleton (`const GristAPI = (function(){...})()`) qui code en dur le
nom de ses tables internes (`Publipostage_LiensTables`, `Publipostage_UserProbe`). Un widget slides a exactement le
même besoin de résolution cross-table — pour éviter de dupliquer cette logique (et la faire diverger avec le temps),
`grist-api-core.js` est ici une **factory** paramétrée par un `namespace` :

```js
const GristAPI = createGristCore({
  namespace: 'SlidesPlus',                       // → tables SlidesPlus_LiensTables / SlidesPlus_UserProbe
  extraInternalTables: ['SlidesPlus_Presentations'], // tables internes additionnelles à exclure de l'autocomplétion
});
await GristAPI.init();

const VariableResolver = createVariableResolver(GristAPI);
const texte = await VariableResolver.resolveVariable('Clients', 'Nom', 'Devis', record, null);
```

Chaque widget obtient ainsi ses propres tables de bookkeeping (aucune collision si les deux widgets tournent un jour
dans le même document Grist), sans dupliquer l'algorithme de résolution.

## Ce qui n'est PAS ici (volontairement)

Toute la couche UI d'insertion/autocomplétion de publipostageGrist (`js/variables.js` : plugin `@tiptap/suggestion`,
badges ProseMirror, popup d'autocomplétion, modale de configuration des règles de correspondance) est fortement
couplée à TipTap/ProseMirror et au DOM de ce widget précis — elle n'a pas été portée ici. SlidesPlus doit construire
sa propre UI (panneau de liaison de données par élément de diapositive) au-dessus des primitives de
`grist-api-core.js` (`getColumns`, `getColumnType`, `findReferenceColumns`, `getLinkRule`/`saveLinkRule`/...).

## Statut : destiné à devenir un dépôt séparé

L'intention est que ce dossier devienne un dépôt GitHub indépendant (`grist-widget-shared`), servi via jsDelivr
(`cdn.jsdelivr.net/gh/lombre33/grist-widget-shared@vX.Y.Z/...`, avec un hash SRI par fichier calculé sur le tag),
consommé à la fois par SlidesPlus et par une future version de publipostageGrist — ce qui élimine la duplication
plutôt que de la déplacer.

**Ce dépôt n'a pas encore pu être créé automatiquement** (l'intégration GitHub de cette session n'a pas le droit de
créer de nouveaux dépôts — `POST /user/repos` renvoie 403). En attendant, ce dossier est consommé en **same-origin**
par SlidesPlus (pas besoin de SRI dans cet état transitoire : une compromission serait déjà celle de ce dépôt
lui-même). Pour finaliser l'extraction :

1. Créer un dépôt public vide `grist-widget-shared` sous `lombre33` (Settings GitHub → New repository).
2. Déplacer ces 4 fichiers + ce README dans ce nouveau dépôt, tagger une première version (`v0.1.0`).
3. Dans `index.html` de SlidesPlus (et, à terme, de publipostageGrist), remplacer les `<script src="shared/...">`
   locaux par des `<script src="https://cdn.jsdelivr.net/gh/lombre33/grist-widget-shared@v0.1.0/..." integrity="sha384-..." crossorigin="anonymous">`.
