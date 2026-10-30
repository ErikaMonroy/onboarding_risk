/** Abre la hoja de histórico según SPREADSHEET_ID en Script Properties. */
function getHistorySheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Configura SPREADSHEET_ID en las propiedades del proyecto.');
  var sheet = SpreadsheetApp.openById(id).getSheetByName('Evaluaciones');
  if (!sheet) throw new Error('Crea una pestaña llamada Evaluaciones en el archivo de histórico.');
  return sheet;
}

/** Inserta la evaluación inicial, incluyendo JSON para reconstruir el detalle en UI. */
function appendEvaluation_(id, createdAt, payload, evaluation) {
  getHistorySheet_().appendRow([id, createdAt, payload.client.name, payload.client.project,
    payload.owner || '', evaluation.risk || '', evaluation.modelVersion || '',
    evaluation.route || '', evaluation.crm ? evaluation.crm.status : 'PENDING', JSON.stringify(evaluation),
    JSON.stringify(payload.modelInput)]);
}

/** Actualiza la fila identificada al terminar n8n; no crea una nueva fila duplicada. */
function updateEvaluation_(id, evaluation) {
  var sheet = getHistorySheet_();
  var values = sheet.getDataRange().getValues();
  for (var i = values.length - 1; i > 0; i--) {
    if (String(values[i][0]) === id) {
      sheet.getRange(i + 1, 6, 1, 5).setValues([[
        evaluation.risk, evaluation.modelVersion, evaluation.route,
        evaluation.crm.status, JSON.stringify(evaluation)
      ]]);
      return;
    }
  }
  throw new Error('No se encontró la evaluación para actualizar.');
}
