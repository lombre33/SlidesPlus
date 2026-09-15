# Contribuer à SlidesPlus

## Principes du projet

- **Pas d'étape de build.** Tous les fichiers sont servis tels quels (page statique GitHub Pages). Pas de bundler,
  pas de transpileur, pas de `package.json` à la racine. Voir `DEPENDENCIES.md` pour la règle sur les dépendances.
- **Dépendances minimales, vendorisées, toujours en dernière version stable.** Avant d'ajouter une bibliothèque,
  vérifier qu'aucune dépendance déjà présente ne couvre le besoin. Voir `DEPENDENCIES.md` pour la procédure exacte.
- **Fichiers modulaires, lisibles "d'une traite".** Un fichier qui dépasse quelques centaines de lignes doit être
  découpé par responsabilité avant, pas après (le widget sœur `publipostageGrist` a dû refactoriser après coup des
  fichiers de plusieurs milliers de lignes — voir son `AUDIT_CODE.md` §5, §8.2). Un relecteur humain doit pouvoir
  lire la logique d'un fichier sans devoir la reconstituer depuis plusieurs milliers de lignes.
- **Commentaires : le POURQUOI, jamais le QUOI.** Pas de paraphrase du code. Un commentaire n'a de valeur que s'il
  explique une contrainte non évidente, un contournement, ou un piège déjà rencontré.
- **Code généré par IA : autorisé, mais doit être compris et relu par un humain avant d'être proposé** — ne jamais
  proposer une modification sans l'avoir lue et comprise en entier, et éviter la verbosité que les outils IA ont
  tendance à produire (docstrings inutiles, abstractions non demandées).

## Faire tourner le projet en local

Aucune dépendance à installer. Un simple serveur de fichiers statiques suffit :

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Sans document Grist réel embarquant le widget en iframe, `grist.ready()` échoue — voir `dev-tests/` (à venir, voir
`ROADMAP.md`) pour un stub `window.grist` permettant de développer l'UI sans dépendre d'un vrai document.

## Structure du dépôt

```
index.html          page unique du widget
css/                 styles
js/                  code applicatif propre à SlidesPlus
shared/              module partagé avec le widget sœur publipostageGrist (voir shared/README.md)
vendor/              bibliothèques tierces vendorisées (voir DEPENDENCIES.md)
```

## Avant de proposer une modification

1. Vérifier qu'elle n'élargit pas silencieusement le niveau d'accès Grist demandé (`requiredAccess`) sans mise à
   jour de la section "Sécurité et permissions" du `README.md`.
2. Vérifier qu'aucune donnée métier n'est interpolée via `innerHTML` (toujours `textContent` — voir
   `shared/html-sanitize.js` pour la seule exception légitime : du HTML externe réinjecté à la frontière).
3. Documenter toute nouvelle dépendance dans `DEPENDENCIES.md` avant de la référencer dans `index.html`.
