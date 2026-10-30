/** Punto de entrada de la web app: renderiza el HTML del formulario. */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Onboarding · Evaluación de riesgo')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Inserta un parcial HTML (CSS o JavaScript generado) dentro de Index.html. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Orquesta una evaluación nueva. La predicción ocurre en predictRisk_ (Model.gs).
 * Después persiste el evento y llama a los webhooks opcionales de n8n.
 * @param {Object} payload Datos básicos del proyecto más `modelInput` de 13 campos.
 * @return {Object} Evaluación final que Client.html presenta en la vista de resultado.
 */
function submitEvaluation(payload) {
  validateEvaluationPayload_(payload);
  // Validar antes de registrar o ejecutar integraciones.
  payload.modelInput = validateModelInput_(payload.modelInput);
  // Generar el identificador una sola vez permite rastrear la evaluación entre hoja y CRM.
  var id = Utilities.getUuid();
  var createdAt = new Date().toISOString();
  var prediction;
  // La inferencia es síncrona y local dentro de Apps Script: no se llama a una API externa.
  try {
    prediction = predictRisk_(payload.modelInput);
  } catch (error) {
    appendEvaluation_(id, createdAt, payload, {
      evaluationId: id, createdAt: createdAt, client: payload.client.name,
      project: payload.client.project, owner: payload.owner || '', risk: '',
      modelVersion: RISK_MODEL_DATA_.version, route: 'Revisión pendiente',
      status: 'PREDICTION_ERROR', message: error.message, crm: {status: 'NOT_EXECUTED'}
    });
    throw new Error('No fue posible calcular el riesgo. La solicitud quedó registrada para revisión.');
  }
  var action = routeForRisk_(prediction.risk);
  var evaluation = {
    evaluationId: id,
    client: payload.client.name,
    project: payload.client.project,
    contact: payload.client.contactName || '',
    contactEmail: payload.client.contactEmail || '',
    owner: payload.owner,
    risk: prediction.risk,
    probabilities: prediction.probabilities,
    modelVersion: prediction.modelVersion,
    inputWarnings: prediction.inputWarnings,
    route: action.route,
    recommendation: null,
    crm: { status: 'PENDING', action: action },
    createdAt: createdAt
  };
  // Registrar antes de las integraciones conserva la evaluación aunque n8n falle.
  appendEvaluation_(id, createdAt, payload, evaluation);
  try { evaluation.recommendation = interpretWithN8n_(evaluation, payload.modelInput); }
  catch (error) { evaluation.recommendation = fallbackInterpretation_(prediction.risk); }
  try { evaluation.crm = executeCrmWithN8n_(evaluation); }
  catch (error) { evaluation.crm = { status: 'PENDING', action: action, message: error.message }; }
  updateEvaluation_(id, evaluation);
  return evaluation;
}

/** Devuelve las evaluaciones del Sheet, más recientes primero, con filtro textual opcional. */
function listEvaluations(query) {
  var rows = getHistorySheet_().getDataRange().getValues();
  if (rows.length < 2) return [];
  var needle = String(query || '').trim().toLowerCase();
  return rows.slice(1).reverse().filter(function (r) {
    return !needle || [r[0], r[2], r[3], r[4], r[5]].join(' ').toLowerCase().indexOf(needle) >= 0;
  }).map(function (r) { return JSON.parse(r[9] || '{}'); });
}

/** Revisa la estructura de la solicitud; Model.gs valida los 13 campos individualmente. */
function validateEvaluationPayload_(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('La solicitud no es válida.');
  if (!payload.client || !payload.client.name || !payload.client.project) throw new Error('Faltan el cliente y el proyecto.');
  if (!payload.modelInput || typeof payload.modelInput !== 'object') throw new Error('Faltan las variables del modelo.');
}

/** Política de prototipo que convierte la clase predicha en una acción inicial. */
function routeForRisk_(risk) {
  var routes = {
    Low: { route: 'Onboarding estándar', action: 'ENABLE_CHECKLIST', priority: 'NORMAL' },
    Medium: { route: 'Revisión preventiva', action: 'CREATE_REVIEW_TASK', priority: 'NORMAL' },
    High: { route: 'Atención personalizada prioritaria', action: 'CREATE_PRIORITY_TASK', priority: 'HIGH' },
    Critical: { route: 'Escalamiento al responsable', action: 'CREATE_ESCALATION_ALERT', priority: 'HIGH' }
  };
  if (!routes[risk]) throw new Error('El modelo devolvió una categoría desconocida.');
  return routes[risk];
}

/** Mensaje local de respaldo cuando el agente de n8n no está configurado o falla. */
function fallbackInterpretation_(risk) {
  var text = { Low: 'Seguir la ruta estándar y revisar el checklist de inicio.', Medium: 'Programar una revisión preventiva antes de iniciar.', High: 'Priorizar una revisión de dependencias y responsables.', Critical: 'Escalar al responsable y registrar una revisión prioritaria.' };
  return { status: 'FALLBACK', text: text[risk] };
}
