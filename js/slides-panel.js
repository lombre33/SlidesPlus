// slides-panel.js — panneau latéral des diapositives (miniatures, ajout/suppression/réordonnancement) : synchronise
// le modèle en mémoire (slides-model.js) avec le canevas Fabric.js actif.
//
// Le canevas ne contient jamais qu'UNE SEULE diapositive à la fois (celle en cours d'édition) — changer de
// diapositive capture l'état du canevas dans la diapositive qu'on quitte, puis recharge le JSON de la diapositive
// cible. C'est le point central de ce module : sans capture systématique avant de changer d'index, toute
// modification faite sur une diapositive non explicitement "enregistrée" serait perdue au moindre clic ailleurs.
function createSlidesPanel(listEl, model, getCanvas, opts) {
  opts = opts || {};
  const onSwitch = opts.onSwitch || function () {};

  function captureCurrentSlide() {
    const canvas = getCanvas();
    // multiplier bas : une miniature n'a pas besoin de la résolution native de la diapositive (960×540), un
    // dixième suffit largement à l'affichage en petite vignette et reste léger à régénérer à chaque changement.
    const thumbnail = canvas.toDataURL({ format: 'png', multiplier: 0.2 });
    model.updateCurrent(canvas.toJSON(), thumbnail);
  }

  async function loadSlideIntoCanvas(slide) {
    const canvas = getCanvas();
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    if (slide && slide.objects) {
      await canvas.loadFromJSON(slide.objects);
    }
    canvas.requestRenderAll();
  }

  function render() {
    listEl.innerHTML = '';
    model.getSlides().forEach((slide, index) => {
      const item = document.createElement('div');
      item.className = 'slide-thumb' + (index === model.getCurrentIndex() ? ' active' : '');

      const img = document.createElement('img');
      img.src = slide.thumbnail || '';
      img.alt = '';

      const label = document.createElement('span');
      label.className = 'slide-thumb-label';
      label.textContent = (index + 1) + '. ' + slide.name;

      const actions = document.createElement('div');
      actions.className = 'slide-thumb-actions';

      const btnUp = document.createElement('button');
      btnUp.type = 'button'; btnUp.textContent = '↑'; btnUp.title = 'Monter'; btnUp.disabled = index === 0;
      btnUp.addEventListener('click', e => { e.stopPropagation(); if (model.moveSlide(index, -1)) render(); });

      const btnDown = document.createElement('button');
      btnDown.type = 'button'; btnDown.textContent = '↓'; btnDown.title = 'Descendre';
      btnDown.disabled = index === model.getSlides().length - 1;
      btnDown.addEventListener('click', e => { e.stopPropagation(); if (model.moveSlide(index, 1)) render(); });

      const btnDelete = document.createElement('button');
      btnDelete.type = 'button'; btnDelete.textContent = '✕'; btnDelete.title = 'Supprimer';
      btnDelete.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Supprimer cette diapositive ?')) return;
        if (model.removeSlide(index)) { await loadSlideIntoCanvas(model.getCurrent()); render(); onSwitch(model.getCurrent()); }
      });

      actions.appendChild(btnUp); actions.appendChild(btnDown); actions.appendChild(btnDelete);
      item.appendChild(img); item.appendChild(label); item.appendChild(actions);
      item.addEventListener('click', () => { if (index !== model.getCurrentIndex()) switchTo(index); });
      listEl.appendChild(item);
    });
  }

  async function switchTo(index) {
    captureCurrentSlide();
    if (!model.setCurrentIndex(index)) return false;
    await loadSlideIntoCanvas(model.getCurrent());
    render();
    onSwitch(model.getCurrent());
    return true;
  }

  async function addSlide() {
    captureCurrentSlide();
    model.addSlide();
    await loadSlideIntoCanvas(model.getCurrent());
    render();
    onSwitch(model.getCurrent());
  }

  // À appeler après un chargement externe du modèle (model.loadFrom(), ex. ouverture d'une présentation
  // enregistrée) : contrairement à switchTo()/addSlide(), ne capture PAS le canevas courant (son contenu vient
  // d'être remplacé par un modèle entièrement différent, le capturer écraserait la diapositive qu'on vient de
  // charger avec l'état de l'ancienne présentation).
  async function refreshFromModel() {
    await loadSlideIntoCanvas(model.getCurrent());
    render();
    onSwitch(model.getCurrent());
  }

  // Premier rendu (diapositive vide initiale) : capture ce qu'il y a déjà sur le canevas pour que la 1ère
  // miniature ne soit pas vide, puis affiche la liste.
  function init() {
    captureCurrentSlide();
    render();
  }

  return { init, render, addSlide, switchTo, refreshFromModel, captureCurrentSlide };
}
