// main.js — bootstrap SlidesPlus : connexion Grist, canevas d'édition (Fabric.js), diapositives multiples,
// enregistrement/chargement, mode présentation. Instancie et relie les modules de js/ — la logique elle-même vit
// dans chacun d'eux (slides-model.js, canvas-tools.js, slides-panel.js, presentations-store.js).
//
// Pas encore implémenté (voir ROADMAP.md) : export pptx/pdf, publipostage (liaison de données), galerie de
// modèles, undo/redo.

// Dimensions internes d'une diapositive, en points (72 pt = 1 pouce) — 960×540 pt = 13,333×7,5 po, le format 16:9
// standard de PowerPoint. Choisi dès l'éditeur pour que le futur export pptx (PptxGenJS) et pdf (pdfmake,
// pageSize personnalisé) utilisent la même unité, sans conversion surprise à l'export.
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
  return new fabric.Canvas('slide-canvas', {
    width: SLIDE_WIDTH_PT,
    height: SLIDE_HEIGHT_PT,
    backgroundColor: '#ffffff',
    selection: true,
  });
}

// Mode présentation : tente le vrai Fullscreen API du navigateur, avec repli en pseudo-plein-écran CSS si
// indisponible — Grist ne pose pas systématiquement l'attribut allow="fullscreen" sur l'iframe qui héberge les
// widgets custom, ce qui bloque requestFullscreen() quel que soit le code de ce widget (voir README.md, section
// "Architecture"). Dans les deux cas, la classe spls-presenting masque la barre d'outils et le panneau de
// diapositives (voir css/style.css) : seul ce dernier distingue "vraiment plein écran" de "juste plus d'espace".
function isPresenting() {
  return document.getElementById('app').classList.contains('spls-presenting');
}
// Applique/retire le verrou d'interactivité des objets du canevas — appelé à l'entrée/sortie du mode présentation,
// mais aussi après chaque changement de diapositive PENDANT la présentation : canvas.loadFromJSON() restaure les
// objets avec le selectable/evented qu'ils avaient au moment de la sérialisation (donc interactifs), il faut donc
// réappliquer le verrou à chaque fois, pas seulement une fois à l'entrée du mode présentation.
function setCanvasLocked(canvas, locked) {
  canvas.selection = !locked;
  if (locked) canvas.discardActiveObject();
  canvas.forEachObject(o => { o.selectable = !locked; o.evented = !locked; });
  canvas.requestRenderAll();
}
async function enterPresentation(canvas) {
  const app = document.getElementById('app');
  app.classList.add('spls-presenting');
  setCanvasLocked(canvas, true);
  if (app.requestFullscreen) {
    try { await app.requestFullscreen(); }
    catch (e) { console.warn('[SlidesPlus] requestFullscreen() a échoué (iframe hôte sans allow="fullscreen" ?) — repli en pseudo plein écran CSS.', e); }
  }
}
function exitPresentation(canvas) {
  const app = document.getElementById('app');
  if (document.fullscreenElement) document.exitFullscreen();
  app.classList.remove('spls-presenting');
  setCanvasLocked(canvas, false);
}

async function bootstrap() {
  const canvas = createSlideCanvas();
  const model = createSlidesModel();
  const tools = createCanvasTools(() => canvas);

  const panel = createSlidesPanel(document.getElementById('slides-list'), model, () => canvas, {
    onSwitch() { /* réservé aux prochaines itérations (ex. rafraîchir un panneau de liaison de données par diapo) */ },
  });
  panel.init();

  document.getElementById('tool-text').addEventListener('click', () => tools.addText());
  document.getElementById('tool-rect').addEventListener('click', () => tools.addRect());
  document.getElementById('tool-ellipse').addEventListener('click', () => tools.addEllipse());
  document.getElementById('tool-line').addEventListener('click', () => tools.addLine());
  document.getElementById('tool-delete').addEventListener('click', () => tools.deleteSelected());

  const imageInput = document.getElementById('image-input');
  document.getElementById('tool-image').addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', async () => {
    const file = imageInput.files && imageInput.files[0];
    imageInput.value = ''; // permet de réimporter le même fichier une 2e fois (sinon 'change' ne se redéclenche pas)
    if (!file) return;
    try { await tools.addImageFromFile(file); }
    catch (e) { console.error('[SlidesPlus] échec import image', e); alert('Impossible de charger cette image.'); }
  });

  // Suppression au clavier (Retour arrière/Suppr) uniquement quand le focus n'est pas dans un champ de saisie
  // (sinon Retour arrière dans le nom d'une présentation supprimerait l'objet sélectionné sur le canevas).
  document.addEventListener('keydown', e => {
    if (isPresenting()) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && canvas.getActiveObjects().length) {
      e.preventDefault();
      tools.deleteSelected();
    }
  });

  document.getElementById('btn-add-slide').addEventListener('click', () => panel.addSlide());

  // --- Enregistrement / chargement (Grist) ---
  let currentPresentationId = null;
  let currentPresentationName = null;
  const loadSelect = document.getElementById('load-select');

  async function refreshLoadOptions() {
    const rows = await PresentationsStore.list();
    loadSelect.innerHTML = '<option value="">Charger…</option>';
    rows.forEach(row => {
      const opt = document.createElement('option');
      opt.value = String(row.id);
      opt.textContent = row.nom;
      if (row.id === currentPresentationId) opt.selected = true;
      loadSelect.appendChild(opt);
    });
  }

  document.getElementById('btn-save').addEventListener('click', async () => {
    panel.captureCurrentSlide();
    let name = currentPresentationName;
    if (!name) {
      name = prompt('Nom de la présentation :', 'Présentation sans titre');
      if (!name) return;
    }
    try {
      const id = await PresentationsStore.save(currentPresentationId, name, model.serialize());
      currentPresentationId = id;
      currentPresentationName = name;
      await refreshLoadOptions();
      setStatus('Enregistré', 'ok');
    } catch (e) {
      console.error('[SlidesPlus] échec enregistrement', e);
      setStatus('Échec de l’enregistrement (voir console)', 'error');
    }
  });

  loadSelect.addEventListener('change', async () => {
    const idStr = loadSelect.value;
    if (!idStr) return;
    const id = Number(idStr);
    try {
      const pres = await PresentationsStore.load(id);
      if (!pres) return;
      model.loadFrom(pres.slides);
      currentPresentationId = pres.id;
      currentPresentationName = pres.nom;
      await panel.refreshFromModel();
    } catch (e) {
      console.error('[SlidesPlus] échec chargement', e);
      setStatus('Échec du chargement (voir console)', 'error');
    }
  });

  // --- Mode présentation ---
  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (isPresenting()) exitPresentation(canvas); else enterPresentation(canvas);
  });
  document.addEventListener('keydown', async e => {
    if (!isPresenting()) return;
    if (e.key === 'Escape') { exitPresentation(canvas); return; }
    let moved = false;
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); moved = await panel.switchTo(model.getCurrentIndex() + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); moved = await panel.switchTo(model.getCurrentIndex() - 1); }
    // switchTo() recharge la diapositive depuis son JSON (objets interactifs par défaut) — réappliquer le verrou
    // de présentation à chaque changement, pas seulement à l'entrée du mode (voir setCanvasLocked ci-dessus).
    if (moved) setCanvasLocked(canvas, true);
  });
  // Sortie du vrai plein écran par une touche/action hors de notre contrôle (ex. Échap capté nativement par le
  // navigateur avant notre propre gestionnaire) : rester synchronisé avec l'état réel du navigateur.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isPresenting()) exitPresentation(canvas);
  });

  // --- Connexion Grist ---
  // Table interne additionnelle propre à SlidesPlus (stockage des présentations, voir presentations-store.js) —
  // déclarée ici pour qu'elle soit exclue de l'autocomplétion #Variable dès qu'elle existera (voir
  // shared/README.md).
  const GristAPI = createGristCore({ namespace: 'SlidesPlus', extraInternalTables: [PresentationsStore.TABLE_NAME] });
  const VariableResolver = createVariableResolver(GristAPI);
  // Exposés globalement pour la suite du développement (prochaines itérations : panneau de liaison de données,
  // publipostage) — pas un pattern à généraliser au-delà de ce point d'entrée unique.
  window.SlidesPlus = { canvas, model, tools, panel, GristAPI, VariableResolver };

  await GristAPI.init();
  setStatus('Connecté à Grist', 'ok');
  await refreshLoadOptions();
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch(e => {
    console.error('[SlidesPlus] échec d’initialisation', e);
    setStatus('Connexion à Grist impossible (voir console)', 'error');
  });
});
