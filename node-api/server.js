import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { predictRisk } from "./src/predict.js";

// REFERENCIA LEGADA: la aplicación vigente predice dentro de Apps Script.
// Este servidor Node queda fuera del despliegue y no es llamado por el formulario.
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3001);
const host=process.env.HOST||"127.0.0.1";
const apiKey=process.env.PREDICTION_API_KEY||"";
if(host==="0.0.0.0"&&!apiKey)throw new Error("PREDICTION_API_KEY is required when binding to a public interface.");
// Intenta cargar el JSON exportado para esta API anterior; si falta, health lo reporta.
async function loadModel(){const source=path.join(root,"model","risk-model.json");try{return JSON.parse(await readFile(source,"utf8"));}catch{return null;}}
const model=await loadModel();
// API HTTP mínima de prueba: health reporta estado, POST /predict valida y clasifica.
const server=createServer(async(req,res)=>{
 res.setHeader("Content-Type","application/json; charset=utf-8");
 if(req.method==="GET"&&req.url==="/health"){res.writeHead(200);return res.end(JSON.stringify({ok:true,modelLoaded:Boolean(model)}));}
 if(req.method!=="POST"||req.url!=="/predict"){res.writeHead(404);return res.end(JSON.stringify({error:"NOT_FOUND"}));}
 if(apiKey&&req.headers["x-api-key"]!==apiKey){res.writeHead(401);return res.end(JSON.stringify({error:"UNAUTHORIZED"}));}
 try{let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>100_000)throw Object.assign(new Error("Payload too large"),{status:413});}const body=JSON.parse(raw||"{}");const prediction=predictRisk(body.features,model);res.writeHead(200);res.end(JSON.stringify({ok:true,...prediction}));}
 catch(error){res.writeHead(error.status||422);res.end(JSON.stringify({error:error.status===413?"PAYLOAD_TOO_LARGE":"INVALID_REQUEST",message:error.message}));}
});
server.listen(port,host,()=>console.log("Prediction API listening on "+host+":"+port+" (model "+(model?"ready":"not configured")+")"));
