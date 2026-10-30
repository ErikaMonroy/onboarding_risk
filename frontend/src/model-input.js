/**
 * Convierte los controles del formulario en el objeto `modelInput` esperado por Apps Script.
 * Conserva unidades originales (USD, meses y conteos) y categorías internas en inglés.
 * No codifica one-hot ni predice: esas transformaciones y la clasificación ocurren en Model.gs.
 * @param {Array<Object>} fields Catálogo de campos con `name`, `type`, `value` y `label`.
 * @return {Object} Variables listas para enviar a `submitEvaluation`.
 */
export function buildModelInput(fields) {
  return Object.fromEntries(fields.map(field => {
    if (field.value === '' || field.value === null || field.value === undefined ||
        (typeof field.value === 'string' && !field.value.trim())) {
      throw new Error('Completa el campo ' + field.label + '.');
    }
    let value = field.type === 'number' ? Number(field.value) : String(field.value);
    if (field.type === 'number' && !Number.isFinite(value)) throw new Error(field.label + ': número inválido.');
    return [field.name, value];
  }));
}
