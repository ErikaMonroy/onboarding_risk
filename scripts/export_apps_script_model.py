"""Exporta la logística de 13 campos para reproducir su inferencia en Apps Script.

El script vuelve a ejecutar la búsqueda del experimento elegido en el entorno Python
local; serializa parámetros, no convierte el runtime de Apps Script en un servicio ML.
El dataset, los helpers de entrenamiento y los joblib locales no deben publicarse.
"""
from pathlib import Path
import hashlib
import json
import sys
import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from _support.optimizar_riesgo import BASE, search
from sklearn.model_selection import StratifiedKFold

APP = ROOT / 'onboarding-risk/apps-script'
df = pd.read_csv(ROOT / 'project_dataset.csv', keep_default_na=False)
# Reconstruir el split histórico del experimento elegido: solo las filas de desarrollo
# participan en la selección/entrenamiento que se empaqueta para la web app.
partitions = pd.read_csv(ROOT / 'resultados_modelos/particiones.csv').set_index('Project_ID')['partición']
dev = df.Project_ID.map(partitions).eq('desarrollo')
X_dev, y_dev = df.loc[dev, BASE].copy(), df.loc[dev, 'Risk_Level']
for c in X_dev.select_dtypes(exclude='number'):
    X_dev[c] = X_dev[c].astype(str)
folds = list(StratifiedKFold(3, shuffle=True, random_state=271).split(X_dev, y_dev))
selected = search(X_dev, y_dev, 'Logística', folds, ROOT / 'resultados_modelos_v2/cache')
# Evitar exportar silenciosamente otro candidato si cambió el proceso de selección.
assert selected['params'] == {'C': 3, 'degree': 2}
artifact = ROOT / 'resultados_modelos_v2/modelo_13_campos.joblib'
joblib.dump({'model': selected['model'], 'features': BASE, 'group': 'A · 13 iniciales',
             'name': 'Logística', 'params': selected['params'], 'campos_condicionados': [],
             'requiere_validacion_dia_1': True}, artifact, compress=3)
# Leer el pipeline ya ajustado para extraer sus transformaciones y pesos por separado.
bundle = joblib.load(artifact)
pipeline = bundle['model']
pre, classifier = pipeline.named_steps['pre'], pipeline.named_steps['model']
numeric, nums = next((t, c) for n, t, c in pre.transformers_ if n == 'num')
encoder, cats = next((t, c) for n, t, c in pre.transformers_ if n == 'cat')
s = numeric.named_steps
features = bundle['features']
# `Model.gs` replica estas estadísticas, orden de columnas y coeficientes.
# Cambiar el formato aquí requiere ajustar en conjunto predictRisk_ y las pruebas.
data = {
    'schemaVersion': 1, 'version': 'risk-logistic-13-' + hashlib.sha256(artifact.read_bytes()).hexdigest()[:12],
    'sourceSha256': hashlib.sha256(artifact.read_bytes()).hexdigest(),
    'features': features, 'numeric': list(nums), 'categorical': list(cats),
    'categories': {c: [str(v) for v in vs] for c, vs in zip(cats, encoder.categories_)},
    'numericMean': s['scale'].mean_.tolist(), 'numericScale': s['scale'].scale_.tolist(),
    'powers': s['interactions'].powers_.tolist(),
    'rescaleMean': s['rescale'].mean_.tolist(), 'rescaleScale': s['rescale'].scale_.tolist(),
    'classes': classifier.classes_.tolist(), 'intercepts': classifier.intercept_.tolist(),
    'coefficients': classifier.coef_.tolist(),
    'observedRanges': {c: [float(df[c].min()), float(df[c].max())] for c in nums},
    'conditionalFields': bundle.get('campos_condicionados', []),
    'integerFields': ['Team_Size', 'Stakeholder_Count', 'External_Dependencies_Count',
                      'Estimated_Timeline_Months'],
    'proportionFields': [],
    'positiveFields': ['Project_Budget_USD', 'Estimated_Timeline_Months', 'Team_Size']
}
assert len(features) == 13 and len(nums) == 5 and len(cats) == 8
assert len(data['powers']) + sum(map(len, data['categories'].values())) == classifier.coef_.shape[1]
serialized = json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
(APP / 'ModelData.gs').write_text(
    '// Generado por scripts/export_apps_script_model.py. No editar los parámetros.\n'
    '// Contiene el contrato de variables y pesos usados por predictRisk_ en Model.gs.\n'
    'var RISK_MODEL_DATA_ = ' + serialized + ';\n', encoding='utf-8')

# Ejemplos sin metadatos de cliente para verificar el artefacto instalado en Google.
samples = df.groupby('Risk_Level', sort=True).head(1)[features]
pred = pipeline.predict(samples)
proba = pipeline.predict_proba(samples)
fixtures = [{'features': row, 'risk': str(risk), 'probabilities': dict(zip(data['classes'], probs.tolist()))}
            for row, risk, probs in zip(samples.to_dict('records'), pred, proba)]
smoke = '''/** Compara la inferencia instalada con ejemplos de referencia Python; sin efectos secundarios. */
function testInstalledModel() {
  var fixtures = FIXTURES;
  var maxError = 0;
  fixtures.forEach(function (sample) {
    var actual = predictRisk_(sample.features);
    if (actual.risk !== sample.risk) throw new Error('La clase no coincide con Python.');
    Object.keys(sample.probabilities).forEach(function (name) {
      var error = Math.abs(actual.probabilities[name] - sample.probabilities[name]);
      maxError = Math.max(maxError, error);
      if (error > 1e-10) throw new Error('La probabilidad no coincide con Python.');
    });
  });
  var result = {ok: true, examples: fixtures.length, maxProbabilityError: maxError,
                modelVersion: RISK_MODEL_DATA_.version};
  console.log(JSON.stringify(result));
  return result;
}
'''.replace('FIXTURES', json.dumps(fixtures, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
(APP / 'ModelSmokeTest.gs').write_text(smoke, encoding='utf-8')
test_dir = ROOT / 'onboarding-risk/tests/generated'
test_dir.mkdir(parents=True, exist_ok=True)
# La paridad masiva es un archivo efímero ignorado por Git: puede contener valores del histórico.
all_data = df[features]
(test_dir / 'python-predictions.json').write_text(json.dumps({
    'features': all_data.to_dict('records'), 'predictions': pipeline.predict(all_data).tolist(),
    'classes': data['classes'], 'probabilities': pipeline.predict_proba(all_data).tolist()
}, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
print('Exportado:', data['version'], '| campos:', len(features), '| filas para paridad:', len(all_data))
