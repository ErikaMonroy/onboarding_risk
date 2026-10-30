/**
 * Solicita una lectura en lenguaje natural al agente de n8n.
 * Solo manda metadatos generales y el resultado; no manda las 13 respuestas de intake.
 * Si no hay URL, entrega la interpretación local de respaldo.
 */
function interpretWithN8n_(evaluation, modelInput) {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('N8N_AGENT_URL')) return fallbackInterpretation_(evaluation.risk);
  var response = postWebhook_(p.getProperty('N8N_AGENT_URL'), p.getProperty('N8N_AGENT_TOKEN'), {
    evaluationId: evaluation.evaluationId,
    companyName: evaluation.client,
    projectName: evaluation.project,
    predictedRisk: evaluation.risk,
    probabilities: evaluation.probabilities,
    policyRoute: evaluation.route,
    modelVersion: evaluation.modelVersion
  });
  var text = response.text || response.interpretation;
  if (typeof text !== 'string' || !text.trim()) throw new Error('El agente no devolvió texto.');
  return {status: 'SUCCESS', text: text};
}

/** Envía la evaluación al workflow CRM opcional y devuelve su estado/recordId. */
function executeCrmWithN8n_(evaluation) {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('N8N_CRM_URL')) return {status: 'NOT_CONFIGURED', action: evaluation.crm.action};
  // Reuse the existing Apps Script ↔ n8n bearer token unless a dedicated CRM
  // token is configured. The HubSpot Service Key remains stored only in n8n.
  var token = p.getProperty('N8N_CRM_TOKEN') || p.getProperty('N8N_AGENT_TOKEN');
  var response = postWebhook_(p.getProperty('N8N_CRM_URL'), token, evaluation);
  if (typeof response.status !== 'string' || !response.status) throw new Error('El CRM no devolvió un estado.');
  response.action = evaluation.crm.action;
  return response;
}

/** Helper HTTP compartido: POST JSON con Bearer opcional y validación de HTTP/JSON. */
function postWebhook_(url, token, payload) {
  if (!url) throw new Error('URL del workflow n8n no configurada.');
  var headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  var response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: headers, payload: JSON.stringify(payload)
  });
  var status = response.getResponseCode();
  var body = JSON.parse(response.getContentText() || '{}');
  if (status < 200 || status >= 300) throw new Error(body.message || 'El workflow n8n devolvió HTTP ' + status + '.');
  return body;
}
