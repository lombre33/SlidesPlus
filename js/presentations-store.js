// presentations-store.js — persistance des présentations (liste de diapositives) dans une table Grist interne
// dédiée, sur le même patron que Publipostage_Modeles côté widget sœur publipostageGrist : création/migration
// idempotente (AddTable seulement si la table n'existe pas encore), CRUD direct via applyUserActions.
//
// Volontairement indépendant de shared/grist-api-core.js : ce module manipule SA PROPRE table applicative (le
// contenu des présentations), pas le schéma générique du document — il appelle directement le SDK Grist global
// (`grist.docApi`), comme le fait templates.js côté publipostageGrist pour Publipostage_Modeles.
const PresentationsStore = (function () {
  const TABLE_NAME = 'SlidesPlus_Presentations';
  let tableChecked = false;

  async function ensureTableExists() {
    if (tableChecked) return;
    const tables = (await grist.docApi.listTables()) || [];
    if (!tables.includes(TABLE_NAME)) {
      await grist.docApi.applyUserActions([
        ['AddTable', TABLE_NAME, [
          { id: 'Nom', type: 'Text' },
          { id: 'Contenu', type: 'Text' },
          { id: 'DateModif', type: 'DateTime' },
        ]],
      ]);
    }
    tableChecked = true;
  }

  async function list() {
    await ensureTableExists();
    const data = await grist.docApi.fetchTable(TABLE_NAME);
    const ids = data && data.id ? data.id : [];
    const rows = [];
    for (let i = 0; i < ids.length; i++) {
      rows.push({ id: ids[i], nom: data.Nom[i], dateModif: data.DateModif[i] });
    }
    // Plus récent en premier — la présentation qu'on vient d'enregistrer doit apparaître en tête de liste sans
    // que l'utilisateur ait à chercher.
    return rows.sort((a, b) => (b.dateModif || 0) - (a.dateModif || 0));
  }

  async function load(id) {
    await ensureTableExists();
    const data = await grist.docApi.fetchTable(TABLE_NAME);
    const idx = (data.id || []).indexOf(id);
    if (idx === -1) return null;
    let slides;
    try {
      slides = JSON.parse(data.Contenu[idx]);
    } catch (e) {
      console.error('[PresentationsStore] Contenu JSON invalide pour la présentation', id, e);
      return null;
    }
    return { id, nom: data.Nom[idx], slides };
  }

  // Upsert : `id` absent -> AddRecord (nouvelle présentation), présent -> UpdateRecord. Retourne l'id (nouveau ou
  // inchangé), à conserver côté appelant pour les enregistrements suivants.
  async function save(id, nom, slides) {
    await ensureTableExists();
    const columns = {
      Nom: nom,
      Contenu: JSON.stringify(slides),
      // Colonne DateTime Grist : timestamp Unix en SECONDES (voir shared/variable-format.js, gristDateToJsDate).
      DateModif: Math.floor(Date.now() / 1000),
    };
    if (id) {
      await grist.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, id, columns]]);
      return id;
    }
    const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, columns]]);
    return result.retValues[0];
  }

  async function remove(id) {
    await grist.docApi.applyUserActions([['RemoveRecord', TABLE_NAME, id]]);
  }

  return { TABLE_NAME, list, load, save, remove };
})();
