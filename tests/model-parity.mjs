import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {buildModelInput} from '../frontend/src/model-input.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({console});
for (const file of ['ModelData.gs', 'Model.gs', 'ModelSmokeTest.gs', 'Code.gs', 'Integrations.gs']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', file), 'utf8'), ctx, {filename:file});
}
const expected = JSON.parse(fs.readFileSync(path.join(root,'tests/generated/python-predictions.json'), 'utf8'));
let maxError = 0;
for (let i=0; i<expected.features.length; i++) {
  const actual = ctx.predictRisk_(expected.features[i]);
  assert.equal(actual.risk, expected.predictions[i], `Clase en fila ${i}`);
  for (let j=0; j<expected.classes.length; j++) {
    const error = Math.abs(actual.probabilities[expected.classes[j]] - expected.probabilities[i][j]);
    maxError = Math.max(maxError,error);
    assert.ok(error < 1e-10, `Probabilidad en fila ${i}, clase ${j}`);
  }
  assert.ok(Math.abs(Object.values(actual.probabilities).reduce((a,b)=>a+b,0)-1)<1e-12);
}
assert.equal(ctx.testInstalledModel().ok,true);
const good = expected.features[0];
for (const change of [
  {Team_Size:''}, {Team_Size:null}, {Team_Size:false}, {Team_Size:' '},
  {Team_Size:2.5}, {Team_Size:-1}, {Team_Size:Infinity},
  {Project_Budget_USD:0}, {Project_Type:'Unknown'},
  {Risk_Management_Maturity:'Unknown'}
]) assert.throws(()=>ctx.predictRisk_({...good,...change}));
assert.throws(()=>ctx.predictRisk_([]));
assert.ok(ctx.predictRisk_({...good,Project_Budget_USD:10}).inputWarnings.length);
ctx.predictRisk_({...good,External_Dependencies_Count:0,Stakeholder_Count:0});

// Verificar el catálogo REAL y el envío del frontend, no una copia del esquema.
const frontend = fs.readFileSync(path.join(root,'frontend/src/main.js'),'utf8');
const definition = frontend.slice(frontend.indexOf('const modelFields ='),frontend.indexOf('const contactFields='));
const fields = vm.runInNewContext(definition+';modelFields;');
const model = ctx.RISK_MODEL_DATA_;
assert.equal(model.features.length,13);
assert.equal(model.numeric.length,5);
assert.equal(model.categorical.length,8);
assert.ok(model.powers.some(row=>row.reduce((a,b)=>a+b,0)===2),'Conservar interacciones del modelo de 13 campos');
assert.equal(model.conditionalFields.length,0);
assert.deepEqual(Array.from(fields, f=>f.name).sort(), Array.from(model.features).sort());
for (const f of fields.filter(f=>f.type==='select')) {
  assert.deepEqual(Array.from(f.options).sort(), Array.from(model.categories[f.name]).sort(),f.name);
}
fields.forEach(f=>{f.value=good[f.name];});
const input = buildModelInput(fields);
assert.equal(Object.keys(input).length,13);
assert.equal(input.Project_Budget_USD,good.Project_Budget_USD);
ctx.predictRisk_(input);
assert.throws(()=>buildModelInput([{name:'Team_Size',label:'Equipo',type:'number',value:''}]));

// Flujo de servidor: predicción y registro sin APIs externas configuradas.
let fetchCalls=0;
let saved=[];
ctx.PropertiesService={getScriptProperties:()=>({getProperty:()=>null})};
ctx.UrlFetchApp={fetch:()=>{fetchCalls++;throw new Error('No debería llamarse');}};
ctx.Utilities={getUuid:()=> 'test-evaluation'};
ctx.appendEvaluation_=(id,date,payload,evaluation)=>saved.push({id,date,payload,evaluation});
ctx.updateEvaluation_=(id,evaluation)=>saved[saved.length-1].evaluation=evaluation;
const payload = {client:{name:'Prueba',project:'Prueba'},owner:'Responsable',modelInput:input};
const result = ctx.submitEvaluation(payload);
assert.equal(saved.length,1);
assert.equal(fetchCalls,0);
assert.equal(result.crm.status,'NOT_CONFIGURED');
assert.equal(typeof result.recommendation.text,'string');
assert.equal(result.risk,ctx.predictRisk_(input).risk);
assert.throws(()=>ctx.submitEvaluation({...payload,modelInput:{...input,Team_Size:''}}));
assert.equal(saved.length,1,'Una entrada inválida no debe guardarse como evaluación exitosa');

// Un fallo de n8n no borra la predicción ni genera texto anidado.
ctx.PropertiesService={getScriptProperties:()=>({getProperty:key=>key==='N8N_AGENT_URL'?'https://example.invalid':null})};
const fallback=ctx.submitEvaluation(payload);
assert.equal(fallback.recommendation.status,'FALLBACK');
assert.equal(typeof fallback.recommendation.text,'string');
assert.equal(fallback.risk,result.risk);

// Un error interno queda con metadatos suficientes para el histórico.
const originalPredict=ctx.predictRisk_;
ctx.predictRisk_=()=>{throw new Error('Error de prueba');};
assert.throws(()=>ctx.submitEvaluation(payload));
assert.equal(saved.at(-1).evaluation.status,'PREDICTION_ERROR');
assert.equal(saved.at(-1).evaluation.client,'Prueba');
assert.equal(saved.at(-1).evaluation.crm.status,'NOT_EXECUTED');
ctx.predictRisk_=originalPredict;

const report={ok:true,rows:expected.features.length,classMatches:expected.features.length,
              maxProbabilityError:maxError,modelVersion:model.version,
              checks:['paridad Python/JavaScript con interacciones','13 campos: cinco numéricos y ocho categóricos','categorías del formulario',
                'validación de entradas','flujo sin webhooks','respaldo n8n','error de predicción']};
fs.writeFileSync(path.join(root,'tests/parity-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
