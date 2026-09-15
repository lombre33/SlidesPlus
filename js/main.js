// main.js — bootstrap SlidesPlus : connexion Grist, canevas d'édition (Fabric.js), mode présentation.
//
// Ce fichier est volontairement un SQUELETTE : il établit la connexion Grist et affiche une diapositive vide
// éditable, mais n'implémente pas encore l'outillage d'édition (barre d'outils de formes/texte/images), ni
// l'export pptx/pdf, ni le publipostage. Voir ROADMAP.md pour le détail de ce qui reste à construire.

// Dimensions internes d'une diapositive, en points (72 pt = 1 pouce) — 960×540 pt = 13,333×7,5 po, le format 16:9
// standard de PowerPoint. Choisi dès maintenant pour que le futur export pptx (PptxGenJS) et pdf (pdfmake,
// pageSize personnalisé) utilisent la même unité que l'éditeur, sans conversion surprise à l'export.
const SLIDE_WIDTH_PT = 960;
const SLIDE_HEIGHT_PT = 540;

function setStatus(text, kind) {
  const el = document.getElementById('grist-status');
  el.textContent = text;
  el.className = 'status status-' + (kind || 'pending');
}

function createSlideCanvas() {
  const canvasEl = document.getElementById('slide-canvas');
  canvasEl.width = SLIDE_WIDTH_PT;
  canvasEl.height = SLIDE_HEIGHT_PT;
  const canvas = new fabric.Canvas('slide-canvas', {
    width: SLIDE_WIDTH_PT,
    height: SLIDE_HEIGHT_PT,
    backgroundColor: '#ffffff',
    selection: true,
  });
  // Objet de démonstration — sera remplacé par la vraie barre d'outils d'insertion (texte/forme/image) d'une
  // prochaine itération. Confirme juste que le canevas est bien vivant et éditable (sélection/déplacement).
  const placeholder = new fabric.IText('SlidesPlus — fondation du projet', {
    left: 60,
    top: 60,
    fontSize: 28,
    fill: '#1f2328',
    fontFamily: 'Arial',
  });
  canvas.add(placeholder);
  return canvas;
}

// Mode présentation : tente le vrai Fullscreen API du navigateur, avec repli en pseudo-plein-écran CSS si
// indisponible — Grist ne pose pas systématiquement l'attribut allow="fullscreen" sur l'iframe qui héberge les
// widgets custom, ce qui bloque requestFullscreen() quel que soit le code de ce widget (voir README.md, section
// "Mode présentation"). Le repli garantit que le mode présentation fonctionne toujours, même sans vrai plein écran.
function isPresenting() {
  return !!document.fullscreenElement || document.getElementById('app').classList.contains('spls-pseudo-fullscreen');
}
async function enterPresentation() {
  const app = document.getElementById('app');
  if (app.requestFullscreen) {
    try {
      await app.requestFullscreen();
      return;
    } catch (e) {
      console.warn('[SlidesPlus] requestFullscreen() a échoué (iframe hôte sans allow="fullscreen" ?) — repli en pseudo plein écran CSS.', e);
    }
  }
  app.classList.add('spls-pseudo-fullscreen');
}
function exitPresentation() {
  const app = document.getElementById('app');
  if (document.fullscreenElement) document.exitFullscreen();
  app.classList.remove('spls-pseudo-fullscreen');
}
function wireFullscreenButton() {
  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (isPresenting()) exitPresentation(); else enterPresentation();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isPresenting()) exitPresentation();
  });
}

async function initGrist() {
  // Table interne additionnelle propre à SlidesPlus (stockage des présentations) — pas encore créée/utilisée dans
  // ce squelette, déclarée dès maintenant pour qu'elle soit exclue de l'autocomplétion #Variable dès qu'elle
  // existera (voir shared/README.md).
  const GristAPI = createGristCore({ namespace: 'SlidesPlus', extraInternalTables: ['SlidesPlus_Presentations'] });
  const VariableResolver = createVariableResolver(GristAPI);
  // Exposés globalement pour la suite du développement (prochaines itérations : panneau de liaison de données,
  // publipostage) — pas un pattern à généraliser au-delà de ce point d'entrée unique.
  window.SlidesPlus = window.SlidesPlus || {};
  window.SlidesPlus.GristAPI = GristAPI;
  window.SlidesPlus.VariableResolver = VariableResolver;

  await GristAPI.init();
  setStatus('Connecté à Grist', 'ok');
}

document.addEventListener('DOMContentLoaded', () => {
  window.SlidesPlus = window.SlidesPlus || {};
  window.SlidesPlus.canvas = createSlideCanvas();
  wireFullscreenButton();
  initGrist().catch(e => {
    console.error('[SlidesPlus] échec de connexion à Grist', e);
    setStatus('Connexion à Grist impossible (voir console)', 'error');
  });
});
