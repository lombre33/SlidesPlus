// variable-resolver.js — résolution de variables "#Table.Colonne" (mêmes principes que publipostageGrist,
// js/variables.js), extraite en module partagé indépendant de tout moteur d'édition (ProseMirror/TipTap, canvas...).
//
// La signature de resolveVariable ne dépend que de données explicites (varTable, varColumn, currentTableId,
// record, format) : appelable élément par élément, y compris en boucle sur plusieurs lignes pour une génération
// en masse (ex. une diapositive par ligne d'une table liée), sans état global partagé entre appels.
//
// Destiné à terme à vivre dans un dépôt séparé (grist-widget-shared) — voir shared/README.md.
//
// Usage :
//   const GristAPI = createGristCore({ namespace: 'SlidesPlus' });
//   const VariableResolver = createVariableResolver(GristAPI);
//   const text = await VariableResolver.resolveVariable('Clients', 'Nom', 'Devis', currentRecord, null);
function createVariableResolver(gristApi, variableFormat) {
  if (!gristApi) throw new Error('createVariableResolver: gristApi (instance créée par createGristCore) est requis');
  // VariableFormat est un module autonome (aucune dépendance à la structure document) — auto-détecté comme global
  // si présent et non fourni explicitement, sinon le formatage retombe sur String(val) simple.
  variableFormat = variableFormat || (typeof VariableFormat !== 'undefined' ? VariableFormat : null);

  function unwrapRefValue(v) { return Array.isArray(v) ? v[1] : v; }
  function sameValue(a, b) { return String(a).trim() === String(b).trim(); }

  // Sans format explicite, une colonne Date/DateTime Grist reçoit quand même un préréglage par défaut (sinon
  // valeur brute illisible) ; un nombre sans format reste en revanche String(val) brut.
  function formatValue(val, format, varTable, varColumn) {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.join(', ');
    let effectiveFormat = format;
    if (!effectiveFormat && varTable && varColumn && variableFormat) {
      const colType = gristApi.getColumnType(varTable, varColumn);
      if (colType === 'Date' || colType === 'DateTime') {
        effectiveFormat = { type: 'date', preset: variableFormat.DATE_PRESETS[0].key };
      }
    }
    if (effectiveFormat && variableFormat) {
      if (effectiveFormat.type === 'number') return variableFormat.formatNumber(val, effectiveFormat);
      if (effectiveFormat.type === 'date') return variableFormat.formatDate(val, effectiveFormat);
    }
    return String(val);
  }

  // Valeur brute d'une variable, AVANT tout formatage — réutilisable par resolveAttachmentIds (ne doit jamais
  // passer par formatValue/String). Retourne { value } ou { error } (déjà formaté "[ERREUR: ...]").
  async function resolveRawValueWithRule(varTable, varColumn, rule, record) {
    if (rule.mode === 'singleton') {
      const rows = await gristApi.fetchTableRows(varTable);
      if (!rows.length) return { value: null };
      const first = rows.reduce((min, r) => (r.id < min.id ? r : min), rows[0]);
      return { value: first[varColumn] };
    }
    const sourceVal = rule.colonneSource === 'id' ? record.id : unwrapRefValue(record[rule.colonneSource]);
    if (sourceVal === undefined || sourceVal === null) return { value: null };
    const rows = await gristApi.fetchTableRows(varTable);
    const matches = rows.filter(r => {
      const cibleVal = rule.colonneCible === 'id' ? r.id : unwrapRefValue(r[rule.colonneCible]);
      return sameValue(cibleVal, sourceVal);
    });
    if (!matches.length) return { value: null };
    return { value: matches.map(r => r[varColumn]) };
  }

  async function resolveRawValue(varTable, varColumn, currentTableId, record, opts) {
    const resolvedTableId = currentTableId || gristApi.getCurrentTableId();
    if (!record) return { value: null };
    if (!resolvedTableId) return { error: '[ERREUR: table courante indisponible]' };
    if (varTable === resolvedTableId) {
      // `record` vient de grist.onRecord, encodage Attachments non garanti identique à fetchRowById —
      // resolveAttachmentIds force `forceRawFetch` pour repasser par ce dernier ; resolveVariable ne l'active
      // jamais.
      if (opts && opts.forceRawFetch && record.id != null) {
        try {
          const row = await gristApi.fetchRowById(varTable, record.id);
          if (row) return { value: row[varColumn] };
        } catch (e) { /* repli sur record[varColumn] ci-dessous */ }
      }
      return { value: record[varColumn] };
    }
    const rule = gristApi.getLinkRule(varTable);
    if (rule) return await resolveRawValueWithRule(varTable, varColumn, rule, record);
    const refCols = await gristApi.findReferenceColumns(resolvedTableId, varTable);
    if (refCols.length === 0) return { error: `[ERREUR: aucune correspondance configurée pour ${varTable} — réinsérez la variable pour la configurer]` };
    const refId = record[refCols[0]];
    if (!refId) return { value: null };
    const rowId = unwrapRefValue(refId);
    const linkedRow = await gristApi.fetchRowById(varTable, rowId);
    if (!linkedRow) return { error: `[ERREUR: ligne introuvable dans ${varTable}]` };
    return { value: linkedRow[varColumn] };
  }

  async function resolveVariable(varTable, varColumn, currentTableId, record, format) {
    try {
      const { value, error } = await resolveRawValue(varTable, varColumn, currentTableId, record);
      if (error) return error;
      return formatValue(value, format, varTable, varColumn);
    } catch (e) {
      console.error('[VariableResolver] échec résolution', e);
      return `[ERREUR: résolution de ${varTable}.${varColumn} impossible]`;
    }
  }

  // Une cellule Attachments encode sa liste façon Grist (['L', id1, id2]) ; aplatit récursivement pour n'en garder
  // que les nombres, le marqueur 'L' et toute imbrication disparaissent naturellement.
  function flattenToNumbers(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value.flatMap(flattenToNumbers);
    if (typeof value === 'number') return [value];
    if (value && typeof value === 'object' && typeof value.id === 'number') return [value.id];
    return [];
  }

  async function resolveAttachmentIds(varTable, varColumn, currentTableId, record) {
    try {
      const { value, error } = await resolveRawValue(varTable, varColumn, currentTableId, record, { forceRawFetch: true });
      if (error) return [];
      return flattenToNumbers(value);
    } catch (e) {
      console.error('[VariableResolver] échec résolution pièce jointe', e);
      return [];
    }
  }

  return { resolveVariable, resolveAttachmentIds, resolveRawValue, resolveRawValueWithRule, formatValue, unwrapRefValue, sameValue, flattenToNumbers };
}
