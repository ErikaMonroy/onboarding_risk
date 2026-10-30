/**
 * Ejecuta la inferencia real del modelo exportado desde Python.
 * No llama a HTTP/n8n: toda la transformación, logits y probabilidades ocurren en V8.
 * @param {Object} features Valores enviados desde el formulario con categorías originales.
 * @return {Object} Clase, probabilidades, versión y avisos de extrapolación.
 */
function predictRisk_(features) {
  var model = RISK_MODEL_DATA_;
  // Revalidar en servidor: el cliente puede ser modificado o enviar un payload manual.
  var clean = validateModelInput_(features);
  // Aplicar el centrado y escalado aprendido durante el entrenamiento en Python.
  var scaled = model.numeric.map(function (key, i) {
    return (clean[key] - model.numericMean[i]) / model.numericScale[i];
  });
  // Recrear los términos polinómicos exportados; sus posiciones deben coincidir
  // exactamente con las columnas que recibieron los coeficientes entrenados.
  var input = model.powers.map(function (powers, i) {
    var product = powers.reduce(function (value, power, j) {
      return value * Math.pow(scaled[j], power);
    }, 1);
    return (product - model.rescaleMean[i]) / model.rescaleScale[i];
  });
  // Codificación one-hot: una columna binaria por cada categoría aprendida.
  model.categorical.forEach(function (key) {
    model.categories[key].forEach(function (category) { input.push(clean[key] === category ? 1 : 0); });
  });
  // Sumar intercepto y productos peso × variable para obtener un logit por clase.
  var logits = model.classes.map(function (_, c) {
    if (model.coefficients[c].length !== input.length) throw new Error('Dimensiones del modelo incompatibles.');
    return model.coefficients[c].reduce(function (sum, weight, i) {
      return sum + weight * input[i];
    }, model.intercepts[c]);
  });
  if (!logits.every(Number.isFinite)) throw new Error('No se pudo evaluar numéricamente este proyecto.');
  // Softmax, calculado restando el logit máximo para mejorar estabilidad numérica.
  var maximum = Math.max.apply(null, logits);
  var exp = logits.map(function (v) { return Math.exp(v - maximum); });
  var total = exp.reduce(function (a, b) { return a + b; }, 0);
  var probabilities = {};
  model.classes.forEach(function (name, i) { probabilities[name] = exp[i] / total; });
  // Avisar si un valor cae fuera del rango histórico; el modelo aún devuelve estimación.
  var warnings = model.numeric.filter(function (key) {
    return clean[key] < model.observedRanges[key][0] || clean[key] > model.observedRanges[key][1];
  }).map(function (key) { return key + ': fuera del rango observado en el histórico.'; });
  return {risk: model.classes[logits.indexOf(maximum)], probabilities: probabilities,
          modelVersion: model.version, inputWarnings: warnings};
}

/**
 * Valida y normaliza las 13 variables según el contrato exportado del modelo.
 * No traduce categorías: el usuario ve español, pero el payload conserva valores ingleses.
 */
function validateModelInput_(features) {
  if (!features || typeof features !== 'object' || Array.isArray(features)) {
    throw new Error('Faltan las variables del modelo.');
  }
  var model = RISK_MODEL_DATA_;
  var clean = {};
  model.features.forEach(function (key) {
    var value = features[key];
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
      throw new Error('Completa el campo ' + key + '.');
    }
    if (model.numeric.indexOf(key) >= 0) {
      if ((typeof value !== 'number' && typeof value !== 'string') || !Number.isFinite(Number(value))) {
        throw new Error(key + ': debe ser un número válido.');
      }
      value = Number(value);
      if (value < 0) throw new Error(key + ': no puede ser negativo.');
      if (model.positiveFields.indexOf(key) >= 0 && value <= 0) throw new Error(key + ': debe ser positivo.');
      if (model.integerFields.indexOf(key) >= 0 && !Number.isInteger(value)) throw new Error(key + ': debe ser entero.');
      if (model.proportionFields.indexOf(key) >= 0 && value > 1) throw new Error(key + ': usa una proporción entre 0 y 1.');
    } else {
      if (typeof value !== 'string' || model.categories[key].indexOf(value.trim()) < 0) {
        throw new Error(key + ': categoría desconocida. Opciones: ' + model.categories[key].join(', '));
      }
      value = value.trim();
    }
    clean[key] = value;
  });
  return clean;
}
