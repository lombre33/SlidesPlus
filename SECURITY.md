# Politique de sécurité

## Signaler une vulnérabilité

**Ne pas ouvrir d'issue publique** pour une vulnérabilité de sécurité (celles-ci sont indexées et visibles
immédiatement par tout le monde, y compris par un attaquant potentiel avant tout correctif).

Utiliser l'onglet **Security → Report a vulnerability** de ce dépôt GitHub (Security Advisories privées :
https://github.com/lombre33/SlidesPlus/security/advisories/new), qui permet une divulgation confidentielle avant
publication d'un correctif.

## Périmètre

Ce widget s'exécute entièrement côté client, dans le navigateur de l'utilisateur, avec les droits d'accès accordés
au widget par le document Grist qui l'embarque (voir `README.md`, section "Sécurité et permissions", pour le détail
du niveau d'accès demandé et sa justification). Un rapport de vulnérabilité utile précise :

- le contexte Grist (auto-hébergé / SaaS, version si connue) ;
- les étapes de reproduction ;
- l'impact estimé (quelles données/actions sont exposées).

## Délai de réponse

Ce projet est maintenu de façon bénévole/individuelle (pas d'astreinte formelle) — un accusé de réception est visé
sous quelques jours ouvrés.
