import "./styles.css";
import { buildModelInput } from "./model-input.js";

// La interfaz es cliente de Apps Script; este módulo no contiene la inferencia real.
// En Vite, google.script.run no existe: evaluate() usa una salida fija de demostración.
const app = document.querySelector("#app");
// Estado mínimo que permite navegar entre pantallas sin recargar el navegador.
const state = { view:"home", step:0, query:"", risk:"", toast:"", selected:0, loading:false, historyLoaded:false, historySource:"demo" };
// Filas iniciales para modo local. En Apps Script se reemplazan por datos del Sheet.
const projects = [
 {id:"PR-0048",client:"Andina Logística",project:"Implementación inicial",risk:"High",date:"29 oct 2026",owner:"Laura Gómez",action:"Registrada"},
 {id:"PR-0047",client:"Norte Salud",project:"Gestión de personas",risk:"Critical",date:"29 oct 2026",owner:"Carlos Rojas",action:"Pendiente"},
 {id:"PR-0046",client:"Estudio Roble",project:"Onboarding corporativo",risk:"Low",date:"28 oct 2026",owner:"Laura Gómez",action:"Registrada"},
 {id:"PR-0045",client:"Grupo Horizonte",project:"Implementación regional",risk:"Medium",date:"28 oct 2026",owner:"Erika Monroy",action:"Registrada"}
];
const riskNames = {Low:"Bajo · Low",Medium:"Medio · Medium",High:"Alto · High",Critical:"Crítico · Critical"};
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const btn = (label, action, primary=false) => '<button class="btn '+(primary?"btn-primary":"")+'" data-action="'+action+'" type="button">'+label+'</button>';
const riskBadge = risk => riskNames[risk] ? '<span class="badge risk-'+risk.toLowerCase()+'">'+riskNames[risk]+'</span>' : '<span class="badge">Evaluación pendiente</span>';

// Contrato visual de las 13 variables del modelo: nombre técnico, etiqueta,
// tipo de control, categorías internas en inglés y paso del formulario.
const modelFields = [
 ["Project_Type","Tipo de proyecto","select",["IT","Construction","Healthcare","Manufacturing","Marketing","R&D"],"IT"],
 ["Project_Budget_USD","Presupuesto inicial · USD","number",null,45000],
 ["Estimated_Timeline_Months","Duración estimada · meses","number",null,6],
 ["Team_Size","Tamaño del equipo","number",null,8],
 ["Stakeholder_Count","Stakeholders clave","number",null,5],
 ["External_Dependencies_Count","Dependencias externas","number",null,4],
 ["Team_Experience_Level","Experiencia del equipo","select",["Junior","Senior","Expert","Mixed"],"Mixed"],
 ["Technology_Familiarity","Familiaridad con tecnología","select",["New","Familiar","Expert"],"Familiar"],
 ["Requirement_Stability","Estabilidad de requerimientos","select",["Stable","Moderate","Volatile"],"Moderate"],
 ["Executive_Sponsorship","Respaldo ejecutivo","select",["Weak","Moderate","Strong"],"Strong"],
 ["Key_Stakeholder_Availability","Disponibilidad de stakeholders","select",["Poor","Limited","Moderate","Good","Excellent"],"Limited"],
 ["Org_Process_Maturity","Madurez de procesos","select",["Ad-hoc","Defined","Managed","Optimizing"],"Defined"],
 ["Risk_Management_Maturity","Madurez de gestión de riesgos","select",["None","Basic","Formal","Advanced"],"Basic"]
].map(([name,label,type,options,value],index)=>({name,label,type,options,value,step:index===0?0:index<=5?1:index<=7?2:3,group:"model"}));
const contactFields=[
 {name:"clientName",label:"Empresa / cliente",type:"text",value:"Andina Logística",step:0,group:"meta"},
 {name:"projectName",label:"Nombre del proyecto",type:"text",value:"Implementación inicial",step:0,group:"meta"},
 {name:"contactName",label:"Nombre del contacto",type:"text",value:"Mariana Torres",step:0,group:"meta"},
 {name:"contactEmail",label:"Correo del contacto",type:"email",value:"mariana@example.com",step:0,group:"meta"},
 {name:"owner",label:"Responsable de Onboarding",type:"select",options:["Laura Gómez","Carlos Rojas","Erika Monroy"],value:"Laura Gómez",step:0,group:"meta"}
];
// Traducciones de presentación. No cambiar las claves: son los valores que recibe el modelo.
const optionLabels = {
 IT:"Tecnología de la información", Construction:"Construcción", Healthcare:"Salud", Manufacturing:"Manufactura", Marketing:"Mercadeo", "R&D":"Investigación y desarrollo",
 Junior:"Júnior", Senior:"Sénior", Expert:"Experto", Mixed:"Mixta", New:"Nueva para el equipo", Familiar:"Conocida por el equipo",
 Stable:"Estables", Moderate:"Moderada", Volatile:"Cambiantes", Weak:"Débil", Strong:"Fuerte",
 Poor:"Escasa", Limited:"Limitada", Good:"Buena", Excellent:"Excelente",
 "Ad-hoc":"Ad hoc / informal", Defined:"Definidos", Managed:"Gestionados", Optimizing:"En mejora continua",
 None:"Sin gestión de riesgos", Basic:"Básica", Formal:"Formal", Advanced:"Avanzada"
};
// Preguntas y ayuda en español para orientar a la persona que diligencia el intake.
const fieldCopy = {
 Project_Type:["¿Cuál es el tipo principal de proyecto?","Selecciona la categoría que mejor describe el proyecto."],
 Project_Budget_USD:["¿Cuál es el presupuesto inicial estimado en USD?","Ingresa el monto total en dólares estadounidenses, mayor que cero."],
 Estimated_Timeline_Months:["¿Cuántos meses se estima que durará el proyecto?","Ingresa la duración prevista en meses completos, mayor que cero."],
 Team_Size:["¿Cuántas personas integrarán el equipo del proyecto?","Cuenta personas, no áreas. Usa el mismo criterio para todos los proyectos."],
 Stakeholder_Count:["¿Cuántas personas clave estarán involucradas?","Cuenta las personas interesadas clave para decidir o coordinar el proyecto. Usa un criterio consistente."],
 External_Dependencies_Count:["¿Cuántas dependencias externas tiene el proyecto?","Cuenta entregas o aprobaciones necesarias de terceros o equipos externos. Ingresa 0 si no existen."],
 Team_Experience_Level:["¿Cuál describe mejor la experiencia del equipo?","Mixta indica distintos niveles de experiencia. Acuerda con el equipo cómo distinguir júnior, sénior y experto."],
 Technology_Familiarity:["¿Qué familiaridad tiene el equipo con la tecnología del proyecto?","Considera la tecnología principal que utilizará el equipo al inicio."],
 Requirement_Stability:["¿Qué tan estables son los requerimientos al inicio?","Considera si el alcance está acordado o se esperan cambios. Moderada indica estabilidad intermedia."],
 Executive_Sponsorship:["¿Qué nivel de respaldo ejecutivo tiene el proyecto?","Considera el apoyo de la dirección para tomar decisiones y facilitar recursos."],
 Key_Stakeholder_Availability:["¿Qué disponibilidad tienen las personas clave?","Considera su disponibilidad prevista para reuniones, decisiones y aprobaciones."],
 Org_Process_Maturity:["¿Cuál es la madurez de los procesos de la organización?","Considera los procesos relacionados con el proyecto: informales, definidos, gestionados o en mejora continua."],
 Risk_Management_Maturity:["¿Cuál es la madurez de la gestión de riesgos?","Considera cómo se identifican y gestionan los riesgos. Sin gestión de riesgos no significa que desconozcas la respuesta."]
};
modelFields.forEach(f=>{[f.label,f.help]=fieldCopy[f.name]; f.value="";});
contactFields.forEach(f=>{f.value="";});
const displayValue = f => f.type === "select" ? (optionLabels[f.value] || f.value) : f.value;
const fields=[...contactFields,...modelFields];

/** Construye la navegación lateral y marca la vista seleccionada. */
function nav(){return '<aside class="sidebar"><div class="brand">buk<small>ONBOARDING</small></div><nav class="nav" aria-label="Navegación"><button data-view="home" aria-current="'+(state.view==="home"?"page":"false")+'">⌂ Inicio</button><button data-view="form" aria-current="'+(["form","review","result","loading"].includes(state.view)?"page":"false")+'">＋ Nuevo proyecto</button><button data-view="history" aria-current="'+(state.view==="history"?"page":"false")+'">◷ Histórico</button></nav><div class="workspace">Espacio de trabajo<br><strong>Operaciones · Colombia</strong></div></aside>';}
/** Envuelve cada vista con navegación, encabezado, avisos y estado demo/Sheets. */
function wrap(content){return '<div class="shell">'+nav()+'<div class="main"><header class="topbar"><div class="topbar-meta">Operaciones / '+({home:"Inicio",history:"Histórico",result:"Resultado",loading:"Evaluación",form:"Nueva evaluación",review:"Confirmación"}[state.view])+'</div><div class="topbar-meta">Equipo de Onboarding <span class="avatar">EM</span></div></header><main class="content">'+(state.toast?'<div class="toast '+(state.toastKind==="error"?"toast-error":"")+'" role="'+(state.toastKind==="error"?"alert":"status")+'">'+esc(state.toast)+'</div>':"")+content+'<p class="muted" style="margin-top:24px;font-size:12px">'+(state.historySource==="sheets"?"Conectado a Apps Script y Google Sheets":"Modo demostración · No guarda datos ni ejecuta workflows")+'</p></main></div></div>';}
/** Dibuja las filas del histórico; los valores de usuario pasan por esc(). */
function table(rows,compact=false){return '<div class="tablewrap"><table><thead><tr><th>Cliente / proyecto</th><th>Riesgo estimado</th>'+(compact?"":"<th>Fecha</th>")+'<th>Acción CRM</th><th></th></tr></thead><tbody>'+(rows.length?rows.map(r=>'<tr><td><strong>'+esc(r.client)+'</strong><small>'+esc(r.project)+' · '+r.id+'</small></td><td>'+riskBadge(r.risk)+'</td>'+(compact?"":'<td>'+r.date+'</td>')+'<td><span class="badge '+(r.action==="Registrada"?"status-done":"risk-high")+'">'+r.action+'</span></td><td><button class="btn btn-quiet" data-record="'+r.id+'">Ver →</button></td></tr>').join(""):'<tr><td class="empty" colspan="5">No encontramos proyectos con esos filtros.</td></tr>')+'</tbody></table></div>';}
/** Vista inicial con resumen y evaluaciones recientes disponibles en memoria. */
function home(){let pending=projects.filter(p=>p.action==="Pendiente").length;return '<div class="eyebrow">Centro de operaciones</div><div class="pagehead"><div><h1>Tu espacio de Onboarding</h1><p class="muted">Evalúa proyectos nuevos y da seguimiento a su atención.</p></div>'+btn("＋ Nuevo proyecto","new",true)+'</div><div class="stats"><section class="stat"><div class="stat-label">Proyectos evaluados</div><div class="stat-value">'+projects.length+'</div><div class="muted">En el histórico disponible</div></section><section class="stat"><div class="stat-label">Riesgo alto o crítico</div><div class="stat-value">'+projects.filter(p=>["High","Critical"].includes(p.risk)).length+'</div><div class="muted">Con atención prioritaria</div></section><section class="stat"><div class="stat-label">Acciones registradas</div><div class="stat-value">'+projects.filter(p=>p.action==="Registrada").length+' / '+projects.length+'</div><div class="muted">Con registro confirmado</div></section></div>'+(pending?'<aside class="pending"><div><strong>'+pending+' acción pendiente de registro</strong><div>Consulta su estado y vuelve a intentar cuando sea necesario.</div></div>'+btn("Revisar pendientes →","pending")+'</aside>':"")+'<div class="pagehead"><h2>Evaluaciones recientes</h2><button class="btn btn-quiet" data-view="history">Ver histórico →</button></div>'+table(projects.slice(0,3),true);}
const steps=["Cliente y proyecto","Alcance","Equipo","Gobernanza"];
/** Alinea min/step del navegador con conteos enteros y montos/meses positivos. */
function numericAttributes(name){
 const integers=["Estimated_Timeline_Months","Team_Size","Stakeholder_Count","External_Dependencies_Count"];
 const positive=["Project_Budget_USD","Estimated_Timeline_Months","Team_Size"];
 const min=positive.includes(name)?(integers.includes(name)?1:0.01):0;
 return 'min="'+min+'" step="'+(integers.includes(name)?1:"any")+'"';
}
const inputExamples = {
 clientName:"Ej. Empresa Andina", projectName:"Ej. Implementación de gestión de personas",
 contactName:"Ej. María Pérez", contactEmail:"Ej. contacto@empresa.com",
 Project_Budget_USD:"Ej. 500000", Estimated_Timeline_Months:"Ej. 6",
 Team_Size:"Ej. 8", Stakeholder_Count:"Ej. 5", External_Dependencies_Count:"Ej. 0"
};
/** Renderiza un control requerido, su etiqueta, traducción, ejemplo y error accesible. */
function field(f){
 const attrs=' placeholder="'+esc(inputExamples[f.name]||"")+'" required aria-describedby="help-'+f.name+' error-'+f.name+'"';
 const input=f.type==="select"?'<select id="field-'+f.name+'" name="'+f.name+'"'+attrs+'><option value="">Selecciona una opción</option>'+f.options.map(o=>'<option value="'+esc(o)+'" '+(o===f.value?"selected":"")+'>'+esc(optionLabels[o]||o)+'</option>').join("")+'</select>':'<input id="field-'+f.name+'" name="'+f.name+'" type="'+f.type+'" value="'+esc(f.value)+'" '+(f.type==="number"?numericAttributes(f.name):"")+attrs+'>';
 return '<label class="field" for="field-'+f.name+'">'+esc(f.label)+input+'<span class="field-help" id="help-'+f.name+'">'+esc(f.help||"")+'</span><span class="field-error" id="error-'+f.name+'" aria-live="polite"></span></label>';
}
/** Muestra solamente los campos del paso actual del formulario de cuatro pasos. */
function form(){let current=fields.filter(f=>f.step===state.step);return '<div class="eyebrow">Nueva evaluación</div><div class="pagehead"><div><h1>Conozcamos el proyecto</h1><p class="muted">Captura la información disponible al ingreso.</p></div><span class="badge risk-medium">Paso '+(state.step+1)+' de 4</span></div><div class="steps">'+steps.map((s,i)=>'<button class="step '+(i===state.step?"active":"")+'" data-step="'+i+'"><span class="step-index">'+String(i+1).padStart(2,"0")+'</span>'+s+'</button>').join("")+'</div><form id="project-form" class="panel" novalidate><h2>'+steps[state.step]+'</h2><p class="muted">'+["Datos para identificar el proyecto y asignar responsable.","Dimensión inicial y antecedentes disponibles al ingreso.","Capacidades y experiencia del equipo.","Condiciones de gestión y coordinación del proyecto."][state.step]+'</p><div class="formgrid">'+current.map(field).join("")+(state.step===3?'<div class="callout field wide">Selecciona las condiciones conocidas al ingreso del proyecto.</div>':"")+'</div><div class="formactions"><button class="btn btn-quiet" type="button" data-action="draft">Guardar borrador</button><div class="actiongroup">'+(state.step?'<button class="btn" type="button" data-action="prev">Anterior</button>':"")+'<button class="btn btn-primary" type="submit">'+(state.step===3?"Revisar evaluación":"Continuar →")+'</button></div></div></form>';}
/** Resume los datos y solicita confirmación antes de enviar al servidor. */
function review(){let items=fields.map(f=>'<div class="review-item"><small>'+esc(f.label)+'</small>'+esc(displayValue(f))+'</div>').join("");return '<div class="eyebrow">Antes de evaluar</div><h1>Revisa y confirma</h1><p class="muted">'+esc(fields[0].value)+' · '+esc(fields[1].value)+'</p><section class="panel"><h2>Resumen del proyecto</h2><div class="reviewgrid">'+items+'</div><div class="callout" style="margin-top:18px">La evaluación calcula el riesgo en Apps Script y registra la ruta de atención. Las conexiones de n8n son opcionales.</div><div class="formactions"><button class="btn" data-action="edit">Volver y editar</button><button class="btn btn-primary" data-action="evaluate">Confirmar y evaluar →</button></div></section>';}
function history(){let rows=projects.filter(p=>(!state.risk||p.risk===state.risk)&&[p.client,p.project,p.id].join(" ").toLowerCase().includes(state.query.toLowerCase()));return '<div class="pagehead"><div><div class="eyebrow">Consulta y seguimiento</div><h1>Histórico de proyectos</h1><p class="muted">Busca evaluaciones y consulta el estado de sus acciones.</p></div>'+btn("＋ Nuevo proyecto","new",true)+'</div><div class="toolbar"><label class="field">Buscar cliente, proyecto o ID<input id="search" class="search" type="search" placeholder="Ej. Andina Logística" value="'+esc(state.query)+'"></label><label class="field">Riesgo estimado<select id="risk"><option value="">Todos los niveles</option>'+Object.entries(riskNames).map(([k,v])=>'<option value="'+k+'" '+(state.risk===k?"selected":"")+'>'+v+'</option>').join("")+'</select></label></div><div id="history-results">'+(state.historyLoading?'<p class="empty" role="status">Cargando evaluaciones…</p>':table(rows))+'</div><p class="muted">'+rows.length+' evaluaciones · '+(state.historySource==="sheets"?"Histórico conectado a Google Sheets":"Datos de demostración")+'</p>';}
/** Presenta la respuesta del servidor, probabilidades, agente y estado de CRM. */
function result(){let p=state.selected||projects[0],route=p.route||{Low:"Onboarding estándar",Medium:"Revisión preventiva",High:"Atención personalizada prioritaria",Critical:"Escalamiento al responsable"}[p.risk],interpretation=p.recommendation?.text||p.recommendation?.interpretation||"La evaluación sugiere revisar dependencias, responsables y seguimiento antes del inicio. Esta lectura es orientación para el equipo, no sustituye la validación humana.";let crmStatus=p.crm?.status||p.action||"Pendiente",crmAction=p.crm?.action?.action||"Acción definida por la política del prototipo",probabilities=p.probabilities||{},recordId=String(p.crm?.recordId||""),ticketUrl=/^\d+$/.test(recordId)?"https://app-na2.hubspot.com/contacts/247844082/record/0-5/"+recordId:"",ticketLink=(crmStatus==="SUCCESS"||crmStatus==="COMPLETED")&&ticketUrl?'<p><a class="btn btn-primary crm-ticket-link" href="'+esc(ticketUrl)+'" target="_blank" rel="noopener noreferrer">Consultar ticket</a></p>':"";return '<div class="eyebrow">Evaluación '+esc(p.evaluationId||p.id)+'</div><div class="pagehead"><div><h1>'+esc(p.client)+'</h1><p class="muted">'+esc(p.project)+' · '+esc(p.date||"—")+'</p></div>'+riskBadge(p.risk)+'</div>'+(p.demo?'<div class="callout" role="status">Vista demostrativa: la clasificación y la ruta no provienen del modelo; esta evaluación no se guardó.</div>':"")+'<div class="resultgrid"><div><section class="panel riskbox"><div class="eyebrow">Riesgo estimado</div><div class="riskname">'+(riskNames[p.risk]||"Por revisar")+'</div><h3>'+esc(route)+'</h3>'+(p.inputWarnings?.length?'<div class="callout" role="status"><strong>Revisa los datos ingresados</strong><ul>'+p.inputWarnings.map(w=>'<li>'+esc(w)+'</li>').join("")+'</ul></div>':"")+'<p class="muted">Estimación de apoyo a la decisión. Revisa los datos y confirma la ruta antes de actuar.</p>'+(Object.keys(probabilities).length?'<div class="probabilities"><strong>Probabilidades estimadas</strong>'+Object.entries(probabilities).map(([name,value])=>'<div class="probability"><span>'+esc(riskNames[name]||name)+'</span><span>'+Math.round(value*100)+'%</span></div>').join("")+'</div>':"")+'</section><section class="panel" style="margin-top:17px"><h2>Lectura del proyecto</h2><p>'+esc(interpretation)+'</p><p class="muted">Interpretación generada por el agente n8n o texto de respaldo.</p></section></div><div><section class="panel"><div class="pagehead"><h2>Acción en CRM</h2><span class="badge '+(crmStatus==="SUCCESS"||crmStatus==="COMPLETED"||crmStatus==="Registrada"?"status-done":"risk-high")+'">'+esc(crmStatus)+'</span></div><h3>'+esc(crmAction)+'</h3><p class="muted">Responsable: '+esc(p.owner||"Sin asignar")+'<br>Ruta: '+esc(route)+'</p>'+ticketLink+'<div class="callout">El workflow de CRM recibe la evaluación y ejecuta la acción correspondiente a la política de riesgo.</div></section><section class="panel" style="margin-top:17px"><h2>Trazabilidad</h2><p class="muted">Versión del modelo: '+esc(p.modelVersion||"demo")+'</p><p class="muted">ID: '+esc(p.evaluationId||p.id)+'</p><p class="muted">Evaluación: '+esc(p.date||"—")+'</p></section></div></div><div class="formactions">'+btn("Histórico","history")+btn("Nuevo proyecto","new",true)+'</div>';}
/** Vista de espera mientras Apps Script calcula y completa integraciones. */
function loading(){return '<section class="panel" aria-busy="true"><div class="eyebrow">Evaluación en curso</div><h1>Estamos preparando el resultado</h1><p class="muted">'+esc(fields[0].value)+' · '+esc(fields[1].value)+'</p><div class="busylist" role="status" aria-live="polite">'+["Predicción de riesgo","Interpretación del agente","Acción en CRM"].map((x,i)=>'<div class="busyrow '+(i===0?"active":"")+'"><span class="state-icon">'+(i===0?"◌":"·")+'</span>'+x+'<span class="muted" style="margin-left:auto">'+(i===0?"En curso":"En espera")+'</span></div>').join("")+'</div></section>';}
/** Selecciona la vista desde state.view y actualiza el contenedor principal. */
function render(){let body=({home,form,review,result,history,loading}[state.view])();app.innerHTML=wrap(body);}
/** Copia valores visibles a los objetos de campo antes de cambiar de paso. */
function capture(){document.querySelectorAll("#project-form [name]").forEach(el=>{let f=fields.find(x=>x.name===el.name);if(f)f.value=el.value;});}
/** Validación de experiencia de usuario; Apps Script vuelve a validar en servidor. */
function valid(formEl){let failed=[...formEl.querySelectorAll("[required]")].filter(el=>!el.checkValidity());failed.forEach(el=>{let target=document.querySelector("#error-"+CSS.escape(el.name));if(target)target.textContent=el.validity.typeMismatch?"Ingresa un correo válido.":"Completa este campo correctamente.";});if(failed.length){failed[0].focus();return false;}return true;}
/** Puente asíncrono front-end → funciones públicas de Apps Script. Aquí no se predice. */
function gasRequest(method,payload){return new Promise((resolve,reject)=>{if(!window.google||!google.script||!google.script.run)return reject(new Error("Abre la aplicación desplegada en Google Apps Script para usar el servidor."));const runner=google.script.run.withSuccessHandler(resolve).withFailureHandler(error=>reject(new Error(error.message||"No se completó la operación.")));if(method==="submitEvaluation")runner.submitEvaluation(payload);else if(method==="listEvaluations")runner.listEvaluations(payload);else reject(new Error("Operación no disponible."));});}
/** Adapta el contrato de evaluación del servidor a la fila de UI. */
function historyRow(e){const crmStatus=e.crm?.status||"PENDING",date=e.createdAt?new Date(e.createdAt).toLocaleDateString("es-CO",{day:"2-digit",month:"short",year:"numeric"}):"—",id=e.evaluationId||e.id;return {id,client:e.client||"Cliente",project:e.project||"Proyecto",risk:e.risk||"",date,owner:e.owner||"Sin asignar",action:crmStatus==="SUCCESS"||crmStatus==="COMPLETED"?"Registrada":"Pendiente",detail:{...e,id,date}};}
/** Solicita el histórico real y vuelve a renderizar; en error mantiene el modo demo. */
async function loadHistory(){if(state.historyLoading)return;state.historyLoading=true;render();try{const records=await gasRequest("listEvaluations","");if(Array.isArray(records)){projects.splice(0,projects.length,...records.map(historyRow));state.historySource="sheets";state.toast="";}}catch(e){state.historySource="demo";state.toastKind="error";state.toast="El histórico conectado no está disponible. Se muestran datos de ejemplo.";}finally{state.historyLoaded=true;state.historyLoading=false;if(["home","history"].includes(state.view))render();}}
/** Prepara las 13 variables y llama submitEvaluation; la predicción real ocurre en GAS. */
async function evaluate(){capture();state.view="loading";state.loading=true;state.toast="";state.toastKind="";render();let modelInput;try{modelInput=buildModelInput(modelFields);}catch(error){state.view="review";state.loading=false;state.toast=error.message;state.toastKind="error";render();return;}if(!window.google||!google.script||!google.script.run){await new Promise(resolve=>setTimeout(resolve,450));const now=new Date(),demo={evaluationId:"DEMO-"+String(Date.now()).slice(-6),client:fields[0].value,project:fields[1].value,owner:fields[4].value,risk:"High",route:"Atención personalizada prioritaria",recommendation:{text:"La vista local simula el recorrido para revisar la interfaz. Con Apps Script conectado, esta lectura vendrá del workflow del agente."},crm:{status:"DEMO",action:{action:"Crear tarea prioritaria"}},modelVersion:"demo",createdAt:now.toISOString(),date:now.toLocaleDateString("es-CO",{day:"2-digit",month:"short",year:"numeric"}),demo:true};state.selected=demo;projects.unshift(historyRow(demo));state.view="result";state.historySource="demo";state.historyLoaded=true;state.loading=false;render();return;}try{const payload=await gasRequest("submitEvaluation",{client:{name:fields[0].value,project:fields[1].value,contactName:fields[2].value,contactEmail:fields[3].value},owner:fields[4].value,modelInput});const row=historyRow(payload);projects.unshift(row);state.selected=row.detail;state.view="result";state.historyLoaded=true;state.historySource="sheets";}catch(e){state.view="review";state.toast=e.message;state.toastKind="error";}finally{state.loading=false;render();}}
// Delegación de clics: cambia vistas, pasos, registros seleccionados y acciones.
app.addEventListener("click",async e=>{let b=e.target.closest("button");if(!b||state.loading)return;if(b.dataset.view){state.view=b.dataset.view;render();if(state.view==="history"&&!state.historyLoaded)loadHistory();return;}if(b.dataset.step!==undefined){capture();if(+b.dataset.step>state.step){for(let i=0;i<+b.dataset.step;i++){state.step=i;render();if(!valid(document.querySelector("#project-form")))return;}}state.step=+b.dataset.step;render();return;}if(b.dataset.record){const row=projects.find(p=>p.id===b.dataset.record);state.selected=row?.detail||row;state.view="result";render();return;}let a=b.dataset.action;if(a==="new"){state.step=0;state.view="form";state.toast="";render();}else if(a==="history"){state.view="history";state.risk="";state.historyLoaded=false;render();loadHistory();}else if(a==="pending"){state.view="history";state.risk="Critical";state.historyLoaded=false;render();loadHistory();}else if(a==="prev"){capture();state.step--;render();}else if(a==="draft"){capture();state.toast="Borrador conservado durante esta sesión.";state.toastKind="";render();}else if(a==="edit"){state.view="form";state.step=0;render();}else if(a==="evaluate")await evaluate();});
// Controla validación y avance del formulario; el último paso abre la pantalla de revisión.
app.addEventListener("submit",e=>{if(e.target.id!=="project-form")return;e.preventDefault();capture();if(!valid(e.target))return;if(state.step<3){state.step++;render();}else{for(let i=0;i<4;i++){state.step=i;render();if(!valid(document.querySelector("#project-form")))return;}state.view="review";render();}});
// Filtra filas visibles mientras la persona escribe en el buscador del histórico.
app.addEventListener("input",e=>{if(e.target.id==="search"){state.query=e.target.value;let result=document.querySelector("#history-results");if(result){let rows=projects.filter(p=>(!state.risk||p.risk===state.risk)&&[p.client,p.project,p.id].join(" ").toLowerCase().includes(state.query.toLowerCase()));result.innerHTML=table(rows);}}});
// Aplica el filtro por nivel de riesgo seleccionado.
app.addEventListener("change",e=>{if(e.target.id==="risk"){state.risk=e.target.value;render();}});
// Muestra errores junto al campo cuando se pierde foco.
app.addEventListener("focusout",e=>{let f=e.target;if(!f.matches("#project-form [required]"))return;let target=document.querySelector("#error-"+CSS.escape(f.name));if(target)target.textContent=f.checkValidity()?"":f.validity.typeMismatch?"Ingresa un correo válido.":"Completa este campo correctamente.";});
render();
loadHistory();
