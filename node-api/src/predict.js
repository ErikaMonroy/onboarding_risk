/**
 * Inferencia de referencia para la antigua API Node (no utilizada por Apps Script).
 * Valida campos, normaliza numéricos, codifica categorías y calcula softmax.
 */
export function predictRisk(features,model){
 if(!model)throw new Error("MODEL_NOT_CONFIGURED: export model_candidate.joblib first.");
 if(!features||typeof features!=="object"||Array.isArray(features))throw new Error("features must be an object.");
 const missing=model.numeric.filter(k=>features[k]===undefined||features[k]===null||features[k]==="").concat(model.categorical.filter(k=>features[k]===undefined||features[k]===null||features[k]===""));
 if(missing.length)throw new Error("Missing required model fields: "+missing.join(", "));
 const input=[];
 for(let i=0;i<model.numeric.length;i++){
  const key=model.numeric[i],value=Number(features[key]);
  if(!Number.isFinite(value))throw new Error(key+" must be numeric.");
  const imputed=value,scaled=(imputed-model.numericMean[i])/model.numericScale[i];
  input.push((scaled-model.numericRescaleMean[i])/model.numericRescaleScale[i]);
 }
 for(const key of model.categorical){const selected=String(features[key]),categories=model.categories[key];for(const category of categories)input.push(category===selected?1:0);}
 const logits=model.classes.map((_,c)=>model.intercepts[c]+model.coefficients[c].reduce((sum,coefficient,i)=>sum+coefficient*input[i],0));
 const max=Math.max(...logits),exp=logits.map(x=>Math.exp(x-max)),total=exp.reduce((a,b)=>a+b,0);
 const probabilities=Object.fromEntries(model.classes.map((name,i)=>[name,exp[i]/total]));
 const risk=model.classes[exp.indexOf(Math.max(...exp))];
 return {risk,probabilities,modelVersion:model.version};
}
