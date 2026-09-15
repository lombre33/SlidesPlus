// html-sanitize.js — assainissement minimal du HTML avant toute insertion DOM (contenu potentiellement modifié EN DEHORS de l'éditeur — colonne Grist éditée
// par un autre collaborateur, gabarit importé). Retire <script>/attributs on*/URLs javascript: via un DOMParser inerte (rien ne charge/s'exécute pendant le
// parsing). Copié tel quel depuis publipostageGrist (js/html-sanitize.js) — module déjà autonome.
//
// Volontairement MINIMAL (pas d'équivalent DOMPurify complet : pas de whitelist stricte de balises/attributs, pas de traitement des URLs CSS ni des balises
// <svg>/<math>) — à appliquer uniquement à la frontière (contenu de gabarit/import réinjecté via innerHTML), jamais à une valeur de cellule Grist (celle-ci
// doit toujours passer par textContent). Voir AUDIT_CODE.md de publipostageGrist §3.2/§8.2 pour l'analyse complète de ce compromis.
const HtmlSanitize = (function () {
  function clean(html) {
    if (!html) return html || '';
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    doc.querySelectorAll('script').forEach(el => el.remove());
    doc.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.indexOf('on') === 0) { el.removeAttribute(attr.name); return; }
        if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(attr.value)) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return doc.body.innerHTML;
  }
  return { clean };
})();
