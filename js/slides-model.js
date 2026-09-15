// slides-model.js — modèle en mémoire d'une présentation (liste de diapositives). Aucune dépendance à Fabric.js ni
// à Grist : `objects` est un blob opaque pour ce module (en pratique le JSON produit par canvas.toJSON()), ce qui
// permet de le tester/réutiliser indépendamment du moteur de rendu.
function createSlidesModel() {
  function makeId() { return 'sl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function blankSlide(name) { return { id: makeId(), name: name, objects: null, thumbnail: null }; }

  let slides = [blankSlide('Diapositive 1')];
  let currentIndex = 0;

  function getSlides() { return slides; }
  function getCurrentIndex() { return currentIndex; }
  function getCurrent() { return slides[currentIndex] || null; }

  function setCurrentIndex(i) {
    if (i < 0 || i >= slides.length) return false;
    currentIndex = i;
    return true;
  }

  function addSlide() {
    slides.splice(currentIndex + 1, 0, blankSlide('Diapositive ' + (slides.length + 1)));
    currentIndex += 1;
    return getCurrent();
  }

  // Toujours garder au moins une diapositive — un widget sans aucune diapositive n'a pas de canevas valide à
  // afficher.
  function removeSlide(index) {
    if (slides.length <= 1) return false;
    slides.splice(index, 1);
    if (currentIndex >= slides.length) currentIndex = slides.length - 1;
    else if (currentIndex > index) currentIndex -= 1;
    return true;
  }

  function moveSlide(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= slides.length) return false;
    const [moved] = slides.splice(index, 1);
    slides.splice(target, 0, moved);
    if (currentIndex === index) currentIndex = target;
    else if (currentIndex === target) currentIndex = index;
    return true;
  }

  function updateCurrent(objectsJson, thumbnailDataUrl) {
    const slide = getCurrent();
    if (!slide) return;
    slide.objects = objectsJson;
    if (thumbnailDataUrl) slide.thumbnail = thumbnailDataUrl;
  }

  // Sérialisation pour la persistance Grist : sans les miniatures (régénérées à l'ouverture depuis `objects`,
  // inutile de les stocker et d'alourdir la colonne Contenu).
  function serialize() {
    return slides.map(s => ({ id: s.id, name: s.name, objects: s.objects }));
  }

  function loadFrom(serializedSlides) {
    slides = (serializedSlides && serializedSlides.length ? serializedSlides : [blankSlide('Diapositive 1')])
      .map(s => ({ id: s.id || makeId(), name: s.name || 'Diapositive', objects: s.objects || null, thumbnail: null }));
    currentIndex = 0;
  }

  return {
    getSlides, getCurrentIndex, getCurrent, setCurrentIndex,
    addSlide, removeSlide, moveSlide, updateCurrent,
    serialize, loadFrom,
  };
}
