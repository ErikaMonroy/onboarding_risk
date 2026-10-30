# Guía del código para presentarlo

Este recorrido explica qué invoca cada capa y dónde ocurre cada operación. La regla de oro: el front-end presenta y captura; la predicción real se ejecuta en Apps Script; n8n interpreta y opera integraciones externas cuando está configurado.

## Recorrido de punta a punta

```text
Index.html → Client.html → google.script.run.submitEvaluation
  → Code.gs: submitEvaluation
    → Model.gs: validateModelInput_ → predictRisk_
    → Code.gs: routeForRisk_ y fallbackInterpretation_
    → Repository.gs: appendEvaluation_
    → Integrations.gs: interpretWithN8n_ → agente n8n
    → Integrations.gs: executeCrmWithN8n_ → CRM n8n / HubSpot
    → Repository.gs: updateEvaluation_
  ← objeto evaluation → Client.html muestra resultado
```

El historial sigue otra ruta: `Client.html → google.script.run.listEvaluations → Code.gs:listEvaluations → Repository.gs:getHistorySheet_ → Sheets`.

## Back-end: Google Apps Script

### `apps-script/Code.gs`

- `doGet()`: entrada HTTP de la web app. Renderiza `Index.html`, fija título y viewport.
- `include(filename)`: helper de HTML Service para insertar CSS y JavaScript embebidos como parciales. No calcula riesgo.
- `submitEvaluation(payload)`: orquestador de una nueva evaluación. Valida metadatos, normaliza las 13 variables, genera ID y fecha; llama a `predictRisk_`; define ruta; persiste; intenta agente y CRM; actualiza la fila con la respuesta; devuelve el objeto a la pantalla. Si falla la predicción, guarda el error de trazabilidad antes de mostrarlo.
- `listEvaluations(query)`: lee la hoja, filtra por términos básicos sobre ID/cliente/proyecto/responsable y transforma la columna JSON de vuelta a objetos para el front-end.
- `validateEvaluationPayload_(payload)`: verifica envoltura, cliente/proyecto y existencia del objeto predictivo. La validación detallada de los campos la hace `validateModelInput_`.
- `routeForRisk_(risk)`: tabla explícita que mapea `Low`, `Medium`, `High`, `Critical` a nombre de ruta, acción y prioridad. Es una regla de negocio configurable, no una regla aprendida por la logística.
- `fallbackInterpretation_(risk)`: respuesta sencilla cuando el webhook de IA no está configurado o no responde correctamente.

### `apps-script/Model.gs`

- `validateModelInput_(features)`: confirma que lleguen todas las variables esperadas, convierta campos numéricos, rechace valores inválidos/negativos/no enteros según el campo y asegure que cada categoría pertenezca al vocabulario del modelo. Esto evita que opciones nuevas de UI produzcan una codificación no reconocida.
- `predictRisk_(features)`: punto exacto de predicción. Estandariza las cinco variables numéricas con las medias/escalas aprendidas, genera las interacciones polinómicas configuradas, escala esos términos, representa las ocho variables categóricas con indicadores one-hot, calcula un logit por nivel, calcula softmax y devuelve clase/probabilidades/versión/alertas por extrapolación numérica. No hace HTTP ni consulta n8n.

El orden `numeric`, `powers`, `categorical`, categorías, coeficientes e interceptos debe ser el mismo que exportó Python. `ModelData.gs` no es un segundo modelo: contiene parámetros serializados para reproducir en V8 la regresión ya entrenada.

### `apps-script/Repository.gs`

- `getHistorySheet_()`: obtiene `SPREADSHEET_ID` de Script Properties, abre el spreadsheet y exige una pestaña `Evaluaciones`.
- `appendEvaluation_(...)`: agrega una fila inicial con ID, fecha, empresa/proyecto/responsable, riesgo/versión/ruta, estado CRM, JSON de salida y JSON de variables de modelo.
- `updateEvaluation_(id, evaluation)`: localiza de abajo hacia arriba la fila del ID y completa resultado final/estado. Si no existe, levanta error para no aparentar persistencia exitosa.

No hay claves ni IDs privados cableados en estos archivos; el ID del Sheet vive en propiedades del proyecto. La columna de variables contiene los datos del intake, así que el acceso al spreadsheet debe limitarse a personas autorizadas.

### `apps-script/Integrations.gs`

- `interpretWithN8n_(evaluation, modelInput)`: consulta `N8N_AGENT_URL` y `N8N_AGENT_TOKEN`; entrega el resumen que interpreta el agente. Aunque recibe `modelInput` por la firma, el payload actual no incluye esos 13 campos, solo datos generales del proyecto y resultado.
- `executeCrmWithN8n_(evaluation)`: consulta el webhook CRM opcional y manda la evaluación. Devuelve `NOT_CONFIGURED` cuando no existe URL; acepta estado y `recordId` del workflow. El secreto de HubSpot permanece en las credenciales de n8n.
- `postWebhook_(url, token, payload)`: helper HTTP común. Envía POST JSON, agrega Bearer si hay token, interpreta JSON y eleva error para códigos HTTP fuera de 200–299.

### `apps-script/ModelData.gs` y `ModelSmokeTest.gs`

- `ModelData.gs` define el objeto constante con versión, campos, rangos, vocabularios, parámetros numéricos y pesos. Se regenera con `scripts/export_apps_script_model.py`; no editar coeficientes manualmente.
- `testInstalledModel()` evalúa cuatro ejemplos de referencia y compara clases/probabilidades con Python. Imprime el error máximo y no escribe filas ni llama webhooks.

## Front-end: fuente Vite y HTML Service

### `frontend/src/main.js`

- `state`: estado de pantalla, filtros, loading, detalle seleccionado y origen de histórico.
- `projects`: datos pequeños de demostración que se usan para mostrar el prototipo local. Se reemplazan por el histórico conectado después de leer Sheets.
- `modelFields` y `contactFields`: catálogo de preguntas, tipos, defaults demostrativos, opciones internas en inglés y agrupación por paso. Las etiquetas/traducciones para el usuario se mantienen aparte.
- `optionLabels` y `fieldCopy`: mapas de labels en español e instrucciones que se muestran debajo de cada control. Los `value` de opciones se envían sin traducir para no cambiar la entrada del modelo.
- `esc(value)`: escapa caracteres HTML para reducir riesgo de insertar contenido de usuario como markup.
- `field(f)`: genera HTML de un control requerido, incluidos placeholder, ayuda y área de error.
- `render()` y las vistas `home`, `form`, `review`, `result`, `history`, `loading`: dibujan el estado actual de la aplicación. Mostrar un resultado no vuelve a calcular el modelo en el navegador.
- `valid(formEl)` / `capture()`: consultan validez HTML y copian valores actuales a los campos en memoria. El servidor vuelve a validar todo.
- `gasRequest(method, payload)`: puente Promise con `google.script.run`. Se permiten las operaciones `submitEvaluation` y `listEvaluations` y se gestionan callbacks de éxito/error.
- `historyRow(e)` / `loadHistory()`: convierten el objeto del servidor al formato de tabla y recuperan datos reales. Si la consulta falla, la vista avisa y deja el modo demo; no inventa una confirmación real.
- `evaluate()`: prepara los inputs, muestra loading y, cuando existe Apps Script, manda metadata + `modelInput`; muestra el objeto devuelto. Sin `google.script.run`, genera una evaluación marcada como demo con riesgo fijo `High`: esta rama es únicamente visual, no predice.
- Los listeners `click`, `submit`, `input`, `change` y `focusout`: implementan navegación, controles por paso, filtros de tabla, submit y mensajes de validación. Mantenerlos separados evita colocar lógica del modelo en el navegador.

### `frontend/src/model-input.js`

- `buildModelInput(fields)`: toma el catálogo de los 13 campos, rechaza vacíos, castea inputs numéricos y conserva los valores de categoría en inglés. No aprende ni clasifica; solo construye el payload esperado por Apps Script.

### Archivos HTML generados de Apps Script

- `apps-script/Index.html` monta el contenedor y los archivos `Styles`/`Client` mediante HTML Service.
- `apps-script/Client.html` y `apps-script/Styles.html` son bundles que produce `pnpm build`. No hacerles cambios a mano: Vite puede sobrescribirlos.
- `apps-script/scripts/sync-build.mjs` copia el bundle CSS y JS del directorio `apps-script/build/` a esos dos HTML.

## Dónde vive el agente y dónde vive la predicción

La llamada al **agente** está en `Integrations.gs → interpretWithN8n_ → postWebhook_`. Usa Apps Script `UrlFetchApp`; llega a n8n solo si `N8N_AGENT_URL` está configurada. El agente recibe una predicción existente para redactar una lectura puntual. No debe inventar/cambiar la clase.

La **predicción** está en `Model.gs → predictRisk_`, invocada desde `Code.gs → submitEvaluation`. Se hace localmente dentro del runtime V8 de Apps Script. El agente no predice; n8n no es necesario para inferir. El workflow de CRM es una segunda llamada opcional, no el agente de interpretación.

## Ciclo de actualización recomendado

1. `clasp pull` para obtener lo que está desplegado/en el editor como fuente remota.
2. Modificar `frontend/src/` para la UI, o `apps-script/*.gs` para lógica servidor.
3. `pnpm build` si se modificó la UI, para rearmar HTML embebido.
4. Revisar cambios y ejecutar `pnpm test:model` cuando se altere la inferencia.
5. `clasp push`, revisar/guardar y actualizar la implementación de web app desde el editor.

El repositorio excluye `.clasp.json` y `.clasprc.json`; estos contienen identificador de proyecto o credenciales. No versionar Script Properties ni tokens.
