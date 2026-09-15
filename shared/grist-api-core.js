// grist-api-core.js — cœur d'accès à l'API Grist, partagé entre plusieurs widgets custom Grist.
//
// Extrait/généralisé depuis publipostageGrist (js/grist-api.js) : même logique, mais les tables internes de
// bookkeeping (règles de correspondance cross-table, sonde d'email utilisateur) sont nommées à partir d'un
// `namespace` fourni par l'appelant plutôt que codées en dur, pour que plusieurs widgets Grist (publipostage,
// SlidesPlus, ...) puissent chacun avoir les leurs sans collision s'ils tournent un jour dans le même document.
//
// Destiné à terme à vivre dans un dépôt séparé (grist-widget-shared), servi via jsDelivr (tag Git + SRI) — voir
// shared/README.md. En attendant la création de ce dépôt, il est développé ici et consommé en same-origin.
//
// Usage :
//   const GristAPI = createGristCore({ namespace: 'SlidesPlus', extraInternalTables: ['SlidesPlus_Presentations'] });
//   await GristAPI.init();
function createGristCore(options) {
  options = options || {};
  const namespace = options.namespace;
  if (!namespace) throw new Error('createGristCore: options.namespace est requis (ex. "SlidesPlus")');

  const LINKS_TABLE_NAME = `${namespace}_LiensTables`;
  const USER_PROBE_TABLE_NAME = `${namespace}_UserProbe`;
  // Tables de bookkeeping propres à l'appelant (ex. ses modèles) à exclure elles aussi de getAllVariables()/tout
  // sélecteur de table présenté à l'utilisateur — sans quoi elles pollueraient l'autocomplétion #Variable.
  const INTERNAL_TABLES = [LINKS_TABLE_NAME, USER_PROBE_TABLE_NAME].concat(options.extraInternalTables || []);

  let _tables = [];
  let _columnsByTable = {};
  let _columnTypesByTable = {};
  // Liste BRUTE (tables internes incluses) de listTables(), mémorisée pour éviter de la redemander à chaque
  // ensureXxxTableExists() — `_tables` ci-dessus les exclut déjà, inutilisable ici. Tenue à jour manuellement après
  // un AddTable réussi pour ne jamais répondre "table absente" pour une table qu'on vient nous-mêmes de créer dans
  // la même session.
  let _rawTables = null;
  async function listAllTablesCached() {
    if (!_rawTables) _rawTables = (await grist.docApi.listTables()) || [];
    return _rawTables;
  }
  let _linkRulesByTable = {};
  let _currentRecord = null;
  let _currentMappings = null;
  let _currentOptions = null;
  let _currentTableId = null;
  let _onRecordCallbacks = [];
  let _recordSubscriptionRegistered = false;
  let _tokenCache = null;

  async function init() {
    // Ne pas ajouter columns:[...] sans revalider en Grist réel : côté publipostageGrist, ça a déjà cassé toute la
    // résolution #Variable (change mappings.tableId, dont dépend detectTableId()).
    grist.ready({ requiredAccess: 'full' });

    // Enregistrer onRecord AVANT tout await pour ne pas rater l'événement initial.
    if (!_recordSubscriptionRegistered) {
      grist.onRecord(function (record, mappings) {
        _currentRecord = record;
        _currentMappings = mappings || null;

        const mappedTableId = mappings && mappings.tableId ? String(mappings.tableId).trim() : null;
        if (mappedTableId) _currentTableId = mappedTableId;
        for (const cb of _onRecordCallbacks) {
          try {
            Promise.resolve(cb(record, _currentTableId, mappings)).catch(function (e) {
              console.error(`[${namespace}/GristCore] erreur callback onRecord:`, e);
            });
          } catch (e) {
            console.error(`[${namespace}/GristCore] erreur callback onRecord:`, e);
          }
        }

        detectTableId(mappings, 'onRecord').then(function (tableId) {
          if (tableId) _currentTableId = tableId;
        }).catch(function (e) {
          console.warn(`[${namespace}/GristCore] onRecord: échec detectTableId —`, e);
        });
      });
      _recordSubscriptionRegistered = true;
    }

    try {
      grist.onOptions(function (opts) { _currentOptions = opts || null; });
    } catch (e) { /* onOptions pas toujours disponible selon la version de Grist */ }

    // Seed immédiat : en mode édition plein accès, getOptions() renvoie déjà l'objet InteractionOptions courant.
    try {
      if (typeof grist.getOptions === 'function') {
        _currentOptions = (await grist.getOptions()) || _currentOptions;
      }
    } catch (e) { /* ignoré */ }

    try { await refreshSchema(); } catch (e) { console.error(`[${namespace}/GristCore] refreshSchema a échoué:`, e); }
    try { await loadLinkRules(); } catch (e) { console.error(`[${namespace}/GristCore] loadLinkRules a échoué:`, e); }
  }

  // Récupération robuste du tableId courant : mappings -> grist.getTable() -> repli sur le schéma (colonnes du
  // record qui coïncident avec une seule table connue).
  async function detectTableId(mappings, source) {
    if (mappings && typeof mappings.tableId !== 'undefined') {
      const id = String(mappings.tableId || '').trim();
      if (id) return id;
    }
    try {
      if (typeof grist.getTable === 'function') {
        const t = await grist.getTable();
        if (t) {
          if (typeof t.getTableId === 'function') {
            const id = await t.getTableId();
            if (id) return id;
          }
          if (t.tableId) return String(t.tableId);
          for (const k of ['id', 'tableRef', 'name']) if (t[k]) return String(t[k]);
        }
      }
    } catch (e) {
      console.warn(`[${namespace}/GristCore] detectTableId(${source}): échec grist.getTable —`, e);
    }
    if (_currentRecord) {
      const recordKeys = Object.keys(_currentRecord);
      for (const tableId of _tables) {
        const cols = _columnsByTable[tableId] || [];
        if (cols.filter(c => recordKeys.indexOf(c) !== -1).length >= 1) return tableId;
      }
    }
    return null;
  }

  async function refreshSchema() {
    try {
      _rawTables = (await grist.docApi.listTables()) || [];
      _tables = _rawTables.filter(t => INTERNAL_TABLES.indexOf(t) === -1);
      // fetchTable en parallèle (latence = le plus lent, pas la somme) ; écrit dans un objet temporaire, remplacé
      // d'un coup pour éviter un schéma vidé-mais-pas-repeuplé pendant les allers-retours réseau.
      const nextColumnsByTable = {};
      await Promise.all(_tables.map(async t => {
        try {
          const data = await grist.docApi.fetchTable(t);
          nextColumnsByTable[t] = Object.keys(data || {}).filter(k => k !== 'id' && k !== 'manualSort');
        } catch (e) {
          console.warn(`[${namespace}/GristCore] refreshSchema: échec fetchTable(${t}) —`, e);
          nextColumnsByTable[t] = [];
        }
      }));
      _columnsByTable = nextColumnsByTable;
    } catch (e) {
      console.error(`[${namespace}/GristCore] refreshSchema: erreur globale —`, e);
    }
    await refreshColumnTypes();
  }

  // Type Grist réel de chaque colonne (ex. "Ref:Employes", "Text"...) — signale à l'UI appelante qu'une colonne
  // est une Référence (et vers quelle table) plutôt qu'un texte ordinaire.
  async function refreshColumnTypes() {
    _columnTypesByTable = {};
    try {
      const tablesMeta = await grist.docApi.fetchTable('_grist_Tables');
      const tableIdByRowId = {};
      for (let i = 0; i < tablesMeta.id.length; i++) tableIdByRowId[tablesMeta.id[i]] = tablesMeta.tableId[i];
      const colsMeta = await grist.docApi.fetchTable('_grist_Tables_column');
      for (let i = 0; i < colsMeta.id.length; i++) {
        const tableId = tableIdByRowId[colsMeta.parentId[i]];
        if (!tableId) continue;
        if (!_columnTypesByTable[tableId]) _columnTypesByTable[tableId] = {};
        _columnTypesByTable[tableId][colsMeta.colId[i]] = colsMeta.type[i];
      }
    } catch (e) {
      console.warn(`[${namespace}/GristCore] refreshColumnTypes: échec`, e);
    }
  }

  function getColumnType(tableId, colId) {
    return (_columnTypesByTable[tableId] && _columnTypesByTable[tableId][colId]) || null;
  }
  function getTables() { return _tables; }
  function getColumns(tableId) { return _columnsByTable[tableId] || []; }

  function getAllVariables() {
    const vars = [];
    for (const t of _tables) for (const c of getColumns(t)) vars.push({ key: t + '.' + c, table: t, column: c });
    return vars;
  }

  function onRecord(cb) {
    _onRecordCallbacks.push(cb);
    // Rejoue immédiatement le dernier record connu si on est déjà prêt (un abonné tardif ne doit pas attendre le
    // prochain changement de sélection pour recevoir un premier état).
    if (_currentRecord) {
      try { cb(_currentRecord, _currentTableId, _currentMappings); }
      catch (e) { console.error(`[${namespace}/GristCore] onRecord replay callback erreur:`, e); }
    }
  }

  function getCurrentRecord() { return _currentRecord; }
  function getCurrentTableId() { return _currentTableId; }

  async function findReferenceColumns(fromTableId, toTableId) {
    if (!fromTableId || !toTableId) return [];
    try {
      const tablesMeta = await grist.docApi.fetchTable('_grist_Tables');
      const tableRowId = {};
      for (let i = 0; i < tablesMeta.id.length; i++) tableRowId[tablesMeta.tableId[i]] = tablesMeta.id[i];
      const fromRowId = tableRowId[fromTableId];
      const toRowId = tableRowId[toTableId];
      if (!fromRowId || !toRowId) return [];
      const colsMeta = await grist.docApi.fetchTable('_grist_Tables_column');
      const refCols = [];
      if (colsMeta && colsMeta.parentId) {
        for (let i = 0; i < colsMeta.parentId.length; i++) {
          if (colsMeta.parentId[i] === fromRowId && colsMeta.type && String(colsMeta.type[i]).indexOf('Ref:') === 0) {
            if (colsMeta.type[i].slice(4) === toTableId) refCols.push(colsMeta.colId[i]);
          }
        }
      }
      return refCols;
    } catch (e) {
      console.warn(`[${namespace}/GristCore] findReferenceColumns: échec:`, e);
      return [];
    }
  }

  async function fetchRowById(tableId, rowId) {
    const data = await grist.docApi.fetchTable(tableId);
    const ids = data && data.id ? data.id : [];
    const idx = ids.indexOf(rowId);
    if (idx === -1) return null;
    const row = {};
    for (const key of Object.keys(data)) row[key] = data[key][idx];
    return row;
  }

  // Toutes les lignes d'une table sous forme de tableau d'objets {colonne: valeur} (au lieu du format colonnaire de
  // fetchTable) — utilisé par la résolution "match"/"singleton" des règles de liaison, qui compare plusieurs lignes
  // à la fois, contrairement à fetchRowById.
  async function fetchTableRows(tableId) {
    const data = await grist.docApi.fetchTable(tableId);
    const ids = data && data.id ? data.id : [];
    const rows = [];
    for (let i = 0; i < ids.length; i++) {
      const row = {};
      for (const key of Object.keys(data)) row[key] = data[key][i];
      rows.push(row);
    }
    return rows;
  }

  // Table de bookkeeping stockant, pour chaque table cible référencée via une variable depuis une autre table,
  // comment en trouver la bonne ligne : "singleton" (une seule ligne pertinente) ou "match" (comparer ColonneCible
  // à ColonneSource, "id" désignant l'identifiant de ligne Grist). Créée à la volée au premier besoin.
  async function ensureLinksTableExists() {
    const tables = await listAllTablesCached();
    if (tables.includes(LINKS_TABLE_NAME)) return;
    try {
      await grist.docApi.applyUserActions([
        ['AddTable', LINKS_TABLE_NAME, [
          { id: 'TableCible', type: 'Text' },
          { id: 'Mode', type: 'Text' },
          { id: 'ColonneCible', type: 'Text' },
          { id: 'ColonneSource', type: 'Text' },
        ]],
      ]);
      _rawTables.push(LINKS_TABLE_NAME);
    } catch (e) {
      console.error(`[${namespace}/GristCore] Erreur création table de liaison`, e);
    }
  }

  async function loadLinkRules() {
    await ensureLinksTableExists();
    _linkRulesByTable = {};
    try {
      const data = await grist.docApi.fetchTable(LINKS_TABLE_NAME);
      const ids = data && data.id ? data.id : [];
      for (let i = 0; i < ids.length; i++) {
        _linkRulesByTable[data.TableCible[i]] = {
          id: data.id[i], mode: data.Mode[i], colonneCible: data.ColonneCible[i], colonneSource: data.ColonneSource[i],
        };
      }
    } catch (e) {
      console.warn(`[${namespace}/GristCore] loadLinkRules: échec de lecture`, e);
    }
  }

  function getLinkRule(tableId) { return _linkRulesByTable[tableId] || null; }
  function getAllLinkRules() {
    return Object.keys(_linkRulesByTable).map(t => Object.assign({ tableCible: t }, _linkRulesByTable[t]));
  }

  // Upsert (une seule règle par table cible) — écrase la précédente si l'utilisateur reconfigure une table déjà
  // liée.
  async function saveLinkRule(tableCible, rule) {
    await ensureLinksTableExists();
    const columns = {
      TableCible: tableCible,
      Mode: rule.mode,
      ColonneCible: rule.mode === 'match' ? (rule.colonneCible || '') : '',
      ColonneSource: rule.mode === 'match' ? (rule.colonneSource || '') : '',
    };
    const existing = _linkRulesByTable[tableCible];
    if (existing) {
      await grist.docApi.applyUserActions([['UpdateRecord', LINKS_TABLE_NAME, existing.id, columns]]);
      _linkRulesByTable[tableCible] = { id: existing.id, mode: columns.Mode, colonneCible: columns.ColonneCible, colonneSource: columns.ColonneSource };
    } else {
      const result = await grist.docApi.applyUserActions([['AddRecord', LINKS_TABLE_NAME, null, columns]]);
      const newId = result.retValues[0];
      _linkRulesByTable[tableCible] = { id: newId, mode: columns.Mode, colonneCible: columns.ColonneCible, colonneSource: columns.ColonneSource };
    }
  }

  async function deleteLinkRule(tableCible) {
    const existing = _linkRulesByTable[tableCible];
    if (!existing) return;
    await grist.docApi.applyUserActions([['RemoveRecord', LINKS_TABLE_NAME, existing.id]]);
    delete _linkRulesByTable[tableCible];
  }

  // Sur certaines instances Grist auto-hébergées (APP_HOME_URL mal configuré), getAccessToken() renvoie un baseUrl
  // avec un host interne injoignable (ex. 0.0.0.0). Corrigé en réutilisant l'origine de document.referrer (la page
  // Grist qui embarque ce widget en iframe).
  function fixBaseUrl(baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (['0.0.0.0', 'localhost', '127.0.0.1'].includes(url.hostname) && document.referrer) {
        const ref = new URL(document.referrer);
        url.protocol = ref.protocol; url.hostname = ref.hostname; url.port = ref.port;
        return url.toString().replace(/\/$/, '');
      }
    } catch (e) { /* baseUrl déjà correct, ou document.referrer absent */ }
    return baseUrl;
  }

  // Jeton d'accès court terme (quelques minutes) réutilisé pour les appels REST (upload/téléchargement de pièces
  // jointes), avec marge de sécurité avant expiration.
  async function getAccessTokenCached() {
    const now = Date.now();
    if (_tokenCache && _tokenCache.expiresAt - now > 15000) return _tokenCache;
    const info = await grist.docApi.getAccessToken({ readOnly: false });
    const baseUrl = fixBaseUrl(info.baseUrl);
    _tokenCache = { token: info.token, baseUrl, expiresAt: now + (info.ttlMsecs || 120000) };
    return _tokenCache;
  }

  async function getAttachmentDownloadUrl(attachmentId) {
    if (!attachmentId) return '';
    const info = await getAccessTokenCached();
    return `${info.baseUrl}/attachments/${attachmentId}/download?auth=${info.token}`;
  }

  // Email utilisateur : le jeton de getAccessTokenCached() renvoie toujours "anon@getgrist.com" (identité scopée au
  // document, pas la session navigateur). Contournement : une formule DÉCLENCHÉE sur `user.Email`, dans une table
  // interne dédiée, capture la vraie valeur (ligne ajoutée puis retirée aussitôt lue).
  async function ensureUserProbeTable() {
    const tables = await listAllTablesCached();
    if (tables.includes(USER_PROBE_TABLE_NAME)) return;
    await grist.docApi.applyUserActions([
      ['AddTable', USER_PROBE_TABLE_NAME, [
        { id: 'Email', type: 'Text', isFormula: false, formula: 'user.Email', recalcWhen: 0, recalcDeps: null },
      ]],
    ]);
    _rawTables.push(USER_PROBE_TABLE_NAME);
  }
  let _userEmailCache = null;
  async function getCurrentUserEmail() {
    if (_userEmailCache) return _userEmailCache;
    await ensureUserProbeTable();
    const addResult = await grist.docApi.applyUserActions([['AddRecord', USER_PROBE_TABLE_NAME, null, {}]]);
    const rowId = addResult && addResult.retValues && addResult.retValues[0];
    if (rowId == null) throw new Error(`AddRecord sur ${USER_PROBE_TABLE_NAME} n'a renvoyé aucun id de ligne`);
    try {
      const row = await fetchRowById(USER_PROBE_TABLE_NAME, rowId);
      const email = row && row.Email;
      if (!email) throw new Error('la formule déclenchée user.Email n\'a renvoyé aucune valeur');
      _userEmailCache = email;
      return email;
    } finally {
      // Nettoyage best-effort — une ligne orpheline ici n'est pas grave (la table reste de toute façon interne),
      // mais mieux vaut ne rien laisser trainer à chaque appel.
      grist.docApi.applyUserActions([['RemoveRecord', USER_PROBE_TABLE_NAME, rowId]]).catch(() => {});
    }
  }

  async function detectCurrentContext() {
    if (!_currentRecord) return null;
    if (!_currentTableId) _currentTableId = await detectTableId(_currentMappings, 'detectCurrentContext');
    if (!_currentTableId) return null;
    return { tableId: _currentTableId, record: _currentRecord, mappings: _currentMappings };
  }

  return {
    namespace, LINKS_TABLE_NAME, USER_PROBE_TABLE_NAME, INTERNAL_TABLES,
    init, refreshSchema, getTables, getColumns, getColumnType, getAllVariables,
    onRecord, getCurrentRecord, getCurrentTableId, detectTableId, detectCurrentContext,
    findReferenceColumns, fetchRowById, fetchTableRows,
    getLinkRule, getAllLinkRules, saveLinkRule, deleteLinkRule,
    getAttachmentDownloadUrl, getAccessTokenCached, getCurrentUserEmail,
  };
}
