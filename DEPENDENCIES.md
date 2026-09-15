# Inventaire des dépendances (SBOM manuel)

Aucune dépendance n'est chargée depuis un CDN tiers à l'exécution : tout est **vendorisé** (copié dans ce dépôt),
servi en same-origin par GitHub Pages, versions toujours figées explicitement (jamais `@latest`/`latest`). C'est un
choix délibéré dès la conception de ce dépôt, pour éviter dès le départ le point resté ouvert dans l'audit de
sécurité du widget sœur [publipostageGrist](https://github.com/lombre33/publipostagegrist) (`AUDIT_CODE.md` §2.2) :
l'intégrité SRI est structurellement impossible sur un import map ESM chargé depuis un CDN externe, alors qu'elle
est inutile sur un fichier déjà same-origin — voir aussi `SECURITY.md`.

| Fichier vendorisé | Bibliothèque | Version | Origine | Licence | sha384 du fichier vendorisé |
|---|---|---|---|---|---|
| `vendor/fabric.min.js` | [Fabric.js](https://fabricjs.com/) | 7.4.0 | `dist/index.min.js` du paquet npm officiel [`fabric`](https://www.npmjs.com/package/fabric/v/7.4.0) (tarball vérifié via `registry.npmjs.org`, provenance SLSA attestée par npm) | MIT (`vendor/LICENSES/fabric.LICENSE.txt`) | `T2IWa4YW4tn/gJpR880CrMehXQvwxwaRgQszdzYPA6jBbKH9sPZuTf9YrN/PqNP6` |

Dépendance non vendorisée (ne peut techniquement pas l'être — SDK officiel Grist, non versionné par Grist lui-même,
chargé tel quel comme c'est déjà le cas dans publipostageGrist) :

| Source | Rôle |
|---|---|
| `https://docs.getgrist.com/grist-plugin-api.js` | SDK officiel du widget Grist |

## Prévues, pas encore intégrées (Phase 2 : export pptx/pdf)

Choix arrêtés (voir la conversation d'architecture qui a précédé ce commit), à vendoriser au moment de leur
intégration réelle, en suivant exactement le même procédé (paquet npm officiel → extraction du bundle navigateur →
hash sha384 documenté ici) :

| Bibliothèque | Version cible | Licence | Rôle prévu |
|---|---|---|---|
| [PptxGenJS](https://github.com/gitbrent/PptxGenJS) | 4.0.1 | MIT | Génération du fichier .pptx exporté |
| [pdfmake](http://pdfmake.org/) | 0.3.11 | MIT | Export PDF vectoriel (réutilisation du choix déjà fait par publipostageGrist, qui est en 0.2.7 — migration à tester séparément côté widget sœur) |

## Comment vérifier l'intégrité d'un fichier vendorisé

```sh
openssl dgst -sha384 -binary vendor/fabric.min.js | openssl base64 -A
# doit correspondre exactement à la valeur de la colonne "sha384" ci-dessus
```

## Règle pour toute future dépendance

1. Toujours la dernière version stable au moment de l'ajout (jamais une version datée sans raison documentée).
2. Récupérée depuis son registre officiel (npm), jamais copiée depuis un CDN tiers non vérifiable.
3. Vendorisée (fichier committé), pas chargée dynamiquement depuis une origine externe — sauf le SDK Grist
   ci-dessus, qui ne peut pas l'être.
4. Ajoutée à ce tableau avec son hash sha384 et sa licence avant d'être référencée dans `index.html`.
5. Avant d'en ajouter une nouvelle : vérifier qu'aucune dépendance déjà présente ne couvre déjà le besoin.
