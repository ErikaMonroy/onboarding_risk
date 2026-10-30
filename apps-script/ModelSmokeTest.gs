/**
 * Verifica que el modelo exportado esté instalado y replique cuatro ejemplos de Python.
 * No escribe en Google Sheets ni invoca los webhooks de agente/CRM.
 * Ejecutar manualmente desde el editor Apps Script para comprobar paridad tras sincronizar.
 */
function testInstalledModel() {
  var fixtures = [{"features":{"Project_Budget_USD":1526276.55,"Estimated_Timeline_Months":32,"Team_Size":32,"Stakeholder_Count":16,"External_Dependencies_Count":3,"Project_Type":"Construction","Team_Experience_Level":"Senior","Technology_Familiarity":"Expert","Requirement_Stability":"Moderate","Executive_Sponsorship":"Moderate","Key_Stakeholder_Availability":"Limited","Org_Process_Maturity":"Managed","Risk_Management_Maturity":"Basic"},"risk":"Critical","probabilities":{"Critical":0.5082844007362287,"High":0.25937662926845495,"Low":0.04841609708636399,"Medium":0.18392287290895218}},{"features":{"Project_Budget_USD":390790.15,"Estimated_Timeline_Months":9,"Team_Size":2,"Stakeholder_Count":9,"External_Dependencies_Count":2,"Project_Type":"Manufacturing","Team_Experience_Level":"Mixed","Technology_Familiarity":"Familiar","Requirement_Stability":"Moderate","Executive_Sponsorship":"Weak","Key_Stakeholder_Availability":"Excellent","Org_Process_Maturity":"Optimizing","Risk_Management_Maturity":"Formal"},"risk":"Low","probabilities":{"Critical":0.005649822732563259,"High":0.04217091093089904,"Low":0.49461389427420344,"Medium":0.4575653720623343}},{"features":{"Project_Budget_USD":246674.76,"Estimated_Timeline_Months":6,"Team_Size":2,"Stakeholder_Count":7,"External_Dependencies_Count":0,"Project_Type":"Manufacturing","Team_Experience_Level":"Mixed","Technology_Familiarity":"Familiar","Requirement_Stability":"Stable","Executive_Sponsorship":"Strong","Key_Stakeholder_Availability":"Moderate","Org_Process_Maturity":"Ad-hoc","Risk_Management_Maturity":"None"},"risk":"Medium","probabilities":{"Critical":0.06587614487032317,"High":0.44493910558164024,"Low":0.03732120920491609,"Medium":0.4518635403431204}},{"features":{"Project_Budget_USD":1122048.59,"Estimated_Timeline_Months":21,"Team_Size":12,"Stakeholder_Count":11,"External_Dependencies_Count":5,"Project_Type":"R&D","Team_Experience_Level":"Senior","Technology_Familiarity":"Familiar","Requirement_Stability":"Moderate","Executive_Sponsorship":"Moderate","Key_Stakeholder_Availability":"Limited","Org_Process_Maturity":"Defined","Risk_Management_Maturity":"None"},"risk":"High","probabilities":{"Critical":0.4078375688743402,"High":0.4454745510374297,"Low":0.002974391743737329,"Medium":0.14371348834449263}}];
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
