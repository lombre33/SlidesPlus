// canvas-tools.js — outils d'insertion sur le canevas Fabric.js actif (texte, formes, image).
//
// Prend `getCanvas` (une fonction) plutôt que l'instance canvas directement : ce module est chargé/instancié avant
// que main.js ait fini de créer le canevas Fabric, `getCanvas` évite d'imposer un ordre d'initialisation strict
// entre les modules.
function createCanvasTools(getCanvas) {
  // Position de dépôt par défaut d'un nouvel objet — légèrement décalée à chaque insertion tant qu'on reste dans
  // la diapositive, pour que plusieurs insertions successives ne s'empilent pas exactement au même endroit.
  let dropOffset = 0;
  function nextDropPosition() {
    const pos = 60 + (dropOffset % 6) * 24;
    dropOffset += 1;
    return pos;
  }

  function addAndSelect(obj) {
    const canvas = getCanvas();
    canvas.add(obj);
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    return obj;
  }

  function addText() {
    const pos = nextDropPosition();
    return addAndSelect(new fabric.IText('Texte', {
      left: pos, top: pos, fontSize: 28, fill: '#1f2328', fontFamily: 'Arial',
    }));
  }

  function addRect() {
    const pos = nextDropPosition();
    return addAndSelect(new fabric.Rect({
      left: pos, top: pos, width: 220, height: 130, fill: '#2563eb',
    }));
  }

  function addEllipse() {
    const pos = nextDropPosition();
    return addAndSelect(new fabric.Ellipse({
      left: pos, top: pos, rx: 110, ry: 65, fill: '#2563eb',
    }));
  }

  function addLine() {
    const pos = nextDropPosition();
    return addAndSelect(new fabric.Line([pos, pos + 40, pos + 220, pos + 40], {
      stroke: '#1f2328', strokeWidth: 3,
    }));
  }

  // Image importée depuis le disque de l'utilisateur (input file). L'import depuis les pièces jointes Grist est
  // une brique séparée (Phase 3, publipostage) — voir ROADMAP.md.
  function addImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        fabric.Image.fromURL(reader.result).then(img => {
          const pos = nextDropPosition();
          img.set({ left: pos, top: pos });
          // Limite la taille d'insertion initiale à quelque chose de raisonnable dans la diapositive, sans
          // déformer l'image (garde le ratio) — l'utilisateur redimensionne ensuite librement.
          const maxDim = 420;
          if (img.width > maxDim || img.height > maxDim) img.scale(maxDim / Math.max(img.width, img.height));
          resolve(addAndSelect(img));
        }).catch(reject);
      };
      reader.readAsDataURL(file);
    });
  }

  function deleteSelected() {
    const canvas = getCanvas();
    const active = canvas.getActiveObjects();
    if (!active.length) return false;
    active.forEach(obj => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    return true;
  }

  return { addText, addRect, addEllipse, addLine, addImageFromFile, deleteSelected };
}
